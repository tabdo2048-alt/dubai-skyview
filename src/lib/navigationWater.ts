// Navigation water + open-sea lanes for the animated 3D vessels.
//
// This is deliberately separate from the visual WATER_AREAS in water.ts. Those
// visual polygons hug the coastline and are too close to land for moving ships.
// Here we describe only open Gulf water and the exact lanes vessels sail.
//
// Satellite imagery is the authority for this file. These masks and lanes are
// hand-traced against the visible coastline, beaches, breakwaters, Palm islands,
// marina channels, and offshore water in satellite mode. Vector map geometry is
// not trusted for marine navigation because it can be simplified or offset from
// the visible shore.
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
      [55.235, 25.248],
      [55.18, 25.176],
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

// Hand-traced satellite open-sea lanes. Prefer many points over long straight
// shortcuts: each lane follows visible navigable open water and keeps a visual
// clearance from Palm Jumeirah, Palm Jebel Ali, JBR/Marina, piers and beaches.
// Every point remains inside the open Gulf mask; waterRouteGuards samples the
// full segment between points before a vessel can use the lane.
export const OPEN_SEA_LANES: [number, number][][] = [
  // Long west-east lanes. These are intentionally offshore and do not touch the
  // marina coast, Palm Jumeirah, Palm Jebel Ali, or the mainland.
  [
    [54.93, 25.218],
    [54.958, 25.223],
    [54.99, 25.227],
    [55.024, 25.23],
    [55.06, 25.232],
    [55.096, 25.232],
    [55.132, 25.23],
    [55.17, 25.225],
    [55.205, 25.218],
  ],
  [
    [54.94, 25.198],
    [54.972, 25.202],
    [55.006, 25.206],
    [55.044, 25.209],
    [55.084, 25.21],
    [55.122, 25.209],
    [55.158, 25.205],
    [55.195, 25.198],
  ],
  [
    [54.965, 25.181],
    [54.995, 25.185],
    [55.028, 25.189],
    [55.064, 25.192],
    [55.1, 25.193],
    [55.132, 25.191],
    [55.158, 25.187],
    [55.18, 25.182],
  ],

  // Diagonal crossings following the drawn offshore guide paths.
  [
    [54.925, 25.165],
    [54.954, 25.174],
    [54.984, 25.184],
    [55.016, 25.194],
    [55.05, 25.205],
    [55.084, 25.217],
    [55.12, 25.229],
    [55.156, 25.24],
    [55.19, 25.248],
  ],
  [
    [54.975, 25.252],
    [55.002, 25.244],
    [55.03, 25.234],
    [55.058, 25.224],
    [55.088, 25.212],
    [55.116, 25.202],
    [55.145, 25.192],
    [55.172, 25.182],
  ],

  // Vertical connector lanes, like the hand-drawn access channels.
  [
    [54.943, 25.166],
    [54.946, 25.18],
    [54.949, 25.196],
    [54.951, 25.212],
    [54.953, 25.228],
    [54.954, 25.242],
  ],
  [
    [55.078, 25.181],
    [55.08, 25.196],
    [55.083, 25.211],
    [55.086, 25.226],
    [55.09, 25.25],
  ],
  [
    [55.155, 25.19],
    [55.159, 25.203],
    [55.164, 25.217],
    [55.171, 25.232],
    [55.178, 25.244],
  ],

  // Small closed lanes for yachts/speedboats, still completely offshore.
  [
    [55.015, 25.188],
    [55.035, 25.195],
    [55.058, 25.2],
    [55.082, 25.201],
    [55.104, 25.197],
    [55.126, 25.184],
    [55.106, 25.179],
    [55.078, 25.179],
    [55.045, 25.181],
    [55.015, 25.188],
  ],
  [
    [55.075, 25.216],
    [55.098, 25.222],
    [55.124, 25.226],
    [55.149, 25.224],
    [55.172, 25.216],
    [55.148, 25.199],
    [55.124, 25.201],
    [55.102, 25.203],
    [55.086, 25.209],
    [55.075, 25.216],
  ],
];

console.log("[BoatRoute] navigation polygons loaded");
console.log("[BoatRoute] land masks loaded");
