// Etihad Rail (Train) — passenger-network line + stations builder.
//
// The reference is the UAE National Rail *passenger* network. Its exact track is
// not in public map data (OSM has only isolated station points, no line), so we
// construct the Dubai-visible segment as a smooth alignment through the real
// announced station locations, spanning the map SW edge -> Dubai (Jumeirah Golf
// Estates) -> Sharjah (University City) -> E edge (toward Al Dhaid / Fujairah).
//
// Anchor coordinates (lng, lat) — from OSM / Nominatim / Etihad Rail announcements:
//   Abu Dhabi passenger station   54.530, 24.334  (out of bounds, SW approach)
//   Dubai @ Jumeirah Golf Estates 55.1633, 25.0178 (in bounds — station marker)
//   Sharjah @ University City     55.486, 25.2997  (in bounds — station marker)
//   Al Dhaid                      55.8781, 25.2807 (out of bounds, E approach)
// The two out-of-bounds anchors only set the entry/exit bearing; the curve is
// clipped to DUBAI_BOUNDS so its first/last points land exactly on the map edges.
//
// Run (repo root):  npm run generate:rail
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as turf from "@turf/turf";

// Runtime camera bounds (must match src/lib/dubai.ts DUBAI_BOUNDS).
const DUBAI_BOUNDS = { west: 54.89, south: 24.79, east: 55.65, north: 25.55 };

const REPO_ROOT = process.cwd();
const OUT_FILE = join(REPO_ROOT, "src", "lib", "metroImported.generated.ts");

type Pt = [number, number];
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const lengthKm = (line: Pt[]) => turf.length(turf.lineString(line), { units: "kilometers" });

// Ordered W->E guide anchors (two out-of-bounds ends set entry/exit bearing).
const GUIDE: Pt[] = [
  [54.53, 24.334], // Abu Dhabi (out of bounds, sets SW entry bearing)
  [55.1633, 25.0178], // Dubai — Jumeirah Golf Estates (station)
  [55.486, 25.2997], // Sharjah — University City (station)
  [55.8781, 25.2807], // Al Dhaid (out of bounds, sets E exit bearing)
];

// In-bounds passenger stations to render as markers.
const STATIONS = [
  { id: "etihad-dubai", name: "Dubai — Jumeirah Golf Estates", coord: [55.1633, 25.0178] as Pt },
  { id: "etihad-sharjah", name: "Sharjah — University City", coord: [55.486, 25.2997] as Pt },
];

function clipToBounds(line: Pt[]): Pt[][] {
  const { west, south, east, north } = DUBAI_BOUNDS;
  const clipped = turf.bboxClip(turf.lineString(line), [west, south, east, north]);
  const pieces =
    clipped.geometry.type === "MultiLineString"
      ? (clipped.geometry.coordinates as Pt[][])
      : [clipped.geometry.coordinates as Pt[]];
  return pieces.filter((p) => p.length >= 2);
}

function dedupe(coords: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const c of coords) {
    const p = out[out.length - 1];
    if (!p || p[0] !== c[0] || p[1] !== c[1]) out.push(c);
  }
  return out;
}

function main() {
  // Smooth spline through the anchors. Lower sharpness = hugs the anchors more
  // tightly (less corner-rounding, less overshoot).
  const spline = turf.bezierSpline(turf.lineString(GUIDE), { resolution: 12000, sharpness: 0.7 });
  const curve = spline.geometry.coordinates as Pt[];

  // Clip to the map bounds; keep the piece spanning the most (edge to edge).
  const candidates = clipToBounds(curve);
  if (!candidates.length) throw new Error("clip produced no in-bounds line");
  candidates.sort(
    (a, b) =>
      turf.distance(turf.point(b[0]), turf.point(b[b.length - 1])) -
      turf.distance(turf.point(a[0]), turf.point(a[a.length - 1])),
  );
  let path = candidates[0];

  // Order SW -> NE so path[0] is the SW entry (train draws in that direction).
  if (path[0][0] > path[path.length - 1][0]) path = path.slice().reverse();

  // Light simplify + round.
  try {
    const s = turf.simplify(turf.lineString(path), { tolerance: 0.0002, highQuality: true });
    const sc = s.geometry.coordinates as Pt[];
    if (sc.length >= 2) path = sc;
  } catch {
    /* keep */
  }
  path = dedupe(path.map(([x, y]) => [round(x), round(y)] as Pt));

  // Snap each station exactly onto the line: insert its coord at the segment
  // nearest to it, so the station marker sits on the track (not floating off).
  for (const st of STATIONS) {
    const snap = turf.nearestPointOnLine(turf.lineString(path), turf.point(st.coord));
    const idx = snap.properties.index as number; // segment start index
    path.splice(idx + 1, 0, [round(st.coord[0]), round(st.coord[1])]);
  }
  path = dedupe(path);

  const first = path[0];
  const last = path[path.length - 1];
  console.log(`  path: ${path.length} pts, ${lengthKm(path).toFixed(1)} km`);
  console.log(`  first = [${first[0]}, ${first[1]}]  last = [${last[0]}, ${last[1]}]`);
  console.log(`  stations: ${STATIONS.map((s) => s.name).join(", ")}`);

  // Write the path AND stations into the etihad-rail entry.
  let src = readFileSync(OUT_FILE, "utf8");

  const pathText = "[\n" + path.map(([x, y]) => `      [${x}, ${y}],`).join("\n") + "\n    ]";
  const pathRe = /(id:\s*"etihad-rail"[\s\S]*?path:\s*)\[[\s\S]*?\n {4}\]/;
  if (!pathRe.test(src)) throw new Error("could not locate etihad-rail path array");
  src = src.replace(pathRe, `$1${pathText}`);

  const stationsText =
    "[\n" +
    STATIONS.map(
      (s) => `      { id: "${s.id}", name: "${s.name}", coord: [${s.coord[0]}, ${s.coord[1]}] },`,
    ).join("\n") +
    "\n    ]";
  const stRe = /(id:\s*"etihad-rail"[\s\S]*?stations:\s*)\[[\s\S]*?\n {4}\]/;
  if (!stRe.test(src)) throw new Error("could not locate etihad-rail stations array");
  src = src.replace(stRe, `$1${stationsText}`);

  writeFileSync(OUT_FILE, src);
  console.log(`Wrote path + ${STATIONS.length} stations into ${OUT_FILE}`);
}

main();
