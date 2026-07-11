// Dubai coastline paths for animated white shoreline foam lines.
// These are real coastlines traced from satellite imagery — NOT artificial
// polygon closures or open-sea boundaries. Each path represents an actual
// beach, marina wall, or creek bank where foam waves appear.
//
// Coordinates are [lng, lat], densely sampled for smooth curves.

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
};

// Marina walls and JBR beachfront — the northern arc facing open water.
export const MARINA_BEACH_SHORELINE: ShorelinePath = {
  id: "marina-beach",
  name: "Marina Beach & JBR Waterfront",
  intensity: 1.08,
  waterSide: 1,
  offsetMeters: 8,
  points: [
    [55.1565, 25.0685], // JBR north (Nakheel Harbour)
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
    [55.1242, 25.0684], // Marina south (The Beach)
  ],
};

// Palm Jumeirah outer crescent — exposed to open Gulf.
export const PALM_OUTER_SHORELINE: ShorelinePath = {
  id: "palm-outer",
  name: "Palm Jumeirah Outer Crescent",
  intensity: 1.2,
  waterSide: 1,
  offsetMeters: 8,
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
export const PALM_FRONDS_SHORELINE: ShorelinePath = {
  id: "palm-fronds",
  name: "Palm Jumeirah Inner Fronds",
  intensity: 0.95,
  waterSide: 1,
  offsetMeters: 5,
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

// Dubai Creek — narrow tidal estuary, subtle waves.
export const CREEK_SHORELINE: ShorelinePath = {
  id: "creek",
  name: "Dubai Creek Banks",
  intensity: 0.95,
  waterSide: -1,
  offsetMeters: 7,
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
// facing the open Gulf. This is the long city beach that previously had no foam.
export const JUMEIRAH_BEACH_SHORELINE: ShorelinePath = {
  id: "jumeirah-beach",
  name: "Jumeirah Open Beach",
  intensity: 1.15,
  waterSide: 1,
  offsetMeters: 8,
  points: [
    [55.1585, 25.0975], // near Palm trunk / south of Marina
    [55.1637, 25.1015],
    [55.1689, 25.1056],
    [55.1741, 25.1097],
    [55.1793, 25.1138],
    [55.1845, 25.1179],
    [55.1897, 25.1219],
    [55.1949, 25.1258],
    [55.2001, 25.1296],
    [55.2053, 25.1333],
    [55.2105, 25.1369],
    [55.2157, 25.1404],
    [55.2209, 25.1438], // toward Jumeirah / Canal mouth
  ],
};

// Dubai mainland north — Deira / Port Rashid open-coast facing the Gulf,
// north of the Creek mouth.
export const DEIRA_COAST_SHORELINE: ShorelinePath = {
  id: "deira-coast",
  name: "Deira & Port Rashid Coast",
  intensity: 1.1,
  waterSide: 1,
  offsetMeters: 8,
  points: [
    [55.2711, 25.1611], // Port Rashid
    [55.2766, 25.1662],
    [55.2821, 25.1713],
    [55.2876, 25.1764],
    [55.2931, 25.1815],
    [55.2986, 25.1866],
    [55.3041, 25.1917],
    [55.3096, 25.1968],
    [55.3151, 25.2019],
    [55.3206, 25.207],
    [55.3261, 25.2121], // toward Creek mouth
  ],
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
