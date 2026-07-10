// Dubai marine areas + boat routes for the 3D water layer.
// Coordinates are [lng, lat]. Routes are ordered polylines the boats sail along.

export type BoatKind = "yacht" | "ship" | "abra";

export type BoatRoute = {
  id: string;
  kind: BoatKind;
  color: number; // hex for the hull, e.g. 0xffffff
  speed: number; // fraction of the route per second
  path: [number, number][];
};

export type WaterArea = {
  id: string;
  name: string;
  center: [number, number];
  // Hand-traced ring hugging the basin's coastline, ordered around the perimeter.
  polygon: [number, number][];
  // --- Shoreline-wave tuning (optional) ------------------------------------
  // When true, this basin is open sea (not a real coastline) so shoreline foam
  // lines are NOT drawn around it. Defaults to false.
  openSea?: boolean;
  // Edge indexes (0-based, edge i = polygon[i]→polygon[i+1]) to skip when
  // drawing shoreline waves — e.g. artificial closing edges that cut across
  // open water rather than following the real coast.
  shorelineExcludedEdges?: number[];
  // Per-area multiplier for shoreline-wave strength (opacity). Creek is calmer
  // than open-sea coast, so it uses a lower value. Defaults to 1.
  shorelineIntensity?: number;
};

// Water polygons traced along the real basins so the water doesn't spill onto
// land the way an axis-aligned rectangle would. Approximate, not survey-grade.
export const WATER_AREAS: WaterArea[] = [
  {
    id: "marina",
    name: "Dubai Marina & JBR",
    center: [55.138, 25.078],
    shorelineIntensity: 0.85,
    polygon: [
      [55.142, 25.069],
      [55.1395, 25.07],
      [55.13, 25.066],
      [55.118, 25.064],
      [55.108, 25.07],
      [55.103, 25.08],
      [55.101, 25.092],
      [55.105, 25.1],
      [55.114, 25.098],
      [55.122, 25.092],
      [55.129, 25.087],
      [55.1345, 25.081],
      [55.139, 25.0745],
      [55.142, 25.069],
    ],
  },
  {
    id: "palm",
    name: "Palm Jumeirah",
    center: [55.138, 25.116],
    shorelineIntensity: 1,
    polygon: [
      [55.096, 25.126],
      [55.1, 25.136],
      [55.112, 25.142],
      [55.13, 25.144],
      [55.148, 25.142],
      [55.162, 25.134],
      [55.17, 25.122],
      [55.166, 25.11],
      [55.155, 25.102],
      [55.14, 25.098],
      [55.124, 25.099],
      [55.11, 25.105],
      [55.1, 25.115],
      [55.096, 25.126],
    ],
  },
  {
    id: "creek",
    name: "Dubai Creek",
    center: [55.32, 25.235],
    shorelineIntensity: 0.5,
    polygon: [
      [55.296, 25.266],
      [55.299, 25.26],
      [55.305, 25.256],
      [55.311, 25.25],
      [55.317, 25.243],
      [55.323, 25.236],
      [55.329, 25.229],
      [55.335, 25.222],
      [55.339, 25.219],
      [55.341, 25.223],
      [55.336, 25.228],
      [55.33, 25.235],
      [55.324, 25.242],
      [55.318, 25.249],
      [55.312, 25.2555],
      [55.306, 25.262],
      [55.301, 25.269],
      [55.296, 25.266],
    ],
  },
  {
    id: "jbr-palm-offshore",
    name: "JBR & Palm Offshore Sea",
    center: [55.12, 25.13],
    // Open sea — its ring is not a real coastline, so no shoreline foam here.
    openSea: true,
    polygon: [
      [55.07, 25.052],
      [55.052, 25.1],
      [55.06, 25.145],
      [55.092, 25.174],
      [55.132, 25.184],
      [55.171, 25.173],
      [55.202, 25.152],
      [55.187, 25.136],
      [55.158, 25.151],
      [55.12, 25.151],
      [55.091, 25.134],
      [55.084, 25.101],
      [55.101, 25.067],
      [55.07, 25.052],
    ],
  },
];

// --- Boat routes ---
export const BOAT_ROUTES: BoatRoute[] = [
  // Yachts cruising the Marina channel
  {
    id: "marina-yacht-1",
    kind: "yacht",
    color: 0xffffff,
    speed: 0.045,
    path: [
      [55.1405, 25.0705],
      [55.1385, 25.0745],
      [55.136, 25.079],
      [55.133, 25.083],
      [55.13, 25.0865],
      [55.1275, 25.0895],
    ],
  },
  {
    id: "marina-yacht-2",
    kind: "yacht",
    color: 0xf5ead1,
    speed: 0.035,
    path: [
      [55.1285, 25.09],
      [55.1315, 25.086],
      [55.1345, 25.0815],
      [55.1372, 25.077],
      [55.14, 25.072],
    ],
  },
  // Along the JBR / open water off the beach
  {
    id: "jbr-ship-1",
    kind: "ship",
    color: 0x9fb4c7,
    speed: 0.02,
    path: [
      [55.118, 25.068],
      [55.112, 25.076],
      [55.108, 25.086],
      [55.106, 25.098],
    ],
  },
  // Palm Jumeirah crescent + fronds
  {
    id: "palm-yacht-1",
    kind: "yacht",
    color: 0xffffff,
    speed: 0.03,
    path: [
      [55.118, 25.108],
      [55.13, 25.106],
      [55.142, 25.108],
      [55.15, 25.116],
      [55.144, 25.125],
      [55.132, 25.128],
      [55.12, 25.124],
    ],
  },
  {
    id: "palm-ship-1",
    kind: "ship",
    color: 0xb0bec5,
    speed: 0.016,
    path: [
      [55.1, 25.13],
      [55.115, 25.136],
      [55.135, 25.138],
      [55.155, 25.134],
      [55.165, 25.124],
    ],
  },
  // Dubai Creek abras / dhows going up and down the water
  {
    id: "creek-abra-1",
    kind: "abra",
    color: 0x8d6e63,
    speed: 0.05,
    path: [
      [55.3, 25.262],
      [55.308, 25.25],
      [55.317, 25.238],
      [55.326, 25.228],
      [55.332, 25.221],
    ],
  },
  {
    id: "creek-abra-2",
    kind: "abra",
    color: 0xa1887f,
    speed: 0.042,
    path: [
      [55.332, 25.221],
      [55.3255, 25.229],
      [55.317, 25.239],
      [55.308, 25.251],
      [55.3005, 25.2615],
    ],
  },
];

// Interpolate along a boat route at fraction t (0..1), returning position and
// heading so the mesh can face its direction of travel.
export function boatPointAt(
  path: [number, number][],
  t: number,
): { coord: [number, number]; heading: number } {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segLens.push(l);
    total += l;
  }
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const l = segLens[i - 1];
    if (acc + l >= target) {
      const localT = l === 0 ? 0 : (target - acc) / l;
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      const coord: [number, number] = [ax + (bx - ax) * localT, ay + (by - ay) * localT];
      const heading = Math.atan2(bx - ax, by - ay);
      return { coord, heading };
    }
    acc += l;
  }
  return { coord: path[path.length - 1], heading: 0 };
}

// --- Clouds ---
export type CloudSpec = {
  id: string;
  center: [number, number]; // lng/lat the cloud drifts near
  altitude: number; // metres
  scale: number; // sprite size in metres
  speed: [number, number]; // drift in metres/second, local XY
  phase: number; // offset into the fade cycle
};

export const CLOUDS: CloudSpec[] = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  const radius = 2600 + (i % 3) * 900;
  return {
    id: `cloud-${i}`,
    center: [
      55.19 + Math.cos(angle) * (radius / 100000),
      25.13 + Math.sin(angle) * (radius / 100000),
    ] as [number, number],
    altitude: 420 + (i % 4) * 90,
    scale: 900 + (i % 5) * 220,
    speed: [8 + (i % 3) * 4, 3 + (i % 2) * 3],
    phase: i * 0.6,
  };
});
