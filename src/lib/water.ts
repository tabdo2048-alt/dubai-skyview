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
};

// Water polygons traced along the real basins so the water doesn't spill onto
// land the way an axis-aligned rectangle would. Approximate, not survey-grade.
export const WATER_AREAS: WaterArea[] = [
  {
    id: "marina",
    name: "Dubai Marina & JBR",
    center: [55.138, 25.078],
    polygon: [
      [55.1420, 25.0690],
      [55.1395, 25.0700],
      [55.1300, 25.0660],
      [55.1180, 25.0640],
      [55.1080, 25.0700],
      [55.1030, 25.0800],
      [55.1010, 25.0920],
      [55.1050, 25.1000],
      [55.1140, 25.0980],
      [55.1220, 25.0920],
      [55.1290, 25.0870],
      [55.1345, 25.0810],
      [55.1390, 25.0745],
      [55.1420, 25.0690],
    ],
  },
  {
    id: "palm",
    name: "Palm Jumeirah",
    center: [55.138, 25.116],
    polygon: [
      [55.0960, 25.1260],
      [55.1000, 25.1360],
      [55.1120, 25.1420],
      [55.1300, 25.1440],
      [55.1480, 25.1420],
      [55.1620, 25.1340],
      [55.1700, 25.1220],
      [55.1660, 25.1100],
      [55.1550, 25.1020],
      [55.1400, 25.0980],
      [55.1240, 25.0990],
      [55.1100, 25.1050],
      [55.1000, 25.1150],
      [55.0960, 25.1260],
    ],
  },
  {
    id: "creek",
    name: "Dubai Creek",
    center: [55.32, 25.235],
    polygon: [
      [55.2960, 25.2660],
      [55.2990, 25.2600],
      [55.3050, 25.2560],
      [55.3110, 25.2500],
      [55.3170, 25.2430],
      [55.3230, 25.2360],
      [55.3290, 25.2290],
      [55.3350, 25.2220],
      [55.3390, 25.2190],
      [55.3410, 25.2230],
      [55.3360, 25.2280],
      [55.3300, 25.2350],
      [55.3240, 25.2420],
      [55.3180, 25.2490],
      [55.3120, 25.2555],
      [55.3060, 25.2620],
      [55.3010, 25.2690],
      [55.2960, 25.2660],
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
      [55.1360, 25.0790],
      [55.1330, 25.0830],
      [55.1300, 25.0865],
      [55.1275, 25.0895],
    ],
  },
  {
    id: "marina-yacht-2",
    kind: "yacht",
    color: 0xf5ead1,
    speed: 0.035,
    path: [
      [55.1285, 25.0900],
      [55.1315, 25.0860],
      [55.1345, 25.0815],
      [55.1372, 25.0770],
      [55.1400, 25.0720],
    ],
  },
  // Along the JBR / open water off the beach
  {
    id: "jbr-ship-1",
    kind: "ship",
    color: 0x9fb4c7,
    speed: 0.02,
    path: [
      [55.1180, 25.0680],
      [55.1120, 25.0760],
      [55.1080, 25.0860],
      [55.1060, 25.0980],
    ],
  },
  // Palm Jumeirah crescent + fronds
  {
    id: "palm-yacht-1",
    kind: "yacht",
    color: 0xffffff,
    speed: 0.03,
    path: [
      [55.1180, 25.1080],
      [55.1300, 25.1060],
      [55.1420, 25.1080],
      [55.1500, 25.1160],
      [55.1440, 25.1250],
      [55.1320, 25.1280],
      [55.1200, 25.1240],
    ],
  },
  {
    id: "palm-ship-1",
    kind: "ship",
    color: 0xb0bec5,
    speed: 0.016,
    path: [
      [55.1000, 25.1300],
      [55.1150, 25.1360],
      [55.1350, 25.1380],
      [55.1550, 25.1340],
      [55.1650, 25.1240],
    ],
  },
  // Dubai Creek abras / dhows going up and down the water
  {
    id: "creek-abra-1",
    kind: "abra",
    color: 0x8d6e63,
    speed: 0.05,
    path: [
      [55.3000, 25.2620],
      [55.3080, 25.2500],
      [55.3170, 25.2380],
      [55.3260, 25.2280],
      [55.3320, 25.2210],
    ],
  },
  {
    id: "creek-abra-2",
    kind: "abra",
    color: 0xa1887f,
    speed: 0.042,
    path: [
      [55.3320, 25.2210],
      [55.3255, 25.2290],
      [55.3170, 25.2390],
      [55.3080, 25.2510],
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
    center: [55.19 + Math.cos(angle) * (radius / 100000), 25.13 + Math.sin(angle) * (radius / 100000)] as [
      number,
      number,
    ],
    altitude: 420 + (i % 4) * 90,
    scale: 900 + (i % 5) * 220,
    speed: [8 + (i % 3) * 4, 3 + (i % 2) * 3],
    phase: i * 0.6,
  };
});
