// Dubai coastline paths for animated white shoreline foam lines.
// These are real coastlines traced from satellite imagery — NOT artificial
// polygon closures or open-sea boundaries. Each path represents an actual
// beach, marina wall, or creek bank where foam waves appear.
//
// Coordinates are [lng, lat], densely sampled for smooth curves.

import {
  JUMEIRAH_BEACH_FOAM,
  DEIRA_COAST_FOAM,
  JBR_BEACH_FOAM,
  PALM_OUTER_FOAM,
  PALM_FRONDS_FOAM,
  CREEK_FOAM,
} from "@/lib/coastline.generated";

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
  points: PALM_OUTER_FOAM,
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
  points: PALM_FRONDS_FOAM,
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
  points: CREEK_FOAM,
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
