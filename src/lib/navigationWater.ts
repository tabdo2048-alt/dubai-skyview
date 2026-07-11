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
    // Widened to fully contain the offshore lane grid (lng 54.90–55.22,
    // lat 25.18–25.27) with margin. Land is still excluded by the masks below.
    polygon: [
      [54.86, 25.155],
      [54.87, 25.285],
      [54.95, 25.31],
      [55.13, 25.318],
      [55.235, 25.262],
      [55.24, 25.2],
      [55.18, 25.168],
      [55.02, 25.148],
      [54.9, 25.145],
      [54.86, 25.155],
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
export const OPEN_SEA_HORIZONTAL_LANES: [number, number][][] = [
  [
    [54.925, 25.184],
    [54.955, 25.187],
    [54.987, 25.19],
    [55.021, 25.192],
    [55.057, 25.193],
    [55.094, 25.193],
    [55.13, 25.191],
    [55.162, 25.187],
    [55.18, 25.184],
  ],
  [
    [54.923, 25.191],
    [54.954, 25.194],
    [54.987, 25.197],
    [55.022, 25.199],
    [55.059, 25.2],
    [55.096, 25.2],
    [55.133, 25.198],
    [55.166, 25.194],
    [55.186, 25.189],
  ],
  [
    [54.921, 25.198],
    [54.953, 25.201],
    [54.986, 25.204],
    [55.022, 25.206],
    [55.06, 25.207],
    [55.098, 25.207],
    [55.136, 25.205],
    [55.17, 25.201],
    [55.192, 25.196],
  ],
  [
    [54.919, 25.205],
    [54.951, 25.208],
    [54.985, 25.211],
    [55.022, 25.213],
    [55.061, 25.214],
    [55.1, 25.214],
    [55.139, 25.212],
    [55.174, 25.208],
    [55.198, 25.203],
  ],
  [
    [54.917, 25.212],
    [54.95, 25.215],
    [54.984, 25.218],
    [55.022, 25.22],
    [55.062, 25.221],
    [55.102, 25.221],
    [55.142, 25.219],
    [55.177, 25.215],
    [55.203, 25.21],
  ],
  [
    [54.915, 25.219],
    [54.948, 25.222],
    [54.983, 25.225],
    [55.022, 25.227],
    [55.063, 25.228],
    [55.104, 25.228],
    [55.145, 25.226],
    [55.181, 25.222],
    [55.208, 25.217],
  ],
  [
    [54.913, 25.226],
    [54.947, 25.229],
    [54.982, 25.232],
    [55.022, 25.234],
    [55.064, 25.235],
    [55.106, 25.235],
    [55.148, 25.233],
    [55.184, 25.229],
    [55.213, 25.224],
  ],
  [
    [54.911, 25.233],
    [54.945, 25.236],
    [54.981, 25.239],
    [55.022, 25.241],
    [55.065, 25.242],
    [55.108, 25.242],
    [55.151, 25.24],
    [55.187, 25.236],
    [55.216, 25.231],
  ],
  [
    [54.909, 25.24],
    [54.944, 25.243],
    [54.98, 25.246],
    [55.022, 25.248],
    [55.066, 25.249],
    [55.11, 25.249],
    [55.154, 25.247],
    [55.19, 25.243],
    [55.219, 25.238],
  ],
  [
    [54.907, 25.247],
    [54.942, 25.25],
    [54.979, 25.253],
    [55.022, 25.255],
    [55.067, 25.256],
    [55.112, 25.256],
    [55.157, 25.254],
    [55.193, 25.25],
    [55.22, 25.245],
  ],
  [
    [54.905, 25.254],
    [54.941, 25.257],
    [54.978, 25.26],
    [55.022, 25.262],
    [55.068, 25.263],
    [55.114, 25.263],
    [55.16, 25.261],
    [55.196, 25.257],
    [55.22, 25.252],
  ],
  [
    [54.903, 25.261],
    [54.939, 25.264],
    [54.977, 25.267],
    [55.022, 25.269],
    [55.069, 25.27],
    [55.116, 25.27],
    [55.163, 25.268],
    [55.199, 25.264],
    [55.211, 25.259],
  ],
];

export const OPEN_SEA_DIAGONAL_LANES: [number, number][][] = [
  [
    [54.924, 25.184],
    [54.962, 25.195],
    [55.001, 25.207],
    [55.041, 25.22],
    [55.082, 25.234],
    [55.123, 25.248],
    [55.161, 25.261],
    [55.19, 25.27],
  ],
  [
    [54.933, 25.181],
    [54.971, 25.191],
    [55.01, 25.202],
    [55.05, 25.214],
    [55.091, 25.227],
    [55.132, 25.24],
    [55.173, 25.252],
    [55.208, 25.26],
  ],
  [
    [54.949, 25.18],
    [54.985, 25.19],
    [55.022, 25.201],
    [55.06, 25.212],
    [55.099, 25.224],
    [55.138, 25.236],
    [55.177, 25.247],
    [55.215, 25.254],
  ],
  [
    [54.938, 25.271],
    [54.973, 25.261],
    [55.009, 25.25],
    [55.046, 25.239],
    [55.084, 25.227],
    [55.122, 25.215],
    [55.16, 25.204],
    [55.197, 25.195],
  ],
  [
    [54.918, 25.263],
    [54.954, 25.254],
    [54.991, 25.244],
    [55.029, 25.233],
    [55.068, 25.222],
    [55.107, 25.211],
    [55.146, 25.201],
    [55.185, 25.193],
  ],
  [
    [54.908, 25.251],
    [54.945, 25.243],
    [54.983, 25.234],
    [55.022, 25.224],
    [55.062, 25.214],
    [55.102, 25.204],
    [55.142, 25.195],
    [55.181, 25.188],
  ],
];

export const OPEN_SEA_CONNECTOR_LANES: [number, number][][] = [
  [
    [54.942, 25.184],
    [54.944, 25.201],
    [54.946, 25.219],
    [54.948, 25.237],
    [54.95, 25.255],
    [54.952, 25.271],
  ],
  [
    [54.982, 25.186],
    [54.984, 25.202],
    [54.986, 25.22],
    [54.988, 25.238],
    [54.99, 25.256],
    [54.992, 25.27],
  ],
  [
    [55.03, 25.19],
    [55.032, 25.206],
    [55.034, 25.223],
    [55.036, 25.24],
    [55.038, 25.257],
    [55.04, 25.27],
  ],
  [
    [55.084, 25.193],
    [55.086, 25.209],
    [55.088, 25.225],
    [55.09, 25.241],
    [55.092, 25.257],
    [55.094, 25.27],
  ],
  [
    [55.145, 25.195],
    [55.148, 25.21],
    [55.151, 25.225],
    [55.154, 25.24],
    [55.157, 25.255],
    [55.16, 25.268],
  ],
];

export const OPEN_SEA_YACHT_LOOPS: [number, number][][] = [
  [
    [54.97, 25.202],
    [55.002, 25.212],
    [55.038, 25.217],
    [55.073, 25.213],
    [55.095, 25.202],
    [55.067, 25.194],
    [55.03, 25.193],
    [54.994, 25.196],
    [54.97, 25.202],
  ],
  [
    [55.09, 25.238],
    [55.119, 25.247],
    [55.151, 25.249],
    [55.181, 25.242],
    [55.198, 25.231],
    [55.169, 25.222],
    [55.137, 25.221],
    [55.108, 25.228],
    [55.09, 25.238],
  ],
];

export const OPEN_SEA_LANES: [number, number][][] = [
  ...OPEN_SEA_HORIZONTAL_LANES,
  ...OPEN_SEA_DIAGONAL_LANES,
  ...OPEN_SEA_CONNECTOR_LANES,
  ...OPEN_SEA_YACHT_LOOPS,
];

console.log("[BoatRoute] navigation polygons loaded");
console.log("[BoatRoute] land masks loaded");
