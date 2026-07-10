// Navigation water + open-sea lanes for the animated 3D vessels.
//
// This is deliberately SEPARATE from the visual WATER_AREAS in water.ts. Those
// visual polygons hug the coastline (Marina, Palm lagoon, Creek) and are far too
// close to land to be safe for a moving ship. Here we describe only DEEP OPEN
// GULF water that is unambiguously offshore, plus the exact lanes vessels sail.
//
// Every coordinate below sits well north/west of Palm Jumeirah, Dubai Marina,
// JBR and the mainland shoreline, so a vessel confined to these lanes can never
// cross land. Coordinates are [lng, lat].

export type NavigationPolygon = {
  id: string;
  name: string;
  polygon: [number, number][];
};

// One large, confidently-offshore polygon covering the open Gulf west and north
// of all Dubai land. Its southern edge is kept safely north of Palm Jumeirah's
// crescent (~25.131) and the coast; everything above it is deep water. Closed
// ring (last point repeats the first).
export const NAVIGATION_WATER_POLYGONS: NavigationPolygon[] = [
  {
    id: "open-gulf",
    name: "Arabian Gulf Open-Sea Navigation Water",
    polygon: [
      [54.9, 25.15], // far west offshore
      [54.93, 25.285], // north-west
      [55.13, 25.305], // north
      [55.205, 25.235], // north-east offshore
      [55.165, 25.165], // south edge, north of Palm Jumeirah
      [55.02, 25.152], // south edge, north of the west coast
      [54.9, 25.15], // close ring
    ],
  },
];

// Land footprints treated as hard exclusions. All lanes stay kilometres from
// these; they guarantee no accepted point can ever sit on an island or shore.
// Closed rings.
export const LAND_EXCLUSION_POLYGONS: NavigationPolygon[] = [
  {
    id: "palm-jumeirah",
    name: "Palm Jumeirah (crescent, fronds, trunk)",
    polygon: [
      [55.1, 25.09],
      [55.1, 25.135],
      [55.165, 25.135],
      [55.165, 25.09],
      [55.1, 25.09],
    ],
  },
  {
    id: "palm-jebel-ali",
    name: "Palm Jebel Ali",
    polygon: [
      [54.96, 24.96],
      [54.96, 25.05],
      [55.06, 25.05],
      [55.06, 24.96],
      [54.96, 24.96],
    ],
  },
  {
    id: "dubai-mainland-coast",
    name: "Dubai Mainland & JBR/Marina Shore",
    polygon: [
      // A conservative band covering the coast and everything inland of it, kept
      // south of every lane so any point drifting toward shore is rejected.
      [54.98, 25.0],
      [55.08, 25.06],
      [55.16, 25.072],
      [55.2, 25.145],
      [55.29, 25.205],
      [55.45, 25.205],
      [55.45, 24.85],
      [54.98, 24.85],
      [54.98, 25.0],
    ],
  },
];

// The lanes every vessel sails. These are drawn as open-sea paths in the
// Arabian Gulf, offshore of Palm Jumeirah, JBR and the mainland. Every point
// stays within "open-gulf" and outside the land exclusion masks so ships,
// yachts and boats remain at sea and never cross Dubai land.
export const OPEN_SEA_LANES: [number, number][][] = [
  // --- Wide parallel Gulf lanes (west → east) ---
  [
    [54.96, 25.18],
    [55.02, 25.183],
    [55.08, 25.182],
    [55.13, 25.184],
    [55.17, 25.186],
  ],
  [
    [54.96, 25.192],
    [55.03, 25.195],
    [55.09, 25.194],
    [55.14, 25.197],
    [55.17, 25.199],
  ],
  [
    [54.97, 25.205],
    [55.03, 25.207],
    [55.09, 25.206],
    [55.14, 25.209],
    [55.17, 25.211],
  ],
  [
    [54.98, 25.22],
    [55.04, 25.222],
    [55.1, 25.221],
    [55.15, 25.223],
    [55.17, 25.224],
  ],
  [
    [54.99, 25.235],
    [55.05, 25.237],
    [55.11, 25.236],
    [55.15, 25.238],
  ],

  // --- Crossing diagonal lines (south-west → north-east) ---
  [
    [54.96, 25.18],
    [55.01, 25.195],
    [55.07, 25.212],
    [55.13, 25.229],
    [55.17, 25.241],
  ],
  [
    [54.97, 25.19],
    [55.03, 25.205],
    [55.08, 25.221],
    [55.14, 25.235],
    [55.17, 25.245],
  ],
  [
    [54.98, 25.23],
    [55.03, 25.223],
    [55.08, 25.215],
    [55.12, 25.206],
    [55.15, 25.196],
  ],

  // --- Crossing diagonal lines (north-west → south-east) ---
  [
    [54.97, 25.245],
    [55.02, 25.233],
    [55.08, 25.217],
    [55.13, 25.203],
    [55.16, 25.19],
  ],
  [
    [54.98, 25.238],
    [55.04, 25.226],
    [55.09, 25.212],
    [55.13, 25.2],
    [55.16, 25.188],
  ],

  // --- Long sweeping Gulf connectors ---
  [
    [54.96, 25.19],
    [55.04, 25.2],
    [55.12, 25.208],
    [55.17, 25.214],
  ],
  [
    [54.96, 25.23],
    [55.04, 25.225],
    [55.12, 25.217],
    [55.17, 25.209],
  ],
];

// One-time load markers (STEP 22 logging contract).
console.log("[BoatRoute] navigation polygons loaded");
console.log("[BoatRoute] land masks loaded");
