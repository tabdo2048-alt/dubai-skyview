// OSM-based Etihad Rail (Train) centerline generator.
//
// Fetches the Etihad Rail main line (railway=rail, usage=main) around
// DUBAI_BOUNDS from Overpass, builds a graph of the rail vertices, and takes the
// SHORTEST PATH between the two farthest-apart nodes. Shortest-path follows a
// single track (it never zigzags between the two parallel tracks or onto
// crossover switches the way naive end-to-end stitching does), giving a clean
// single centerline. That line is then clipped to DUBAI_BOUNDS so its first and
// last points land exactly on the map edges, and written into the `etihad-rail`
// entry's `path` array in src/lib/metroImported.generated.ts.
//
// Why clip to bounds: the map camera is hard-locked to DUBAI_BOUNDS, so the line
// must enter/exit at the viewport border (no stopping short inside the view).
//
// Run (repo root):  npm run generate:rail   (add --refresh to re-fetch)

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Overpass JSON is untyped */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as turf from "@turf/turf";

const REFRESH = process.argv.includes("--refresh");

// Runtime camera bounds (must match src/lib/dubai.ts DUBAI_BOUNDS).
const DUBAI_BOUNDS = { west: 54.89, south: 24.79, east: 55.65, north: 25.55 };
// Fetch a little past the edges so the true alignment is captured before clip.
const MARGIN = 0.06;

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "dubai-skyview-rail-generator/1.0 (OSM Etihad Rail build)";

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, "scripts", ".cache");
const OUT_FILE = join(REPO_ROOT, "src", "lib", "metroImported.generated.ts");

type Pt = [number, number];

async function overpass(name: string, query: string): Promise<any> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${name}.json`);
  if (!REFRESH && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
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
      if (!json.elements || json.elements.length === 0) throw new Error(`empty from ${url}`);
      writeFileSync(cacheFile, JSON.stringify(json));
      console.log(`  fetched ${name} (${json.elements.length} ways) via ${url}`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`  ${name} attempt ${attempt} failed: ${(err as Error).message}`);
    }
  }
  throw lastErr;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;
const distKm = (a: Pt, b: Pt) => turf.distance(turf.point(a), turf.point(b), { units: "kilometers" });
const lengthKm = (line: Pt[]) => turf.length(turf.lineString(line), { units: "kilometers" });

function dedupe(coords: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const c of coords) {
    const p = out[out.length - 1];
    if (!p || p[0] !== c[0] || p[1] !== c[1]) out.push(c);
  }
  return out;
}

// --- Rail graph: nodes = rounded vertices, edges = consecutive way vertices. ---
class RailGraph {
  nodes: Pt[] = [];
  private idOf = new Map<string, number>();
  adj: { to: number; w: number }[][] = [];

  node(p: Pt): number {
    const k = `${p[0]},${p[1]}`;
    let i = this.idOf.get(k);
    if (i === undefined) {
      i = this.nodes.length;
      this.nodes.push(p);
      this.idOf.set(k, i);
      this.adj.push([]);
    }
    return i;
  }
  edge(a: number, b: number, w: number): void {
    this.adj[a].push({ to: b, w });
    this.adj[b].push({ to: a, w });
  }
}

// Dijkstra from `src`. Returns distances (km) and prev[] for reconstruction.
function dijkstra(g: RailGraph, src: number): { dist: number[]; prev: number[] } {
  const n = g.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[src] = 0;
  // Simple O(n^2) selection — n is a few hundred, plenty fast.
  for (let it = 0; it < n; it++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) ((best = dist[i]), (u = i));
    if (u === -1) break;
    done[u] = true;
    for (const { to, w } of g.adj[u]) {
      if (dist[u] + w < dist[to]) {
        dist[to] = dist[u] + w;
        prev[to] = u;
      }
    }
  }
  return { dist, prev };
}

// Clip a line to DUBAI_BOUNDS, returning every in-bounds piece (>= 2 pts).
function clipToBounds(line: Pt[]): Pt[][] {
  const { west, south, east, north } = DUBAI_BOUNDS;
  const clipped = turf.bboxClip(turf.lineString(line), [west, south, east, north]);
  const pieces =
    clipped.geometry.type === "MultiLineString"
      ? (clipped.geometry.coordinates as Pt[][])
      : [clipped.geometry.coordinates as Pt[]];
  return pieces.filter((p) => p.length >= 2);
}

async function main() {
  const { west, south, east, north } = DUBAI_BOUNDS;
  const bbox = `${south - MARGIN},${west - MARGIN},${north + MARGIN},${east + MARGIN}`;
  const query =
    `[out:json][timeout:180];` +
    `way["railway"="rail"]["usage"="main"](${bbox});` +
    `out geom;`;

  console.log("Fetching Etihad Rail from Overpass…");
  const osm = await overpass("etihad-rail", query);

  // Build the rail graph from the raw ways.
  const g = new RailGraph();
  let wayCount = 0;
  for (const el of osm.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const coords = dedupe(el.geometry.map((gg: any) => [round(gg.lon), round(gg.lat)] as Pt));
    if (coords.length < 2) continue;
    wayCount++;
    for (let k = 0; k + 1 < coords.length; k++) {
      const a = g.node(coords[k]);
      const b = g.node(coords[k + 1]);
      g.edge(a, b, distKm(coords[k], coords[k + 1]));
    }
  }
  console.log(`  ${wayCount} ways, ${g.nodes.length} graph nodes`);

  // Diameter endpoints (2-approx): farthest node from centroid = A, then the
  // graph-reachable node farthest (straight-line) from A = B.
  const cx = g.nodes.reduce((s, p) => s + p[0], 0) / g.nodes.length;
  const cy = g.nodes.reduce((s, p) => s + p[1], 0) / g.nodes.length;
  let A = 0;
  for (let i = 1; i < g.nodes.length; i++) {
    if (distKm(g.nodes[i], [cx, cy]) > distKm(g.nodes[A], [cx, cy])) A = i;
  }
  const { dist, prev } = dijkstra(g, A);
  let B = A;
  for (let i = 0; i < g.nodes.length; i++) {
    if (Number.isFinite(dist[i]) && distKm(g.nodes[i], g.nodes[A]) > distKm(g.nodes[B], g.nodes[A])) B = i;
  }

  // Reconstruct A -> B shortest path (single track, no zigzag).
  const idx: number[] = [];
  for (let v = B; v !== -1; v = prev[v]) idx.push(v);
  idx.reverse();
  let path = dedupe(idx.map((i) => g.nodes[i]));
  console.log(`  shortest track: ${path.length} pts, ${lengthKm(path).toFixed(1)} km`);

  // Clip to the exact map bounds so endpoints sit on the border; keep the piece
  // whose endpoints span the most (the through-line, not a stub).
  const candidates = clipToBounds(path);
  if (!candidates.length) throw new Error("clip produced no in-bounds line");
  candidates.sort((a, b) => distKm(b[0], b[b.length - 1]) - distKm(a[0], a[a.length - 1]));
  path = candidates[0];

  // Order SW -> NE so path[0] is the SW entry (train draws in that direction).
  if (path[0][0] > path[path.length - 1][0]) path = path.slice().reverse();

  // Simplify + round.
  try {
    const s = turf.simplify(turf.lineString(path), { tolerance: 0.00008, highQuality: false });
    const sc = s.geometry.coordinates as Pt[];
    if (sc.length >= 2) path = sc;
  } catch {
    /* keep unsimplified */
  }
  path = dedupe(path.map(([x, y]) => [round(x), round(y)] as Pt));

  const first = path[0];
  const last = path[path.length - 1];
  console.log(`  final path: ${path.length} pts, ${lengthKm(path).toFixed(1)} km`);
  console.log(`  first = [${first[0]}, ${first[1]}]  last = [${last[0]}, ${last[1]}]`);

  // Write the coords into the etihad-rail entry's `path` array only.
  const src = readFileSync(OUT_FILE, "utf8");
  const arrayText =
    "[\n" + path.map(([x, y]) => `      [${x}, ${y}],`).join("\n") + "\n    ]";
  const re = /(id:\s*"etihad-rail"[\s\S]*?path:\s*)\[[\s\S]*?\n {4}\]/;
  if (!re.test(src)) throw new Error("could not locate etihad-rail path array in " + OUT_FILE);
  const next = src.replace(re, `$1${arrayText}`);
  writeFileSync(OUT_FILE, next);
  console.log(`Wrote path into ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
