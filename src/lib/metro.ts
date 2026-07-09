// Dubai Metro 2030 network — Red, Green, Blue (planned 2029) and future corridors.
// Coordinates are approximate real-world alignments [lng, lat] traced along the
// actual RTA routes. Good enough for a cinematic map, not survey-accurate.

export type MetroStation = {
  id: string;
  name: string;
  coord: [number, number]; // [lng, lat]
  interchange?: boolean;
};

// Visual/legend category — drives the premium palette and the guide grouping.
export type LineCategory = "red" | "green" | "blue" | "tram" | "future" | "train";

export type MetroLine = {
  id: string;
  name: string;
  color: string;
  // Full ordered polyline the train runs along.
  path: [number, number][];
  stations: MetroStation[];
  status: "operational" | "under-construction" | "planned-2030";
  // Assigned at build time (see applyCategory) — legend groups by this.
  category?: LineCategory;
};

// Premium line palette, keyed by category (matches the guide legend).
export const CATEGORY_COLORS: Record<LineCategory, string> = {
  red: "#E63946",
  green: "#2ECC71",
  blue: "#2D9CDB",
  tram: "#F2994A",
  future: "#B66DFF",
  train: "#F2C94C",
};

// Decide a line's category from its id/name/status. Regional/rail lines are
// tagged "train" by the caller; everything else maps by operational family.
function lineCategory(line: MetroLine, isTrain: boolean): LineCategory {
  if (isTrain) return "train";
  const key = `${line.id} ${line.name}`.toLowerCase();
  // The Dubai Tram gets its own orange category, distinct from the metro trunks.
  if (key.includes("tram")) return "tram";
  if (line.status === "operational") {
    if (key.includes("green")) return "green";
    if (key.includes("red")) return "red";
    // Any other currently-operational line reads as the red trunk visually.
    return "red";
  }
  if (line.status === "under-construction" || key.includes("blue")) return "blue";
  // Everything else (planned-2030 corridors, future concepts) → purple.
  return "future";
}

// Non-destructively recolor + tag a set of lines by category. The generated
// data file is never edited by hand; this runs on the imported lists instead.
function applyCategory(lines: MetroLine[], isTrain: boolean): MetroLine[] {
  return lines.map((line) => {
    const category = lineCategory(line, isTrain);
    return { ...line, category, color: CATEGORY_COLORS[category] };
  });
}

// Accurate Red / Green / Tram network, traced from the official RTA maps
// (station names in real travel order — see metroAccurate.ts). This replaces
// the old auto-generated KML import, which had scrambled order + placeholders.
import { ACCURATE_METRO_LINES } from "./metroAccurate";
import { IMPORTED_TRAIN_LINES } from "./metroNetwork.generated";

// Accurate RTA network (Red + Green + Tram), recolored + tagged by category.
export const METRO_LINES: MetroLine[] = applyCategory(ACCURATE_METRO_LINES, false);

// Separate regional train network, driven by its own "Train" toggle.
export const TRAIN_LINES: MetroLine[] = applyCategory(IMPORTED_TRAIN_LINES, true);

// Both networks combined — used for animation/progress bookkeeping.
export const ALL_RAIL_LINES: MetroLine[] = [...METRO_LINES, ...TRAIN_LINES];

export const METRO_LINE_BY_ID = Object.fromEntries(ALL_RAIL_LINES.map((l) => [l.id, l])) as Record<string, MetroLine>;

// Closest point on `path` to `coord`, expressed as a 0..1 fraction of the
// path's total length — used to know when the draw animation "reaches" a
// station so it can appear/pulse at the right moment.
function fractionAlongPathNearest(path: [number, number][], coord: [number, number]): number {
  const { cum, total } = pathLengthSegments(path);
  let best = { distSq: Infinity, dist: 0 };
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((coord[0] - ax) * dx + (coord[1] - ay) * dy) / lenSq));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const distSq = (coord[0] - px) ** 2 + (coord[1] - py) ** 2;
    if (distSq < best.distSq) {
      const segLen = Math.hypot(dx, dy);
      best = { distSq, dist: cum[i - 1] + segLen * t };
    }
  }
  return total > 0 ? best.dist / total : 0;
}

// Precomputed once at module load: for every line id, each station's 0..1
// position along that line's path, so the draw animation can reveal stations
// exactly as the line reaches them.
export const STATION_PROGRESS: Record<string, number> = {};
for (const line of ALL_RAIL_LINES) {
  for (const station of line.stations) {
    STATION_PROGRESS[station.id] = fractionAlongPathNearest(line.path, station.coord);
  }
}

// Total geodesic-ish length of a path in degrees, used to distribute the train.
export function pathLengthSegments(path: [number, number][]): { cum: number[]; total: number } {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    total += Math.hypot(bx - ax, by - ay);
    cum.push(total);
  }
  return { cum, total };
}

// Interpolate a position at fraction t (0..1) along the polyline. Returns
// { coord, bearing } so a train icon can face its direction of travel.
export function pointAlongPath(
  path: [number, number][],
  t: number,
): { coord: [number, number]; bearing: number } {
  const { cum, total } = pathLengthSegments(path);
  const target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= target) {
      const segStart = cum[i - 1];
      const segLen = cum[i] - segStart || 1e-9;
      const localT = (target - segStart) / segLen;
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      const coord: [number, number] = [ax + (bx - ax) * localT, ay + (by - ay) * localT];
      const bearing = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
      return { coord, bearing };
    }
  }
  const last = path[path.length - 1];
  return { coord: last, bearing: 0 };
}
