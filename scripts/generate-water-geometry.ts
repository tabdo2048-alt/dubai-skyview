// OSM-based Dubai water-geometry generator.
//
// Rebuilds src/lib/coastline.generated.ts entirely from real OpenStreetMap
// data (© OpenStreetMap contributors, ODbL) fetched via the Overpass API, so
// the animated water in the 3D map covers the ENTIRE sea inside the map bounds,
// clipped exactly to the real coastline + islands, with Marina / Creek / Canal
// and a calm Palm lagoon as separate lower-intensity basins.
//
// Pipeline (all gated — any failed probe throws and exits non-zero):
//   1. Fetch (cache-first) the Overpass responses into scripts/.cache/.
//   2. Stitch natural=coastline ways into closed land polygons (land on the
//      LEFT of way direction; open chains closed along the coverage-rect edge).
//   3. Union land + real islands. Simplify (frond detail preserved).
//   4. Regenerate the marina / creek / canal basin rings from their relations.
//   5. Derive the calm Palm-lagoon water (crescent-enclosed) + frond holes.
//   6. sea = difference(coverageRect, union(land, marina, creek, canal, lagoon)).
//   7. Foam polylines = real coastline segments, clipped to named windows.
//   8. Emit src/lib/coastline.generated.ts.
//
// Run (repo root):  npm run generate:water   (re-fetch with --refresh)
//
// This script is bundled by esbuild and run under node (see package.json); it
// uses only node built-ins + @turf/turf + osmtogeojson, with relative imports
// (tsconfig excludes scripts/).

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Overpass JSON is untyped */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, Position } from "geojson";
import osmtogeojson from "osmtogeojson";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type LngLat = [number, number];

const REFRESH = process.argv.includes("--refresh");

// The map's maxBounds (dubai.ts DUBAI_BOUNDS: S24.79 / W54.89 / N25.55 / E55.65).
const DUBAI_BOUNDS = { west: 54.89, south: 24.79, east: 55.65, north: 25.55 };

// Coverage rectangle — DUBAI_BOUNDS padded by 50% of its width/height on every
// side so the animated water mesh reaches well past maxBounds. (The pitched
// camera can see even farther toward the horizon; that far field is covered by
// tinting the basemap's own water to the sea colour in MapboxView, so nothing
// beyond COVER shows black.) The coastline is fetched across this same bbox so
// real desert (Abu Dhabi/Sharjah) is still excluded as land.
const COVERAGE = { west: 54.51, south: 24.41, east: 56.03, north: 25.93 };
const COVERAGE_RECT: LngLat[] = [
  [COVERAGE.west, COVERAGE.south],
  [COVERAGE.east, COVERAGE.south],
  [COVERAGE.east, COVERAGE.north],
  [COVERAGE.west, COVERAGE.north],
  [COVERAGE.west, COVERAGE.south],
];

// Overpass bbox order is (south, west, north, east).
const BBOX = `${COVERAGE.south},${COVERAGE.west},${COVERAGE.north},${COVERAGE.east}`;

// NB: overpass.osm.ch is a Switzerland-region extract (returns 0 elements for
// Dubai) — do not use it. The main instance + kumi cover the planet.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Overpass mirrors reject anonymous clients (429/406) — send a meaningful
// User-Agent identifying this generator, per the Overpass usage policy.
const USER_AGENT = "dubai-skyview-water-generator/1.0 (OSM water geometry build)";

// Real OSM feature ids for the three basins (verified in the prior generation).
const MARINA_REL = 6200028; // leisure=marina, Dubai Marina
const CREEK_REL = 6525149; // Dubai Creek "خور دبي"
const CANAL_WAY = 532459082; // Dubai Water Canal / Business Bay

// npm runs scripts from the repo root, so resolve paths from process.cwd()
// (the bundled cjs lives in .output/, so __dirname would be wrong here).
const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, "scripts", ".cache");
const OUT_FILE = join(REPO_ROOT, "src", "lib", "coastline.generated.ts");

// ---------------------------------------------------------------------------
// Overpass fetch + cache
// ---------------------------------------------------------------------------

async function overpass(name: string, query: string): Promise<any> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${name}.json`);
  if (!REFRESH && existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 2; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const json = await res.json();
      // A 200 with empty elements means a wrong-region mirror or a silent
      // server error — never cache it; fall through to the next mirror.
      if (!json.elements || json.elements.length === 0) {
        throw new Error(`empty elements from ${url}`);
      }
      writeFileSync(cacheFile, JSON.stringify(json));
      console.log(`  fetched ${name} (${json.elements?.length ?? 0} elements) via ${url}`);
      return json;
    } catch (err) {
      lastErr = err;
      const backoff = 1500 * (attempt + 1);
      console.warn(`  ${name} attempt ${attempt + 1} failed (${String(err)}); retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error(`Overpass fetch failed for ${name}: ${String(lastErr)}`);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const EPS = 1e-7; // ~1 cm — endpoint match tolerance for stitching.

function samePoint(a: LngLat, b: LngLat): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

function ringIsClosed(ring: LngLat[]): boolean {
  return ring.length > 3 && samePoint(ring[0], ring[ring.length - 1]);
}

function closeRing(ring: LngLat[]): LngLat[] {
  return ringIsClosed(ring) ? ring : [...ring, ring[0]];
}

// Signed area (shoelace) in degree² — positive = counterclockwise.
function signedArea(ring: LngLat[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function toPolygon(ring: LngLat[]): Feature<Polygon> {
  return turf.polygon([closeRing(ring).map((p) => [p[0], p[1]] as Position)]);
}

// Simplify to cut vertex count (keeps map-scale shape) — the water meshes are
// earcut-triangulated + shore-refined at runtime, so raw OSM detail is wasted
// cost. ~9 m tolerance.
const SIMPLIFY_TOL = 0.00008;
function simplifyPoly(poly: Feature<Polygon>): Feature<Polygon> {
  try {
    const s = turf.simplify(poly, { tolerance: SIMPLIFY_TOL, highQuality: true }) as Feature<Polygon>;
    return s.geometry.coordinates[0].length >= 4 ? s : poly;
  } catch {
    return poly;
  }
}
function simplifyRing(ring: LngLat[]): LngLat[] {
  const s = simplifyPoly(toPolygon(ring));
  return s.geometry.coordinates[0].map((p) => [p[0], p[1]] as LngLat);
}

// Region-aware coast simplify: fine tolerance inside the Palm bbox (preserves
// the trunk neck), coarse elsewhere. Simplifying only the short in-Palm run
// keeps the closure ring's self-intersection count — and unkink cost — low.
const PALM_DETAIL_BBOX = { west: 55.1, south: 25.09, east: 55.16, north: 25.14 };
function regionSimplifyCoast(raw: LngLat[]): LngLat[] {
  const inPalm = (p: LngLat) =>
    p[0] >= PALM_DETAIL_BBOX.west &&
    p[0] <= PALM_DETAIL_BBOX.east &&
    p[1] >= PALM_DETAIL_BBOX.south &&
    p[1] <= PALM_DETAIL_BBOX.north;
  const simplifyRun = (run: LngLat[], tol: number): LngLat[] => {
    if (run.length < 3) return run;
    const s = turf.simplify(turf.lineString(run.map((p) => [p[0], p[1]] as Position)), {
      tolerance: tol,
      highQuality: true,
    });
    return s.geometry.coordinates.map((p) => [p[0], p[1]] as LngLat);
  };
  const out: LngLat[] = [];
  let run: LngLat[] = [raw[0]];
  let runPalm = inPalm(raw[0]);
  const flush = () => {
    const pts = simplifyRun(run, runPalm ? 0.00005 : 0.0004);
    if (out.length && samePoint(out[out.length - 1], pts[0])) out.push(...pts.slice(1));
    else out.push(...pts);
  };
  for (let i = 1; i < raw.length; i++) {
    if (inPalm(raw[i]) === runPalm) {
      run.push(raw[i]);
    } else {
      flush();
      run = [run[run.length - 1], raw[i]];
      runPalm = inPalm(raw[i]);
    }
  }
  flush();
  return out;
}

// Extract every outer ring (as LngLat[]) from a (Multi)Polygon feature.
function outerRings(feat: Feature<Polygon | MultiPolygon>): LngLat[][] {
  if (feat.geometry.type === "Polygon") {
    return [feat.geometry.coordinates[0].map((p) => [p[0], p[1]] as LngLat)];
  }
  return feat.geometry.coordinates.map((poly) => poly[0].map((p) => [p[0], p[1]] as LngLat));
}

// ---------------------------------------------------------------------------
// Coastline stitching → closed land polygons
// ---------------------------------------------------------------------------

function truncKey(p: LngLat): string {
  return `${Math.round(p[0] * 1e7) / 1e7},${Math.round(p[1] * 1e7) / 1e7}`;
}

// Orientation-preserving stitch (never reverses a segment). OSM coastline is
// wound with water on the right / land on the left; joining end-to-start only
// preserves that invariant, so the stitched chains stay simple (no bowties)
// and their winding is meaningful. A polyline whose ends meet is a closed
// island loop; otherwise it is an open chain that must be closed along the rect.
function stitchCoastline(osm: any): { closed: LngLat[][]; open: LngLat[][] } {
  const segments: LngLat[][] = [];
  for (const el of osm.elements ?? []) {
    if (el.type !== "way" || !el.geometry) continue;
    const line: LngLat[] = el.geometry.map(
      (g: any) => [Math.round(g.lon * 1e7) / 1e7, Math.round(g.lat * 1e7) / 1e7] as LngLat,
    );
    if (line.length >= 2) segments.push(line);
  }

  const byStart = new Map<string, number[]>();
  const byEnd = new Map<string, number[]>();
  segments.forEach((s, i) => {
    const sk = truncKey(s[0]);
    const ek = truncKey(s[s.length - 1]);
    (byStart.get(sk) ?? byStart.set(sk, []).get(sk)!).push(i);
    (byEnd.get(ek) ?? byEnd.set(ek, []).get(ek)!).push(i);
  });

  const used = new Array(segments.length).fill(false);
  const chains: LngLat[][] = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain = [...segments[i]];
    // Extend forward: append any unused way that STARTS at the chain's tail.
    for (;;) {
      const k = truncKey(chain[chain.length - 1]);
      const j = (byStart.get(k) ?? []).find((idx) => !used[idx]);
      if (j === undefined) break;
      used[j] = true;
      chain = chain.concat(segments[j].slice(1));
      if (truncKey(chain[0]) === truncKey(chain[chain.length - 1])) break; // closed
    }
    // Extend backward: prepend any unused way that ENDS at the chain's head.
    for (;;) {
      const k = truncKey(chain[0]);
      const j = (byEnd.get(k) ?? []).find((idx) => !used[idx]);
      if (j === undefined) break;
      used[j] = true;
      chain = segments[j].slice(0, -1).concat(chain);
      if (truncKey(chain[0]) === truncKey(chain[chain.length - 1])) break;
    }
    chains.push(chain);
  }

  const closed: LngLat[][] = [];
  const open: LngLat[][] = [];
  for (const chain of chains) {
    if (truncKey(chain[0]) === truncKey(chain[chain.length - 1])) closed.push(closeRing(chain));
    else open.push(chain);
  }
  return { closed, open };
}

// Coverage-rect perimeter walk, counterclockwise, for closing open chains.
// Corners in CCW order starting SW.
const RECT_CCW: LngLat[] = [
  [COVERAGE.west, COVERAGE.south],
  [COVERAGE.east, COVERAGE.south],
  [COVERAGE.east, COVERAGE.north],
  [COVERAGE.west, COVERAGE.north],
];

// Perimeter position (0..4) of a point on the rect boundary, CCW from SW.
function perimeterParam(p: LngLat): number {
  const { west, east, south, north } = COVERAGE;
  const onB = (v: number, edge: number) => Math.abs(v - edge) < 1e-6;
  if (onB(p[1], south)) return (p[0] - west) / (east - west); // bottom, 0..1
  if (onB(p[0], east)) return 1 + (p[1] - south) / (north - south); // right, 1..2
  if (onB(p[1], north)) return 2 + (east - p[0]) / (east - west); // top, 2..3
  if (onB(p[0], west)) return 3 + (north - p[1]) / (north - south); // left, 3..4
  // Nearest edge fallback.
  const dS = Math.abs(p[1] - south), dN = Math.abs(p[1] - north);
  const dW = Math.abs(p[0] - west), dE = Math.abs(p[0] - east);
  const m = Math.min(dS, dN, dW, dE);
  if (m === dS) return (p[0] - west) / (east - west);
  if (m === dE) return 1 + (p[1] - south) / (north - south);
  if (m === dN) return 2 + (east - p[0]) / (east - west);
  return 3 + (north - p[1]) / (north - south);
}

function pointAtParam(t: number): LngLat {
  const { west, east, south, north } = COVERAGE;
  const u = ((t % 4) + 4) % 4;
  if (u < 1) return [west + u * (east - west), south];
  if (u < 2) return [east, south + (u - 1) * (north - south)];
  if (u < 3) return [east - (u - 2) * (east - west), north];
  return [west, north - (u - 3) * (north - south)];
}

// True when a point lies on (within tol of) the coverage-rect boundary.
function onBoundary(p: LngLat, tol = 1e-6): boolean {
  const { west, east, south, north } = COVERAGE;
  return (
    Math.abs(p[0] - west) < tol ||
    Math.abs(p[0] - east) < tol ||
    Math.abs(p[1] - south) < tol ||
    Math.abs(p[1] - north) < tol
  );
}

// Snap a near-boundary point exactly onto the nearest rect edge (mutates it),
// so perimeter params and face rings close on an exact edge coordinate.
function snapToBoundary(p: LngLat) {
  const { west, east, south, north } = COVERAGE;
  const dW = Math.abs(p[0] - west);
  const dE = Math.abs(p[0] - east);
  const dS = Math.abs(p[1] - south);
  const dN = Math.abs(p[1] - north);
  const m = Math.min(dW, dE, dS, dN);
  if (m === dW) p[0] = west;
  else if (m === dE) p[0] = east;
  else if (m === dS) p[1] = south;
  else p[1] = north;
}

// Known inland anchor (Downtown Dubai) — the correct mainland land ring must
// contain it. Used to disambiguate the two possible perimeter closures.
const INLAND_ANCHOR: LngLat = [55.274, 25.197];

// Corner params (integers 0..3) strictly between fromT and toT, walking the
// rect perimeter in the given direction (ascending = CCW). Continuous param:
// the target is shifted by ±4 so the walk always moves monotonically.
function boundaryCorners(fromT: number, toT: number, ascending: boolean): LngLat[] {
  const pts: LngLat[] = [];
  if (ascending) {
    let target = toT;
    while (target <= fromT) target += 4;
    let c = Math.floor(fromT) + 1;
    while (c < target) {
      pts.push(pointAtParam(c));
      c += 1;
    }
  } else {
    let target = toT;
    while (target >= fromT) target -= 4;
    let c = Math.ceil(fromT) - 1;
    while (c > target) {
      pts.push(pointAtParam(c));
      c -= 1;
    }
  }
  return pts;
}

// Close one open chain into a land polygon by walking the rect perimeter from
// the chain's end back to its start. Two directions are possible; pick the one
// whose ring contains the inland anchor (the desert/city side), so the sea —
// built later by difference — is the water side.
function closeOpenChain(chain: LngLat[]): LngLat[] {
  // Clip chain to the coverage rect so its ends land exactly on the boundary.
  const clipped = clipLineToRect(chain);
  if (clipped.length < 2) return [];
  const start = clipped[0];
  const end = clipped[clipped.length - 1];
  const tStart = perimeterParam(start);
  const tEnd = perimeterParam(end);

  const ringAsc = closeRing([...clipped, ...boundaryCorners(tEnd, tStart, true), start]);
  const ringDesc = closeRing([...clipped, ...boundaryCorners(tEnd, tStart, false), start]);

  const anchor = turf.point(INLAND_ANCHOR);
  const offshore = turf.point([54.8, 25.4]);
  const ascInland = turf.booleanPointInPolygon(anchor, toPolygon(ringAsc));
  const descInland = turf.booleanPointInPolygon(anchor, toPolygon(ringDesc));
  const ascOffshore = turf.booleanPointInPolygon(offshore, toPolygon(ringAsc));
  const descOffshore = turf.booleanPointInPolygon(offshore, toPolygon(ringDesc));
  if (process.env.WATER_DEBUG) {
    console.log(
      `  [debug] closeChain tStart=${tStart.toFixed(3)} tEnd=${tEnd.toFixed(3)} clipped=${clipped.length}pts`,
    );
    console.log(
      `  [debug]   ringAsc area=${(turf.area(toPolygon(ringAsc)) / 1e6).toFixed(0)}km² inland=${ascInland} offshore=${ascOffshore} corners=${boundaryCorners(tEnd, tStart, true).length}`,
    );
    console.log(
      `  [debug]   ringDesc area=${(turf.area(toPolygon(ringDesc)) / 1e6).toFixed(0)}km² inland=${descInland} offshore=${descOffshore} corners=${boundaryCorners(tEnd, tStart, false).length}`,
    );
  }
  // The correct mainland ring contains the inland anchor and excludes deep sea.
  const ascGood = ascInland && !ascOffshore;
  const descGood = descInland && !descOffshore;
  if (ascGood && !descGood) return ringAsc;
  if (descGood && !ascGood) return ringDesc;
  // Fallback: prefer inland-containing, else smaller area.
  if (ascInland && !descInland) return ringAsc;
  if (descInland && !ascInland) return ringDesc;
  return turf.area(toPolygon(ringAsc)) <= turf.area(toPolygon(ringDesc)) ? ringAsc : ringDesc;
}

// Clip a polyline to the coverage rect using turf.bboxClip.
function clipLineToRect(line: LngLat[]): LngLat[] {
  const clipped = turf.bboxClip(
    turf.lineString(line.map((p) => [p[0], p[1]] as Position)),
    [COVERAGE.west, COVERAGE.south, COVERAGE.east, COVERAGE.north],
  );
  const g = clipped.geometry;
  if (!g) return [];
  if (g.type === "LineString") return g.coordinates.map((p) => [p[0], p[1]] as LngLat);
  if (g.type === "MultiLineString") {
    // Take the longest segment.
    let best: Position[] = [];
    for (const seg of g.coordinates) if (seg.length > best.length) best = seg;
    return best.map((p) => [p[0], p[1]] as LngLat);
  }
  return [];
}

// All segments of a polyline clipped to the rect (a chain that weaves in and
// out of the rect yields several). Each segment's endpoints lie on the rect
// boundary (where it crossed) or are original interior chain ends.
function clipLineToRectAll(line: LngLat[]): LngLat[][] {
  const clipped = turf.bboxClip(
    turf.lineString(line.map((p) => [p[0], p[1]] as Position)),
    [COVERAGE.west, COVERAGE.south, COVERAGE.east, COVERAGE.north],
  );
  const g = clipped.geometry;
  if (!g) return [];
  if (g.type === "LineString") return [g.coordinates.map((p) => [p[0], p[1]] as LngLat)];
  if (g.type === "MultiLineString")
    return g.coordinates.map((seg) => seg.map((p) => [p[0], p[1]] as LngLat));
  return [];
}

// ---------------------------------------------------------------------------
// Union / difference wrappers (turf v7 takes FeatureCollections)
// ---------------------------------------------------------------------------

function unionAll(polys: Feature<Polygon | MultiPolygon>[]): Feature<Polygon | MultiPolygon> {
  if (polys.length === 1) return polys[0];
  // turf v7 unions a whole FeatureCollection in one call — far faster than
  // folding 700+ polygons pairwise (each pairwise step re-copies the growing
  // multipolygon). Fall back to pairwise only if the batch call fails.
  try {
    const u = turf.union(turf.featureCollection(polys));
    if (u) return u;
  } catch {
    /* fall through to pairwise */
  }
  let acc = polys[0];
  for (let i = 1; i < polys.length; i++) {
    const u = turf.union(turf.featureCollection([acc, polys[i]]));
    if (u) acc = u;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Basin ring extraction from a relation/way response
// ---------------------------------------------------------------------------

function largestPolygonRings(osm: any): { outer: LngLat[]; holes: LngLat[][] } {
  const gj = osmtogeojson(osm);
  let best: Feature<Polygon> | null = null;
  let bestArea = 0;
  for (const f of gj.features) {
    const geom = f.geometry;
    if (!geom) continue;
    const polys: Feature<Polygon>[] = [];
    if (geom.type === "Polygon") polys.push(f as Feature<Polygon>);
    else if (geom.type === "MultiPolygon") {
      for (const coords of geom.coordinates) polys.push(turf.polygon(coords));
    }
    for (const p of polys) {
      const a = turf.area(p);
      if (a > bestArea) {
        bestArea = a;
        best = p;
      }
    }
  }
  if (!best) throw new Error("no polygon in basin response");
  const rings = best.geometry.coordinates;
  return {
    outer: rings[0].map((p) => [p[0], p[1]] as LngLat),
    holes: rings.slice(1).map((r) => r.map((p) => [p[0], p[1]] as LngLat)),
  };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function fmtRing(ring: LngLat[]): string {
  return (
    "[\n" +
    ring.map((p) => `  [${round(p[0])}, ${round(p[1])}],`).join("\n") +
    "\n]"
  );
}
function fmtRings(rings: LngLat[][]): string {
  return "[\n" + rings.map((r) => indent(fmtRing(r))).map((s) => s + ",").join("\n") + "\n]";
}
function indent(s: string): string {
  return s.split("\n").map((l) => "  " + l).join("\n");
}
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function assertProbe(name: string, cond: boolean) {
  if (!cond) throw new Error(`GATE FAILED: ${name}`);
  console.log(`  gate ok: ${name}`);
}

function pointInRings(p: LngLat, outer: LngLat[], holes: LngLat[][]): boolean {
  const pt = turf.point(p);
  if (!turf.booleanPointInPolygon(pt, toPolygon(outer))) return false;
  for (const h of holes) if (turf.booleanPointInPolygon(pt, toPolygon(h))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching Overpass data (cache-first)…");

  const coastlineOsm = await overpass(
    "coastline",
    `[out:json][timeout:180];way["natural"="coastline"](${BBOX});out geom;`,
  );
  const islandsOsm = await overpass(
    "islands",
    `[out:json][timeout:180];(way["place"~"island|islet"](${BBOX});rel["place"~"island|islet"](${BBOX}););out geom;`,
  );
  const marinaOsm = await overpass(
    "marina",
    `[out:json][timeout:180];rel(${MARINA_REL});out geom;`,
  );
  const creekOsm = await overpass("creek", `[out:json][timeout:180];rel(${CREEK_REL});out geom;`);
  const canalOsm = await overpass("canal", `[out:json][timeout:180];way(${CANAL_WAY});out geom;`);

  console.log("Stitching coastline…");
  const { closed, open } = stitchCoastline(coastlineOsm);
  console.log(`  ${closed.length} closed loops, ${open.length} open chains`);
  if (process.env.WATER_DEBUG) {
    for (const o of open) {
      const km = turf.length(turf.lineString(o.map((p) => [p[0], p[1]] as Position)), {
        units: "kilometers",
      });
      console.log(
        `  [debug] open chain ${o.length}pts ${km.toFixed(1)}km bbox=${turf.bbox(turf.lineString(o.map((p) => [p[0], p[1]] as Position))).map((n) => n.toFixed(3)).join(",")}`,
      );
    }
    const bigClosed = closed
      .map((r) => ({ r, a: turf.area(toPolygon(r)) }))
      .sort((x, y) => y.a - x.a)
      .slice(0, 5);
    for (const { r, a } of bigClosed) {
      console.log(
        `  [debug] closed loop ${(a / 1e6).toFixed(1)}km² ${r.length}pts bbox=${turf.bbox(toPolygon(r)).map((n) => n.toFixed(3)).join(",")}`,
      );
    }
  }

  // --- Orientation-preserving perimeter closure (Fable-designed) -------------
  // Close each open mainland chain into a land polygon by walking the rect
  // perimeter between its endpoints in a single globally calibrated direction.
  // The non-reversing stitch keeps chains simple, so the two walk directions
  // give two valid complementary partitions; the inland/sea anchors pick which
  // direction encloses land. land = mainland ∪ islands; sea = rect − land.
  console.log("Extracting basins…");
  const marina = largestPolygonRings(marinaOsm);
  const creek = largestPolygonRings(creekOsm);
  const canal = largestPolygonRings(canalOsm);

  console.log("Building land by perimeter closure…");
  const rectPoly = toPolygon(COVERAGE_RECT);
  const RECT_AREA = turf.area(rectPoly);
  // Clearly-open-Gulf points (NW/N/W of the coast) for picking the sea side of
  // each chain closure and the main sea component. Kept away from the Sharjah/
  // RAK coast, which the enlarged rect now reaches.
  const SEA_ANCHORS: LngLat[] = [
    [55.05, 25.15],
    [54.95, 25.3],
    [55.25, 25.35],
    [54.88, 25.57],
    [54.6, 25.8],
  ];
  // Deep-desert anchors, well inland of the coast and clear of the creek/canal
  // loops — unambiguous land for calibrating the mainland closure.
  const INLAND_ANCHORS: LngLat[] = [
    [55.45, 25.15],
    [55.4, 25.35],
    [55.5, 25.0],
  ];

  type OpenChain = { coords: LngLat[]; tStart: number; tEnd: number };
  const openChains: OpenChain[] = [];
  // A single OSM coastline chain can weave in and out of the (smaller) rect, so
  // take every clipped segment, not just the longest — each boundary-to-boundary
  // segment is its own cut and they close together.
  for (const ch of open) {
    const segs = clipLineToRectAll(ch);
    if (process.env.WATER_DEBUG) {
      console.log(`  [debug] clip → ${segs.length} segments`);
      for (const c of segs) {
        const km = turf.length(turf.lineString(c.map((p) => [p[0], p[1]] as Position)), {
          units: "kilometers",
        });
        console.log(
          `  [debug]   seg ${c.length}pts ${km.toFixed(1)}km ends ${JSON.stringify(c[0].map((n) => +n.toFixed(4)))}(${onBoundary(c[0], 1e-4) ? "B" : "i"})→${JSON.stringify(c[c.length - 1].map((n) => +n.toFixed(4)))}(${onBoundary(c[c.length - 1], 1e-4) ? "B" : "i"})`,
        );
      }
    }
    for (const cRaw of segs) {
      if (cRaw.length < 2) continue;
      // Simplify the mainland coast before closing it: the closure ring of a
      // 500 km, 14 k-point coast self-intersects everywhere and unkink can't
      // recover the desert cleanly. Region-aware: keep FINE detail only inside
      // the Palm Jumeirah bbox (so the narrow trunk/mainland neck survives and
      // the sea doesn't paint the trunk base) and coarse elsewhere, where
      // frond-scale detail is carried by separate island loops. Fine detail on
      // only the short Palm run keeps unkink tractable.
      const c: LngLat[] = regionSimplifyCoast(cRaw);
      if (c.length < 2) continue;
      const lenKm = turf.length(turf.lineString(c.map((p) => [p[0], p[1]] as Position)), {
        units: "kilometers",
      });
      const startNear = onBoundary(c[0], 1e-4);
      const endNear = onBoundary(c[c.length - 1], 1e-4);
      if (!startNear || !endNear) {
        if (lenKm < 2) continue; // tiny interior fragment — drop as artifact
        throw new Error(
          `open coast chain (${lenKm.toFixed(1)}km) endpoint not on boundary: ${JSON.stringify(c[0])} / ${JSON.stringify(c[c.length - 1])}`,
        );
      }
      snapToBoundary(c[0]);
      snapToBoundary(c[c.length - 1]);
      openChains.push({
        coords: c,
        tStart: perimeterParam(c[0]),
        tEnd: perimeterParam(c[c.length - 1]),
      });
    }
  }
  if (openChains.length === 0) throw new Error("no open mainland chains after clipping");
  if (process.env.WATER_DEBUG) {
    console.log(
      `  ${openChains.length} open chains: ${openChains.map((c) => `${c.tStart.toFixed(2)}→${c.tEnd.toFixed(2)}`).join(", ")}`,
    );
  }

  // A convoluted coast makes the closed land ring self-intersect, so PIP on it
  // is unreliable. Clean + unkink each ring into simple sub-polygons, union them.
  const ringToUnion = (r: LngLat[]): Feature<Polygon | MultiPolygon> => {
    let poly: Feature<Polygon>;
    try {
      poly = turf.cleanCoords(toPolygon(r)) as Feature<Polygon>;
    } catch {
      poly = toPolygon(r);
    }
    if (turf.kinks(poly).features.length === 0) return poly;
    const parts = turf.unkinkPolygon(poly).features as Feature<Polygon>[];
    return unionAll(parts);
  };

  // Deep-Gulf anchors, well away from any shoreline — true land can never
  // contain one, so they detect a closure that engulfed the sea.
  const DEEP_SEA: LngLat[] = [
    [54.95, 25.45],
    [55.0, 25.2],
    [55.15, 25.5],
  ];
  // Close each chain against the rect boundary. Primary signal: OSM land-on-left
  // ⟺ the CCW closure (signed area > 0) is land. Override only when that closure
  // engulfs a deep-sea anchor (a boundary-clip piece whose orientation flipped).
  const landUnionForChain = (chain: OpenChain): Feature<Polygon | MultiPolygon> => {
    const ringAsc = closeRing([
      ...chain.coords,
      ...boundaryCorners(chain.tEnd, chain.tStart, true),
      chain.coords[0],
    ]);
    const ringDesc = closeRing([
      ...chain.coords,
      ...boundaryCorners(chain.tEnd, chain.tStart, false),
      chain.coords[0],
    ]);
    const primary = signedArea(ringAsc) > 0 ? ringAsc : ringDesc;
    const other = primary === ringAsc ? ringDesc : ringAsc;
    let u = ringToUnion(primary);
    if (DEEP_SEA.some((p) => turf.booleanPointInPolygon(turf.point(p), u))) {
      u = ringToUnion(other);
    }
    return u;
  };

  const mainlandUnion = unionAll(openChains.map(landUnionForChain));
  const inlOk = INLAND_ANCHORS.every((p) =>
    turf.booleanPointInPolygon(turf.point(p), mainlandUnion),
  );
  const seaBad = DEEP_SEA.some((p) => turf.booleanPointInPolygon(turf.point(p), mainlandUnion));
  if (process.env.WATER_DEBUG) {
    console.log(
      `  [debug] mainland area=${(turf.area(mainlandUnion) / 1e6).toFixed(0)}km² inlandOk=${inlOk} seaBad=${seaBad}`,
    );
    console.log(
      `  [debug] inland in-land: ${INLAND_ANCHORS.map((p) => `${JSON.stringify(p)}=${turf.booleanPointInPolygon(turf.point(p), mainlandUnion)}`).join(" ")}`,
    );
  }
  if (!inlOk || seaBad) {
    throw new Error(`mainland closure failed anchors: inlandOk=${inlOk} seaBad=${seaBad}`);
  }

  // Islands (closed coastline loops + place=island polys) → holes in the sea.
  console.log("Collecting islands…");
  const islandPolys: Feature<Polygon>[] = [];
  const inRect = (b: number[]) =>
    b[2] >= COVERAGE.west && b[0] <= COVERAGE.east && b[3] >= COVERAGE.south && b[1] <= COVERAGE.north;
  // Minimum island area to keep as a hole. Tiny islets (e.g. the ~300 sub-
  // islands of The World) are invisible at map scale but each adds an earcut
  // hole + shore-refined subdivision, which together blow up the open-sea mesh
  // build (it hangs the main thread). Drop them; keep real landmasks.
  const MIN_ISLAND_AREA = 40_000; // m² (~200 m across)
  const addIsland = (poly: Feature<Polygon>) => {
    if (!inRect(turf.bbox(poly))) return; // outside the (shrunk) rect
    const a = turf.area(poly);
    if (a < MIN_ISLAND_AREA) return;
    if (a > 0.05 * RECT_AREA) {
      throw new Error(`giant island loop ${(a / 1e6).toFixed(0)}km² — likely mis-stitched mainland`);
    }
    islandPolys.push(simplifyPoly(poly));
  };
  for (const ring of closed) {
    if (ring.length < 4) continue;
    addIsland(turf.cleanCoords(toPolygon(ring)) as Feature<Polygon>);
  }
  const islandGj = osmtogeojson(islandsOsm);
  for (const f of islandGj.features) {
    if (f.geometry?.type === "Polygon") addIsland(turf.polygon(f.geometry.coordinates));
    else if (f.geometry?.type === "MultiPolygon") {
      for (const c of f.geometry.coordinates) addIsland(turf.polygon(c));
    }
  }

  console.log(`Assembling land (${islandPolys.length} islands) + differencing sea…`);
  const land = unionAll([mainlandUnion, ...islandPolys]);
  const basinUnion = unionAll([toPolygon(marina.outer), toPolygon(creek.outer), toPolygon(canal.outer)]);
  let sea: Feature<Polygon | MultiPolygon> =
    turf.difference(turf.featureCollection([rectPoly, unionAll([land, basinUnion])])) ?? rectPoly;

  // Palm lagoon: sheltered water inside the crescent, carved out of the sea so
  // the two water surfaces are disjoint (no coplanar z-fighting). The straight
  // bbox edges where the lagoon meets open sea are the accepted, foam-suppressed
  // water-water seam at the crescent openings.
  // Tight to the crescent interior so the lagoon does not swallow the open sea
  // south of the Palm (off JBR) or the trunk base — only the sheltered ring of
  // water between the crescent and the trunk/fronds.
  const PALM_BBOX = { west: 55.108, south: 25.101, east: 55.155, north: 25.132 };
  const palmRect = turf.bboxPolygon([PALM_BBOX.west, PALM_BBOX.south, PALM_BBOX.east, PALM_BBOX.north]);
  let palmLagoonRing: LngLat[] = [];
  let palmLagoonHoles: LngLat[][] = [];
  let lagoon = turf.intersect(turf.featureCollection([palmRect, sea]));
  // turf.intersect can drop the sea's island holes, so the Palm trunk/fronds
  // land leaks back into the lagoon. Explicitly re-subtract the full land
  // (mainland + islands) so no calm-water tongue paints the trunk base or fronds.
  if (lagoon) lagoon = turf.difference(turf.featureCollection([lagoon, land])) ?? lagoon;
  if (lagoon) {
    const parts: Position[][][] =
      lagoon.geometry.type === "Polygon"
        ? [lagoon.geometry.coordinates]
        : (lagoon.geometry as MultiPolygon).coordinates;
    let bestPoly = parts[0];
    let bestA = turf.area(turf.polygon(parts[0]));
    for (const poly of parts) {
      const a = turf.area(turf.polygon(poly));
      if (a > bestA) {
        bestA = a;
        bestPoly = poly;
      }
    }
    palmLagoonRing = bestPoly[0].map((p) => [p[0], p[1]] as LngLat);
    palmLagoonHoles = bestPoly.slice(1).map((r) => r.map((p) => [p[0], p[1]] as LngLat));
    // Carve the lagoon out of the sea.
    const carved = turf.difference(turf.featureCollection([sea, turf.polygon(bestPoly)]));
    if (carved) sea = carved;
  }

  // Main sea component = the part holding the most open-sea anchors.
  const seaParts: Position[][][] =
    sea.geometry.type === "Polygon" ? [sea.geometry.coordinates] : (sea.geometry as MultiPolygon).coordinates;
  let seaPoly = seaParts[0];
  let bestVotes = -1;
  for (const poly of seaParts) {
    const votes = SEA_ANCHORS.filter((p) =>
      turf.booleanPointInPolygon(turf.point(p), turf.polygon(poly)),
    ).length;
    if (votes > bestVotes) {
      bestVotes = votes;
      seaPoly = poly;
    }
  }
  const seaOuter: LngLat[] = simplifyRing(seaPoly[0].map((p) => [p[0], p[1]] as LngLat));
  // Drop hole slivers that simplify below a triangle; keep the rest simplified.
  const seaHoles: LngLat[][] = seaPoly
    .slice(1)
    .map((r) => simplifyRing(r.map((p) => [p[0], p[1]] as LngLat)))
    .filter((r) => r.length >= 4);

  if (palmLagoonRing.length < 4) {
    palmLagoonRing = [
      [PALM_BBOX.west, PALM_BBOX.south],
      [PALM_BBOX.east, PALM_BBOX.south],
      [PALM_BBOX.east, PALM_BBOX.north],
      [PALM_BBOX.west, PALM_BBOX.north],
      [PALM_BBOX.west, PALM_BBOX.south],
    ];
  }

  // -------------------------------------------------------------------------
  // Foam: real coastline polylines, clipped to named lat/lng windows.
  // -------------------------------------------------------------------------
  const allCoast: LngLat[][] = [...open.map(clipLineToRect), ...closed];
  const landWaterEdges = allCoast
    .filter((l) => l.length >= 2)
    .map((l) => {
      try {
        const s = turf.simplify(turf.lineString(l.map((p) => [p[0], p[1]] as Position)), {
          tolerance: SIMPLIFY_TOL,
          highQuality: true,
        });
        return s.geometry.coordinates.map((p) => [p[0], p[1]] as LngLat);
      } catch {
        return l;
      }
    })
    .filter((l) => l.length >= 2);

  function foamWindow(w: { west: number; south: number; east: number; north: number }): LngLat[] {
    // Concatenate coastline vertices inside the window, ordered by the longest
    // matching chain.
    let best: LngLat[] = [];
    for (const line of landWaterEdges) {
      const inside = line.filter(
        (p) => p[0] >= w.west && p[0] <= w.east && p[1] >= w.south && p[1] <= w.north,
      );
      if (inside.length > best.length) best = inside;
    }
    return best;
  }

  const JBR_BEACH_FOAM = foamWindow({ west: 55.11, south: 25.06, east: 55.16, north: 25.095 });
  const JUMEIRAH_BEACH_FOAM = foamWindow({ west: 55.14, south: 25.13, east: 55.28, north: 25.24 });
  const DEIRA_COAST_FOAM = foamWindow({ west: 55.26, south: 25.24, east: 55.38, north: 25.32 });
  const PALM_OUTER_FOAM = foamWindow({ west: 55.1, south: 25.1, east: 55.16, north: 25.135 });
  const PALM_FRONDS_FOAM = foamWindow({ west: 55.11, south: 25.1, east: 55.15, north: 25.125 });
  const CREEK_FOAM = foamWindow({ west: 55.31, south: 25.21, east: 55.35, north: 25.25 });

  // -------------------------------------------------------------------------
  // Gates
  // -------------------------------------------------------------------------
  console.log("Running gates…");
  // Sea fraction measured over DUBAI_BOUNDS (invariant to COVER resizes) — the
  // Emirate is roughly half Gulf. Only catches catastrophic land/sea inversion;
  // the corner probes below do the precision work.
  const dubaiRect = toPolygon([
    [DUBAI_BOUNDS.west, DUBAI_BOUNDS.south],
    [DUBAI_BOUNDS.east, DUBAI_BOUNDS.south],
    [DUBAI_BOUNDS.east, DUBAI_BOUNDS.north],
    [DUBAI_BOUNDS.west, DUBAI_BOUNDS.north],
    [DUBAI_BOUNDS.west, DUBAI_BOUNDS.south],
  ]);
  const seaPolyFeat = turf.polygon([
    closeRing(seaOuter).map((p) => [p[0], p[1]] as Position),
    ...seaHoles.map((h) => closeRing(h).map((p) => [p[0], p[1]] as Position)),
  ]);
  const seaInBounds = turf.intersect(turf.featureCollection([dubaiRect, seaPolyFeat]));
  const frac = (seaInBounds ? turf.area(seaInBounds) : 0) / turf.area(dubaiRect);
  assertProbe(`sea fraction of DUBAI_BOUNDS ${(frac * 100).toFixed(1)}% in [30,65]`, frac >= 0.3 && frac <= 0.65);

  const waterProbes: LngLat[] = [
    // Dubai open sea.
    [55.05, 25.15], [54.95, 25.3], [55.25, 25.35], [55.117, 25.14],
    [55.3, 25.45], [55.1, 25.1], [55.08, 25.12],
    // COVER open-Gulf edges (NW / N / W) — sea must reach the visible margin.
    [54.55, 25.89], [55.0, 25.89], [55.6, 25.89], [55.8, 25.89],
    [54.55, 25.3], [54.55, 24.95],
  ];
  for (const p of waterProbes) {
    assertProbe(`sea covers ${JSON.stringify(p)}`, pointInRings(p, seaOuter, seaHoles));
  }
  const landProbes: LngLat[] = [
    [55.27, 25.2], [55.36, 25.27], [55.139, 25.112], [55.152, 25.079], [55.132, 25.005],
    // COVER desert edges (S / E) must NOT be sea. SE corner is the blue-desert gate.
    [55.99, 24.45], [55.4, 24.45], [55.8, 24.45], [55.99, 24.9], [55.99, 25.4],
    [54.7, 24.45], [55.3, 24.9],
  ];
  for (const p of landProbes) {
    assertProbe(`land not sea ${JSON.stringify(p)}`, !pointInRings(p, seaOuter, seaHoles));
  }

  assertProbe("marina ring valid", turf.kinks(toPolygon(marina.outer)).features.length === 0);
  assertProbe("creek ring valid", turf.kinks(toPolygon(creek.outer)).features.length === 0);
  assertProbe("canal ring valid", turf.kinks(toPolygon(canal.outer)).features.length === 0);
  // Probe points taken from the validated navigation centerlines (same OSM
  // relations), so they sit mid-channel inside each basin ring.
  assertProbe("marina probe", turf.booleanPointInPolygon(turf.point([55.14036, 25.0795]), toPolygon(marina.outer)));
  assertProbe("creek probe", turf.booleanPointInPolygon(turf.point([55.34403, 25.213]), toPolygon(creek.outer)));
  assertProbe("canal probe", turf.booleanPointInPolygon(turf.point([55.26551, 25.18202]), toPolygon(canal.outer)));

  // -------------------------------------------------------------------------
  // Emit
  // -------------------------------------------------------------------------
  console.log(`Writing ${OUT_FILE}…`);
  const banner = `// AUTO-GENERATED — do not hand-edit. Real Dubai water geometry derived from
// OpenStreetMap (© OpenStreetMap contributors, ODbL) via the Overpass API,
// coverage bbox ${BBOX} (S,W,N,E), fetched ${new Date().toISOString().slice(0, 10)}.
// Sources: natural=coastline; place~island|islet; marina rel ${MARINA_REL};
// creek rel ${CREEK_REL}; canal way ${CANAL_WAY}.
// Pipeline: scripts/generate-water-geometry.ts. Rerun: npm run generate:water
//
// Sea is constructed by difference(coverageRect, union(land, marina, creek,
// canal)) so it covers the entire map bounds with no gaps and no double-cover.
// Coordinates are [lng, lat].
`;

  const body = `${banner}
export const SEA_OUTER_RING: [number, number][] = ${fmtRing(seaOuter)};

export const SEA_LAND_HOLES: [number, number][][] = ${fmtRings(seaHoles)};

export const PALM_LAGOON_RING: [number, number][] = ${fmtRing(palmLagoonRing)};

export const PALM_LAGOON_HOLES: [number, number][][] = ${fmtRings(palmLagoonHoles)};

export const MARINA_RING: [number, number][] = ${fmtRing(simplifyRing(marina.outer))};

export const CREEK_RING: [number, number][] = ${fmtRing(simplifyRing(creek.outer))};

export const CREEK_ISLAND_HOLES: [number, number][][] = ${fmtRings(creek.holes.map(simplifyRing).filter((r) => r.length >= 4))};

export const CANAL_RING: [number, number][] = ${fmtRing(simplifyRing(canal.outer))};

export const LAND_WATER_EDGES: [number, number][][] = ${fmtRings(landWaterEdges)};

export const JBR_BEACH_FOAM: [number, number][] = ${fmtRing(JBR_BEACH_FOAM)};

export const JUMEIRAH_BEACH_FOAM: [number, number][] = ${fmtRing(JUMEIRAH_BEACH_FOAM)};

export const DEIRA_COAST_FOAM: [number, number][] = ${fmtRing(DEIRA_COAST_FOAM)};

export const PALM_OUTER_FOAM: [number, number][] = ${fmtRing(PALM_OUTER_FOAM)};

export const PALM_FRONDS_FOAM: [number, number][] = ${fmtRing(PALM_FRONDS_FOAM)};

export const CREEK_FOAM: [number, number][] = ${fmtRing(CREEK_FOAM)};
`;

  writeFileSync(OUT_FILE, body);
  console.log("Done. Wrote coastline.generated.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
