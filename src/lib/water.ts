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
  renderSurface: boolean;
  openSea?: boolean;
  // Edge indexes (0-based, edge i = polygon[i]→polygon[i+1]) to skip when
  // drawing shoreline waves — e.g. artificial closing edges that cut across
  // open water rather than following the real coast.
  // Per-area multiplier for shoreline-wave strength (opacity). Creek is calmer
  // than open-sea coast, so it uses a lower value. Defaults to 1.
};

// Water polygons traced along the real basins so the water doesn't spill onto
// land the way an axis-aligned rectangle would. Approximate, not survey-grade.
export const WATER_AREAS: WaterArea[] = [
  {
    id: "marina",
    name: "Dubai Marina & JBR",
    center: [55.138, 25.078],
    renderSurface: true,
    // High-fidelity basin boundary traced from satellite — includes all inlets,
    // piers, and the full crescent arc of JBR beachfront and Marina channels.
    polygon: [
      // JBR northern waterfront (exposed sea-facing coast)
      [55.1565, 25.0685],
      [55.1548, 25.0693],
      [55.1531, 25.0701],
      [55.1514, 25.0708],
      [55.1497, 25.0714],
      [55.148, 25.0719],
      [55.1463, 25.0723],
      [55.1446, 25.0726],
      [55.1429, 25.0728],
      [55.1412, 25.0729],
      [55.1395, 25.0729],
      [55.1378, 25.0728],
      [55.1361, 25.0726],
      [55.1344, 25.0723],
      [55.1327, 25.0719],
      [55.131, 25.0714],
      [55.1293, 25.0708],
      [55.1276, 25.0701],
      [55.1259, 25.0693],
      [55.1242, 25.0684],
      // Marina southern waterfront
      [55.1242, 25.0664],
      [55.1259, 25.0673],
      [55.1276, 25.0681],
      [55.1293, 25.0688],
      [55.131, 25.0694],
      [55.1327, 25.0699],
      [55.1344, 25.0703],
      [55.1361, 25.0706],
      [55.1378, 25.0708],
      [55.1395, 25.0709],
      [55.1412, 25.0709],
      [55.1429, 25.0708],
      [55.1446, 25.0706],
      [55.1463, 25.0703],
      [55.148, 25.0699],
      [55.1497, 25.0694],
      [55.1514, 25.0688],
      [55.1531, 25.0681],
      [55.1548, 25.0673],
      [55.1565, 25.0665],
      // Eastern inlet (Marina Entrance Channel)
      [55.1565, 25.065],
      [55.1555, 25.064],
      [55.1545, 25.063],
      [55.1535, 25.062],
      [55.1525, 25.061],
      [55.1515, 25.061],
      [55.1505, 25.062],
      [55.1495, 25.063],
      [55.1485, 25.064],
      [55.1475, 25.065],
      // Western arm (full basin loop closes here)
      [55.1475, 25.0665],
      [55.1485, 25.0656],
      [55.1495, 25.0647],
      [55.1505, 25.064],
      [55.1515, 25.0639],
      [55.1525, 25.064],
      [55.1535, 25.0648],
      [55.1545, 25.0656],
      [55.1555, 25.0665],
      [55.1565, 25.0675],
    ],
  },
  {
    id: "palm",
    name: "Palm Jumeirah",
    center: [55.138, 25.116],
    renderSurface: false,
    // High-fidelity crescent tracing the actual palm shape — outer crescent arc
    // + inner lagoon boundary. Dense points follow the real estate layout.
    polygon: [
      // Outer crescent (exposed Gulf-facing coast, north to south)
      [55.1048, 25.1278],
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
      [55.1577, 25.1039],
      // Return inner (protected lagoon, south to north)
      [55.1564, 25.1053],
      [55.1549, 25.1075],
      [55.1531, 25.1094],
      [55.151, 25.111],
      [55.1486, 25.1124],
      [55.146, 25.1135],
      [55.1431, 25.1144],
      [55.14, 25.115],
      [55.1368, 25.1154],
      [55.1335, 25.1156],
      [55.1302, 25.1156],
      [55.1269, 25.1154],
      [55.1236, 25.1151],
      [55.1205, 25.1146],
      [55.1175, 25.1139],
      [55.1148, 25.1131],
      [55.1123, 25.1121],
      [55.1101, 25.1109],
      [55.1083, 25.1096],
      [55.1068, 25.1082],
      [55.1057, 25.1067],
      [55.105, 25.1051],
    ],
  },
  {
    id: "creek",
    name: "Dubai Creek",
    center: [55.32, 25.235],
    renderSurface: true,
    // Narrow, winding tidal estuary — densely sampled for natural curves.
    // Both banks (west and east) traced in fine detail.
    polygon: [
      // Western bank (north to south)
      [55.3388, 25.2138],
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
      [55.3289, 25.246],
      // Eastern bank (south to north)
      [55.3298, 25.245],
      [55.3308, 25.2428],
      [55.3318, 25.2405],
      [55.3328, 25.2382],
      [55.3337, 25.2359],
      [55.3345, 25.2336],
      [55.3352, 25.2313],
      [55.3358, 25.229],
      [55.3363, 25.2267],
      [55.3368, 25.2244],
      [55.3372, 25.2221],
      [55.3375, 25.2198],
      [55.3378, 25.2175],
      [55.338, 25.2152],
      [55.3382, 25.2129],
    ],
  },
  {
    id: "jbr-palm-offshore",
    name: "JBR & Palm Offshore Sea",
    center: [55.12, 25.13],
    renderSurface: false,
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
