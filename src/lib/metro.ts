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
export type LineCategory = "red" | "green" | "blue" | "future" | "train";

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
  future: "#B66DFF",
  train: "#F2C94C",
};

// Decide a line's category from its id/name/status. Regional/rail lines are
// tagged "train" by the caller; everything else maps by operational family.
function lineCategory(line: MetroLine, isTrain: boolean): LineCategory {
  if (isTrain) return "train";
  const key = `${line.id} ${line.name}`.toLowerCase();
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

// Real RTA metro + regional train networks, generated from the reference data.
// (Type-only cycle: the generated module imports MetroLine as a type, so there
// is no runtime circular-value dependency.)
import { IMPORTED_METRO_LINES, IMPORTED_TRAIN_LINES } from "./metroNetwork.generated";

// --- Red Line (operational, Rashidiya → UAE Exchange / Expo 2020) ---
const RED: MetroLine = {
  id: "red",
  name: "Red Line",
  color: "#e2352b",
  status: "operational",
  path: [
    [55.3945, 25.2478], // Centrepoint (Rashidiya)
    [55.3712, 25.2530], // Emirates
    [55.3527, 25.2508], // Airport Terminal 3
    [55.3477, 25.2482], // Airport Terminal 1
    [55.3315, 25.2470], // GGICO
    [55.3202, 25.2440], // Deira City Centre
    [55.3120, 25.2382], // Al Rigga
    [55.3035, 25.2652], // Union (interchange)
    [55.2980, 25.2620], // BurJuman (interchange)
    [55.2890, 25.2430], // ADCB
    [55.2820, 25.2340], // Al Jafiliya
    [55.2760, 25.2260], // World Trade Centre
    [55.2720, 25.2180], // Emirates Towers
    [55.2700, 25.2100], // Financial Centre
    [55.2712, 25.2010], // Burj Khalifa / Dubai Mall
    [55.2640, 25.1880], // Business Bay
    [55.2510, 25.1720], // Onpassive (Noor Bank)
    [55.2360, 25.1560], // First Abu Dhabi Bank (Mall of the Emirates)
    [55.2205, 25.1420], // Mall of the Emirates
    [55.2050, 25.1300], // Mashreq (Dubai Internet City)
    [55.1900, 25.1150], // Sharaf DG (Al Barsha)
    [55.1770, 25.1030], // Dubai Marina (DMCC)
    [55.1620, 25.0900], // Jumeirah Lakes Towers
    [55.1400, 25.0700], // Nakheel Harbour & Tower
    [55.1180, 25.0480], // Ibn Battuta
    [55.0980, 25.0280], // Energy
    [55.0500, 24.9860], // Danube
    [55.0100, 24.9600], // UAE Exchange (Jebel Ali)
    [55.0000, 24.9400], // Expo 2020 (Route 2020)
  ],
  stations: [
    { id: "red-rashidiya", name: "Centrepoint", coord: [55.3945, 25.2478] },
    { id: "red-airport-t3", name: "Airport Terminal 3", coord: [55.3527, 25.2508] },
    { id: "red-union", name: "Union", coord: [55.3035, 25.2652], interchange: true },
    { id: "red-burjuman", name: "BurJuman", coord: [55.2980, 25.2620], interchange: true },
    { id: "red-wtc", name: "World Trade Centre", coord: [55.2760, 25.2260] },
    { id: "red-burj", name: "Burj Khalifa / Dubai Mall", coord: [55.2712, 25.2010], interchange: true },
    { id: "red-businessbay", name: "Business Bay", coord: [55.2640, 25.1880] },
    { id: "red-moe", name: "Mall of the Emirates", coord: [55.2205, 25.1420] },
    { id: "red-marina", name: "Dubai Marina (DMCC)", coord: [55.1770, 25.1030], interchange: true },
    { id: "red-jlt", name: "Jumeirah Lakes Towers", coord: [55.1620, 25.0900] },
    { id: "red-ibnbattuta", name: "Ibn Battuta", coord: [55.1180, 25.0480] },
    { id: "red-uaeexchange", name: "UAE Exchange", coord: [55.0100, 24.96] },
    { id: "red-expo", name: "Expo 2020", coord: [55.0, 24.94], interchange: true },
  ],
};

// --- Green Line (operational, Etisalat → Creek) ---
const GREEN: MetroLine = {
  id: "green",
  name: "Green Line",
  color: "#009c49",
  status: "operational",
  path: [
    [55.3760, 25.2960], // Etisalat
    [55.3650, 25.2900], // Al Qusais
    [55.3540, 25.2830], // Dubai Airport Free Zone
    [55.3450, 25.2790], // Al Nahda
    [55.3360, 25.2760], // Stadium
    [55.3280, 25.2720], // Al Qiyadah
    [55.3200, 25.2690], // Abu Hail
    [55.3120, 25.2710], // Abu Baker Al Siddique
    [55.3080, 25.2680], // Salah Al Din
    [55.3035, 25.2652], // Union (interchange)
    [55.2985, 25.2690], // Baniyas Square
    [55.2960, 25.2650], // Palm Deira
    [55.3005, 25.2600], // Al Ras
    [55.2980, 25.2620], // BurJuman (interchange)
    [55.3055, 25.2545], // Oud Metha
    [55.3110, 25.2470], // Dubai Healthcare City
    [55.3210, 25.2340], // Al Jadaf
    [55.3300, 25.2230], // Creek
  ],
  stations: [
    { id: "green-etisalat", name: "Etisalat", coord: [55.376, 25.296] },
    { id: "green-stadium", name: "Stadium", coord: [55.336, 25.276] },
    { id: "green-union", name: "Union", coord: [55.3035, 25.2652], interchange: true },
    { id: "green-baniyas", name: "Baniyas Square", coord: [55.2985, 25.269] },
    { id: "green-alras", name: "Al Ras", coord: [55.3005, 25.26] },
    { id: "green-burjuman", name: "BurJuman", coord: [55.298, 25.262], interchange: true },
    { id: "green-healthcare", name: "Dubai Healthcare City", coord: [55.311, 25.247] },
    { id: "green-creek", name: "Creek", coord: [55.33, 25.223] },
  ],
};

// --- Blue Line (under construction, opening 2029 — part of the 2030 plan) ---
const BLUE: MetroLine = {
  id: "blue",
  name: "Blue Line",
  color: "#1f6fe0",
  status: "under-construction",
  path: [
    [55.3035, 25.2652], // Creek / Union spur
    [55.3300, 25.2230], // Creek
    [55.3600, 25.2050], // Dubai Festival City
    [55.3900, 25.1900], // Ras Al Khor
    [55.4200, 25.1750], // International City 1
    [55.4350, 25.1650], // International City 2
    [55.4500, 25.1900], // Dubai Silicon Oasis
    [55.4650, 25.2100], // Academic City
    [55.4400, 25.2500], // Mirdif
    [55.4200, 25.2800], // Al Warqa
  ],
  stations: [
    { id: "blue-creek", name: "Creek", coord: [55.33, 25.223], interchange: true },
    { id: "blue-festivalcity", name: "Dubai Festival City", coord: [55.36, 25.205] },
    { id: "blue-intlcity", name: "International City", coord: [55.42, 25.175] },
    { id: "blue-silicon", name: "Dubai Silicon Oasis", coord: [55.45, 25.19] },
    { id: "blue-academic", name: "Academic City", coord: [55.465, 25.21] },
    { id: "blue-mirdif", name: "Mirdif", coord: [55.44, 25.25] },
  ],
};

// --- Future 2030 corridor (Purple Line concept — airport express) ---
const PURPLE: MetroLine = {
  id: "purple",
  name: "Purple Line (2030)",
  color: "#8b3fd6",
  status: "planned-2030",
  path: [
    [55.3527, 25.2508], // Dubai Intl Airport
    [55.3200, 25.2000], // Nad Al Sheba
    [55.2900, 25.1600], // Meydan
    [55.2600, 25.1200], // Al Quoz
    [55.2200, 25.0800], // Dubai Investment Park
    [55.1600, 25.0300], // Al Maktoum Airport
  ],
  stations: [
    { id: "purple-dxb", name: "Dubai Intl Airport", coord: [55.3527, 25.2508], interchange: true },
    { id: "purple-meydan", name: "Meydan", coord: [55.29, 25.16] },
    { id: "purple-alquoz", name: "Al Quoz", coord: [55.26, 25.12] },
    { id: "purple-dwc", name: "Al Maktoum Airport", coord: [55.16, 25.03], interchange: true },
  ],
};

// Full RTA network imported from the reference project (see
// scripts/convert-network.mjs). Falls back to the hand-authored lines above if
// the generated data is empty.
export const METRO_LINES: MetroLine[] = applyCategory(
  IMPORTED_METRO_LINES.length ? IMPORTED_METRO_LINES : [RED, GREEN, BLUE, PURPLE],
  false,
);

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
