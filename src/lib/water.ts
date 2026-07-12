// Dubai animated water surfaces for the 3D water layer.
// Coordinates are [lng, lat].
//
// IMPORTANT: This file is the SOLE SOURCE for animated water surface coverage.
// It is intentionally decoupled from vessel routing:
//   - Vessel navigation safety masks live in src/lib/navigationWater.ts
//   - Named vessel routes live in src/lib/marineRoutes.ts
// The hand-drawn route lines used to design those systems are NOT used here.
// Water boundaries below are traced against satellite imagery of the real
// coastline so animated water never renders over land, islands, piers, docks,
// breakwaters, or beaches.
//
// Coordinates are best-effort satellite tracing and may need further
// refinement — use WATER_MASK_DEBUG in WaterLayer.ts to visualize boundaries
// and click the map to print exact [lng, lat] pairs for correction.

export type WaterArea = {
  id: string;
  name: string;
  center: [number, number];
  // Outer ring hugging the basin's real coastline, ordered around the perimeter.
  polygon: [number, number][];
  // Inner rings punched out of `polygon` — islands, land, piers, breakwaters,
  // docks the water must not cover. Each hole is its own ordered [lng, lat]
  // ring; triangulation removes it from the surface mesh.
  holes?: [number, number][][];
  // When true, an animated Gerstner water surface is drawn for this area.
  renderSurface: boolean;
  // When true, this basin is open sea (not a real coastline) so shoreline foam
  // lines are NOT drawn around it. Defaults to false.
  openSea?: boolean;
  // Per-area wave energy fed to the shared Gerstner model: 1 = exposed open
  // Gulf, lower = sheltered Marina/Creek/lagoon. Defaults to 1.
  waveIntensity?: number;
};

// --- Land silhouettes reused as polygon holes -------------------------------
// These shapes are shared between adjacent water polygons: the "surrounding"
// water ring uses them as a hole, and the outer boundary of that same ring is
// reused as a hole in the next-larger polygon (open Gulf) — so neighboring
// polygons share a boundary instead of leaving a gap or double-covering water.

// Simplified trunk + frond comb for Palm Jumeirah (5 fronds per side; real
// island has 17, this is "good enough for a cinematic map" per project norm).
const PALM_JUMEIRAH_TRUNK_FRONDS: [number, number][] = [
  [55.1388, 25.091],
  [55.1388, 25.098],
  [55.134, 25.098],
  [55.134, 25.101],
  [55.1388, 25.101],
  [55.1388, 25.107],
  [55.134, 25.107],
  [55.134, 25.11],
  [55.1388, 25.11],
  [55.1388, 25.116],
  [55.134, 25.116],
  [55.134, 25.119],
  [55.1388, 25.119],
  [55.1388, 25.125],
  [55.134, 25.125],
  [55.134, 25.128],
  [55.1388, 25.128],
  [55.1388, 25.134],
  [55.134, 25.134],
  [55.134, 25.137],
  [55.1388, 25.137],
  [55.1388, 25.144],
  [55.1412, 25.144],
  [55.1412, 25.137],
  [55.147, 25.137],
  [55.147, 25.134],
  [55.1412, 25.134],
  [55.1412, 25.128],
  [55.147, 25.128],
  [55.147, 25.125],
  [55.1412, 25.125],
  [55.1412, 25.119],
  [55.147, 25.119],
  [55.147, 25.116],
  [55.1412, 25.116],
  [55.1412, 25.11],
  [55.147, 25.11],
  [55.147, 25.107],
  [55.1412, 25.107],
  [55.1412, 25.101],
  [55.147, 25.101],
  [55.147, 25.098],
  [55.1412, 25.098],
  [55.1412, 25.091],
  [55.1388, 25.091],
];

// Crescent breakwater land strip — thin ring: outer (Gulf-facing) arc traced
// one direction, inner (lagoon-facing) arc traced back, forming the land mass.
const PALM_JUMEIRAH_CRESCENT_LAND: [number, number][] = [
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
];

// Outer boundary of the water ring surrounding the crescent (a bit wider than
// the crescent itself) — reused as the hole cut into open-arabian-gulf below,
// so the two polygons share a boundary with no gap and no double-water.
const PALM_JUMEIRAH_SURROUND_OUTER: [number, number][] = [
  [55.1, 25.13],
  [55.104, 25.134],
  [55.11, 25.1375],
  [55.117, 25.1395],
  [55.124, 25.1405],
  [55.131, 25.141],
  [55.138, 25.141],
  [55.145, 25.1405],
  [55.151, 25.139],
  [55.157, 25.136],
  [55.1615, 25.132],
  [55.1645, 25.127],
  [55.1665, 25.121],
  [55.1675, 25.115],
  [55.168, 25.108],
  [55.168, 25.101],
  [55.1655, 25.0975],
  [55.161, 25.0955],
  [55.155, 25.0945],
  [55.148, 25.094],
  [55.14, 25.094],
  [55.132, 25.094],
  [55.124, 25.0945],
  [55.117, 25.0955],
  [55.111, 25.0975],
  [55.106, 25.1005],
  [55.102, 25.104],
  [55.099, 25.108],
  [55.097, 25.113],
  [55.097, 25.119],
  [55.098, 25.125],
  [55.1, 25.13],
];

// Simplified Palm Jebel Ali land silhouette (smaller, less iconic — coarser
// than Palm Jumeirah is acceptable for a cinematic map).
const PALM_JEBEL_ALI_LAND: [number, number][] = [
  [54.975, 24.985],
  [54.98, 24.995],
  [54.985, 25.005],
  [54.992, 25.013],
  [55.0, 25.019],
  [55.01, 25.022],
  [55.02, 25.021],
  [55.028, 25.017],
  [55.034, 25.01],
  [55.037, 25.001],
  [55.036, 24.991],
  [55.03, 24.982],
  [55.022, 24.976],
  [55.012, 24.973],
  [55.0, 24.973],
  [54.988, 24.977],
  [54.979, 24.981],
  [54.975, 24.985],
];

// Outer boundary of the water ring surrounding Palm Jebel Ali — hole reused
// in open-arabian-gulf so the two polygons share a boundary.
const PALM_JEBEL_ALI_SURROUND_OUTER: [number, number][] = [
  [54.965, 24.978],
  [54.97, 24.992],
  [54.975, 25.006],
  [54.982, 25.018],
  [54.992, 25.027],
  [55.004, 25.032],
  [55.017, 25.033],
  [55.029, 25.029],
  [55.039, 25.021],
  [55.045, 25.009],
  [55.046, 24.996],
  [55.042, 24.983],
  [55.033, 24.972],
  [55.021, 24.965],
  [55.007, 24.963],
  [54.993, 24.966],
  [54.978, 24.971],
  [54.965, 24.978],
];

// Mainland coastline strip along Marina/JBR — used as a hole so open water
// polygons never spill onto the beachfront/promenade.
const MARINA_JBR_MAINLAND: [number, number][] = [
  [55.12, 25.06],
  [55.135, 25.062],
  [55.15, 25.066],
  [55.16, 25.07],
  [55.166, 25.075],
  [55.166, 25.06],
  [55.12, 25.055],
  [55.12, 25.06],
];

// Broad mainland mask used by the full-Gulf surface. The outer water rectangle
// extends beyond the normal Dubai camera bounds, while this hole follows the
// satellite coastline and closes far inland so water never paints the city.
// The coastline trace runs SW→NE: Jebel Ali → Marina/JBR → Al Sufouh (skirting
// just SE of PALM_JUMEIRAH_SURROUND_OUTER so the two holes never touch) →
// Jumeirah beaches → Port Rashid → Deira/Al Mamzar → Sharjah → Ajman, ending
// on the rectangle's east edge so the whole NE landmass is excluded (the old
// trace stopped at lat 25.29 and flooded Sharjah/Ajman with animated water).
const DUBAI_MAINLAND_LAND: [number, number][] = [
  [54.72, 24.82],
  [54.78, 24.86],
  [54.84, 24.9],
  [54.9, 24.93],
  [54.965, 24.955],
  [55.02, 24.95],
  [55.05, 24.98],
  [55.065, 25.015],
  [55.09, 25.04],
  [55.115, 25.056],
  [55.128, 25.065],
  [55.14, 25.078],
  [55.147, 25.088],
  [55.154, 25.093],
  [55.16, 25.0945],
  [55.165, 25.0965],
  [55.1675, 25.1],
  [55.173, 25.106],
  [55.18, 25.117],
  [55.187, 25.13],
  [55.193, 25.141],
  [55.202, 25.149],
  [55.212, 25.159],
  [55.222, 25.171],
  [55.233, 25.185],
  [55.245, 25.202],
  [55.253, 25.216],
  [55.258, 25.227],
  [55.263, 25.233],
  [55.271, 25.24],
  [55.277, 25.252],
  [55.283, 25.266],
  [55.292, 25.272],
  [55.303, 25.281],
  [55.32, 25.29],
  [55.34, 25.3],
  [55.36, 25.312],
  [55.38, 25.33],
  [55.41, 25.357],
  [55.44, 25.395],
  [55.47, 25.425],
  [55.5, 25.448],
  [55.5, 24.7],
  [54.65, 24.7],
  [54.65, 24.8],
  [54.72, 24.82],
];

export const WATER_AREAS: WaterArea[] = [
  // 1. Full Arabian Gulf coverage. The boundary is outside the normal camera;
  // holes remove Dubai mainland and the two Palm water tiles.
  {
    id: "open-arabian-gulf",
    name: "Open Arabian Gulf",
    center: [55.05, 25.1],
    renderSurface: true,
    openSea: true,
    waveIntensity: 1,
    polygon: [
      [54.65, 24.7],
      [54.65, 25.45],
      [55.5, 25.45],
      [55.5, 24.7],
      [54.65, 24.7],
    ],
    holes: [
      DUBAI_MAINLAND_LAND,
      PALM_JUMEIRAH_SURROUND_OUTER,
      PALM_JEBEL_ALI_SURROUND_OUTER,
    ],
  },

  // 2. Water surrounding Palm Jebel Ali — outer ring, hole removes the land.
  {
    id: "palm-jebel-ali-surrounding",
    name: "Water Surrounding Palm Jebel Ali",
    center: [55.005, 25.0],
    renderSurface: true,
    waveIntensity: 0.55,
    polygon: PALM_JEBEL_ALI_SURROUND_OUTER,
    holes: [PALM_JEBEL_ALI_LAND],
  },

  // 3. Water between Palm Jebel Ali and Dubai Marina — connector sea.
  {
    id: "jebel-ali-marina-connector",
    name: "Water Between Palm Jebel Ali and Dubai Marina",
    center: [55.075, 25.03],
    renderSurface: false,
    openSea: true,
    waveIntensity: 0.85,
    polygon: [
      [55.045, 25.009],
      [55.05, 25.02],
      [55.06, 25.032],
      [55.075, 25.042],
      [55.09, 25.05],
      [55.105, 25.055],
      [55.115, 25.058],
      [55.12, 25.05],
      [55.11, 25.04],
      [55.095, 25.03],
      [55.08, 25.02],
      [55.065, 25.012],
      [55.05, 25.005],
      [55.045, 25.009],
    ],
  },

  // 4. JBR offshore water — exposed sea in front of the JBR beachfront.
  {
    id: "jbr-offshore",
    name: "JBR Offshore Water",
    center: [55.14, 25.06],
    renderSurface: false,
    openSea: true,
    waveIntensity: 0.9,
    polygon: [
      [55.115, 25.058],
      [55.108, 25.065],
      [55.1, 25.075],
      [55.095, 25.086],
      [55.093, 25.098],
      [55.097, 25.113],
      [55.099, 25.108],
      [55.102, 25.104],
      [55.106, 25.1005],
      [55.111, 25.0975],
      [55.117, 25.0955],
      [55.124, 25.0945],
      [55.132, 25.094],
      [55.14, 25.094],
      [55.148, 25.094],
      [55.155, 25.0945],
      [55.161, 25.0955],
      [55.166, 25.07],
      [55.16, 25.066],
      [55.15, 25.062],
      [55.135, 25.058],
      [55.12, 25.055],
      [55.115, 25.058],
    ],
    holes: [MARINA_JBR_MAINLAND],
  },

  // 5. Water surrounding Palm Jumeirah — outer ring, hole removes the
  // crescent breakwater land strip.
  {
    id: "palm-jumeirah-surrounding",
    name: "Water Surrounding Palm Jumeirah",
    center: [55.135, 25.115],
    renderSurface: true,
    waveIntensity: 0.6,
    polygon: PALM_JUMEIRAH_SURROUND_OUTER,
    holes: [PALM_JUMEIRAH_CRESCENT_LAND, PALM_JUMEIRAH_TRUNK_FRONDS],
  },

  // 6. Palm inner lagoons — sheltered water between the crescent and the
  // trunk/fronds. Hole removes the trunk + frond comb landmass.
  {
    id: "palm-inner-lagoons",
    name: "Palm Jumeirah Inner Lagoon",
    center: [55.138, 25.116],
    renderSurface: false,
    waveIntensity: 0.25,
    polygon: [
      [55.105, 25.1051],
      [55.1057, 25.1067],
      [55.1068, 25.1082],
      [55.1083, 25.1096],
      [55.1101, 25.1109],
      [55.1123, 25.1121],
      [55.1148, 25.1131],
      [55.1175, 25.1139],
      [55.1205, 25.1146],
      [55.1236, 25.1151],
      [55.1269, 25.1154],
      [55.1302, 25.1156],
      [55.1335, 25.1156],
      [55.1368, 25.1154],
      [55.14, 25.115],
      [55.1431, 25.1144],
      [55.146, 25.1135],
      [55.1486, 25.1124],
      [55.151, 25.111],
      [55.1531, 25.1094],
      [55.1549, 25.1075],
      [55.1564, 25.1053],
      [55.1577, 25.1039],
      [55.155, 25.1],
      [55.15, 25.096],
      [55.14, 25.093],
      [55.13, 25.093],
      [55.12, 25.096],
      [55.11, 25.1],
      [55.105, 25.1051],
    ],
    holes: [PALM_JUMEIRAH_TRUNK_FRONDS],
  },

  // 7. Dubai Marina channels — the developed marina basin itself (distinct
  // from the open JBR sea in front of it).
  {
    id: "marina-channels",
    name: "Dubai Marina Channels",
    center: [55.138, 25.078],
    renderSurface: true,
    waveIntensity: 0.35,
    polygon: [
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

  // 8. Dubai Creek — narrow tidal estuary, both banks traced.
  {
    id: "dubai-creek",
    name: "Dubai Creek",
    center: [55.32, 25.235],
    renderSurface: true,
    waveIntensity: 0.3,
    polygon: [
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

  // 9. Dubai Water Canal & Business Bay — narrow urban canal, calm water.
  {
    id: "business-bay-canal",
    name: "Dubai Water Canal & Business Bay",
    center: [55.26, 25.185],
    renderSurface: true,
    waveIntensity: 0.22,
    polygon: [
      [55.2665, 25.1665],
      [55.2648, 25.1725],
      [55.2662, 25.1785],
      [55.269, 25.1845],
      [55.2724, 25.1885],
      [55.2742, 25.1875],
      [55.271, 25.1835],
      [55.2682, 25.1775],
      [55.2668, 25.1715],
      [55.2685, 25.1665],
      [55.2665, 25.1665],
    ],
  },
];

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
