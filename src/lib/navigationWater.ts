// Navigation water + open-sea lanes for the animated 3D vessels.
//
// This is deliberately separate from the visual WATER_AREAS in water.ts. Those
// visual polygons hug the coastline and are too close to land for moving ships.
// Here we describe only open Gulf water and the exact lanes vessels sail.
//
// Coordinates are [lng, lat].

export type NavigationPolygon = {
  id: string;
  name: string;
  polygon: [number, number][];
};

// One offshore polygon covering the safe sea between Palm Jebel Ali, JBR and
// Palm Jumeirah. The land masks below still reject anything drifting onto land.
export const NAVIGATION_WATER_POLYGONS: NavigationPolygon[] = [
  {
    id: "open-gulf",
    name: "Arabian Gulf Open-Sea Navigation Water",
    polygon: [
      [54.88, 25.148],
      [54.92, 25.292],
      [55.13, 25.312],
      [55.265, 25.242],
      [55.19, 25.16],
      [55.02, 25.15],
      [54.88, 25.148],
    ],
  },
];

// Land footprints treated as hard exclusions. Lanes stay offshore, and these
// masks add a second guard against vessels reaching islands or the mainland.
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

// Hand-traced open-sea lanes. These follow the drawn visual intent from the
// screenshots: long offshore sweeps, a few diagonal crossings, and small loops
// for yachts/speedboats. Every point remains inside the open Gulf mask.
export const OPEN_SEA_LANES: [number, number][][] = [
  [
    [54.94, 25.205],
    [55.0, 25.219],
    [55.075, 25.225],
    [55.155, 25.223],
    [55.225, 25.212],
  ],
  [
    [54.955, 25.19],
    [55.025, 25.202],
    [55.095, 25.206],
    [55.17, 25.202],
    [55.235, 25.19],
  ],
  [
    [54.98, 25.174],
    [55.045, 25.185],
    [55.115, 25.188],
    [55.185, 25.181],
    [55.245, 25.168],
  ],
  [
    [54.93, 25.162],
    [55.0, 25.185],
    [55.07, 25.209],
    [55.14, 25.232],
    [55.22, 25.252],
  ],
  [
    [54.98, 25.246],
    [55.04, 25.228],
    [55.095, 25.207],
    [55.15, 25.184],
    [55.205, 25.166],
  ],
  [
    [54.945, 25.16],
    [54.95, 25.186],
    [54.952, 25.214],
    [54.954, 25.242],
  ],
  [
    [55.085, 25.165],
    [55.087, 25.19],
    [55.09, 25.218],
    [55.094, 25.248],
  ],
  [
    [55.17, 25.164],
    [55.174, 25.19],
    [55.18, 25.217],
    [55.188, 25.242],
  ],
  [
    [55.015, 25.18],
    [55.06, 25.192],
    [55.105, 25.19],
    [55.13, 25.174],
    [55.08, 25.17],
    [55.015, 25.18],
  ],
  [
    [55.08, 25.206],
    [55.13, 25.216],
    [55.18, 25.205],
    [55.155, 25.188],
    [55.105, 25.192],
    [55.08, 25.206],
  ],
];

console.log("[BoatRoute] navigation polygons loaded");
console.log("[BoatRoute] land masks loaded");
