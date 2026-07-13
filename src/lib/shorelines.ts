// Dubai coastline paths for animated white shoreline foam lines.
// These are real coastlines traced from satellite imagery — NOT artificial
// polygon closures or open-sea boundaries. Each path represents an actual
// beach, marina wall, or creek bank where foam waves appear.
//
// Coordinates are [lng, lat], densely sampled for smooth curves.

import { JUMEIRAH_BEACH_FOAM, DEIRA_COAST_FOAM, JBR_BEACH_FOAM } from "@/lib/coastline.generated";

export type ShorelinePath = {
  id: string;
  name: string;
  // Ordered real coastline polyline. It never includes an artificial closing edge.
  points: [number, number][];
  // Direction from the shoreline toward water in local map coordinates.
  waterSide: 1 | -1;
  // Metres from the traced coast to the innermost foam ribbon.
  offsetMeters: number;
  // Intensity multiplier for foam brightness (1 = exposed coast, lower = protected water).
  intensity: number;
  // Caps how far offshore ribbons are allowed to reach for this path, in
  // metres from the traced coast. Narrow, curving basins (creek banks, Palm
  // frond canals) are often narrower than the full open-coast ribbon spread
  // (offsetMeters + widest SHORE_RIBBON_OFFSETS + half width, ~58m) — probing
  // that far can overshoot past the opposite bank/frond onto land or miss
  // water entirely on a tight bend. Defaults to unlimited (open coast).
  maxReachMeters?: number;
};

// JBR beachfront — the real seaward beach strip between the two Dubai Marina
// entrance channels (OSM-derived; the stylized marina arc it replaced sat
// ~800 m inland of the actual beach).
export const MARINA_BEACH_SHORELINE: ShorelinePath = {
  id: "marina-beach",
  name: "Marina Beach & JBR Waterfront",
  intensity: 1.08,
  waterSide: 1,
  offsetMeters: 8,
  points: JBR_BEACH_FOAM,
};

// Palm Jumeirah outer crescent — exposed to open Gulf. The crescent's tip
// curves sharply (real OSM trace), so the outermost ribbon ring is capped to
// avoid the direction probe overshooting past the curve onto the breakwater.
export const PALM_OUTER_SHORELINE: ShorelinePath = {
  id: "palm-outer",
  name: "Palm Jumeirah Outer Crescent",
  intensity: 1.2,
  waterSide: 1,
  offsetMeters: 8,
  maxReachMeters: 48,
  points: [
    [55.1048, 25.1278], // North tip
    [55.1078, 25.1289],
    [55.1109, 25.1298],
    [55.1141, 25.1304],
    [55.1173, 25.1308],
    [55.1205, 25.131],
    [55.1237, 25.131],
    [55.1269, 25.1308],
    [55.1301, 25.1304],
    [55.1332, 25.1298],
    [55.1363, 25.129],
    [55.1393, 25.128],
    [55.1422, 25.1268],
    [55.1449, 25.1254],
    [55.1475, 25.1238],
    [55.1498, 25.122],
    [55.1519, 25.12],
    [55.1537, 25.1178],
    [55.1552, 25.1154],
    [55.1564, 25.1128],
    [55.1572, 25.11],
    [55.1577, 25.107],
    [55.1577, 25.1039], // South tip
  ],
};

// Palm fronds — the radial canals with inner-lagoon shorelines (calmer water).
// The frond canals are much narrower than the open coast, so ribbons are
// capped to stay inside the canal instead of probing/drawing clear across to
// the neighboring frond or the trunk.
export const PALM_FRONDS_SHORELINE: ShorelinePath = {
  id: "palm-fronds",
  name: "Palm Jumeirah Inner Fronds",
  intensity: 0.95,
  waterSide: 1,
  offsetMeters: 5,
  maxReachMeters: 44,
  points: [
    [55.1185, 25.108], // West frond inner
    [55.1205, 25.1095],
    [55.1225, 25.1109],
    [55.1245, 25.1122],
    [55.1265, 25.1134],
    [55.1285, 25.1145],
    [55.1305, 25.1155],
    [55.1325, 25.1164],
    [55.1345, 25.1172],
    [55.1365, 25.1179],
    [55.1385, 25.1185],
    [55.1404, 25.119],
    [55.1423, 25.1194],
    [55.1441, 25.1197],
    [55.1458, 25.1198], // Central lagoon
  ],
};

// Dubai Creek — narrow tidal estuary, subtle waves. The channel is only
// ~100-140m bank-to-bank and curves tightly, so ribbons are capped well short
// of the open-coast spread to avoid probing/drawing past the opposite bank.
export const CREEK_SHORELINE: ShorelinePath = {
  id: "creek",
  name: "Dubai Creek Banks",
  intensity: 0.95,
  waterSide: -1,
  offsetMeters: 7,
  maxReachMeters: 25,
  points: [
    [55.3388, 25.2138], // Creek mouth (south)
    [55.3385, 25.2161],
    [55.3382, 25.2184],
    [55.3378, 25.2207],
    [55.3373, 25.223],
    [55.3367, 25.2253],
    [55.3361, 25.2276],
    [55.3354, 25.2299],
    [55.3347, 25.2322],
    [55.3339, 25.2345],
    [55.3331, 25.2368],
    [55.3322, 25.2391],
    [55.3312, 25.2414],
    [55.3301, 25.2437],
    [55.3289, 25.246], // Creek north
  ],
};

// Dubai mainland beachfront — Jumeirah open-coast beach south of the Palm,
// facing the open Gulf. Real coastline from OSM (the previous hand trace ran
// several hundred metres inland and drew foam over the city).
export const JUMEIRAH_BEACH_SHORELINE: ShorelinePath = {
  id: "jumeirah-beach",
  name: "Jumeirah Open Beach",
  intensity: 1.15,
  waterSide: 1,
  offsetMeters: 8,
  points: JUMEIRAH_BEACH_FOAM,
};

// Dubai mainland north — Deira open coast facing the Gulf, north-east of the
// Creek mouth. Real coastline from OSM (the previous hand trace ran inland).
export const DEIRA_COAST_SHORELINE: ShorelinePath = {
  id: "deira-coast",
  name: "Deira & Port Rashid Coast",
  intensity: 1.1,
  waterSide: 1,
  offsetMeters: 8,
  points: DEIRA_COAST_FOAM,
};

// All active shorelines — only real coastlines, no artificial boundaries.
export const SHORELINE_PATHS: ShorelinePath[] = [
  MARINA_BEACH_SHORELINE,
  PALM_OUTER_SHORELINE,
  PALM_FRONDS_SHORELINE,
  JUMEIRAH_BEACH_SHORELINE,
  DEIRA_COAST_SHORELINE,
  CREEK_SHORELINE,
];

// Kept as a backwards-compatible name for any map tooling that imports it.
export const ALL_SHORELINES = SHORELINE_PATHS;
