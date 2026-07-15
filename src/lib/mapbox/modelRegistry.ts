// The registry of 3D models placed on the Dubai map. Edit this list to add,
// remove, or reposition models — Model3DLayer renders whatever is here.
//
// To add your own model:
//   1. Drop a GLB into public/models/ (e.g. public/models/my-yacht.glb).
//   2. Add a ModelConfig entry below with modelUrl: "/models/my-yacht.glb".
//   3. Give it a water `route` + `speed` if it should move, or just lng/lat.
// Until a real GLB exists at modelUrl, a low-poly placeholder is used and a
// console warning is logged — nothing crashes.

import type { ModelConfig } from "./modelTypes";
import {
  defaultMarineRouteIdForVessel,
  defaultSpeedMetersPerSecond,
  getMarineRoute,
  hashRouteSeed,
  marineRoutesForVesselType,
} from "@/lib/marineRoutes";

type VesselOrientation = Pick<
  ModelConfig,
  "rotation" | "forwardAxis" | "headingOffset" | "sternOffset" | "turnSpeed"
>;

// Each GLB is exported with its own bow axis. These static corrections stay on
// the child model; Model3DLayer rotates only the parent group along the route.
// sternOffset is ~45% of WATERCRAFT_DISPLAY_LENGTH_METERS for the type (see
// modelTypes.ts) — the actual rendered size, since fitModelToDisplaySize()
// derives scale from that table directly and ignores config.scale for
// watercraft (a stale per-type multiplier here would silently do nothing —
// see git history for the VESSEL_SIZE_BOOST this file used to carry).
const VESSEL_ORIENTATIONS: Record<string, VesselOrientation> = {
  "/models/ship.glb": {
    rotation: [Math.PI / 2, 0, 0],
    forwardAxis: "-x",
    headingOffset: 0,
    sternOffset: 80,
    turnSpeed: 2.2,
  },
  "/models/yacht.glb": {
    rotation: [Math.PI / 2, 0, 0],
    forwardAxis: "+x",
    headingOffset: 0,
    sternOffset: 27,
    turnSpeed: 3.5,
  },
  "/models/boat.glb": {
    rotation: [Math.PI / 2, 0, 0],
    forwardAxis: "+x",
    headingOffset: 0,
    sternOffset: 8,
    turnSpeed: 4.8,
  },
  "/models/abra.glb": {
    rotation: [Math.PI / 2, 0, 0],
    forwardAxis: "+x",
    headingOffset: 0,
    sternOffset: 4.5,
    turnSpeed: 5.2,
  },
};

function routeIsClosed(route?: [number, number][]) {
  if (!route || route.length < 2) return false;
  const first = route[0];
  const last = route[route.length - 1];
  return Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.000001;
}

function isWatercraftType(type: ModelConfig["type"]) {
  return type === "boat" || type === "yacht" || type === "ship" || type === "abra";
}

// Landmark basin a vessel belongs to, read off its id prefix (every
// BASE_MODEL_REGISTRY entry follows "<basin>-<type>-NN") — this is where the
// hand-authored intent behind each vessel's original lng/lat/route actually
// lives, so route-pool selection in distributeFleetEvenly can honor it
// without reviving the raw (unvalidated) route arrays themselves.
type HomeArea = "marina" | "palm" | "jbr-harbour" | "creek" | "business-bay" | "offshore";

function homeAreaForVesselId(id: string): HomeArea {
  if (id.startsWith("marina-")) return "marina";
  if (id.startsWith("palm-")) return "palm";
  if (id.startsWith("jbr-") || id.startsWith("harbour-")) return "jbr-harbour";
  if (id.startsWith("creek-")) return "creek";
  if (id.startsWith("business-bay-")) return "business-bay";
  return "offshore";
}

// Named routes (marineRoutes.ts) each home area should prefer. Empty pool =
// no basin route fits this area/type combo; distributeFleetEvenly falls back
// to marineRoutesForVesselType(type) (the full open-sea + basin pool).
const HOME_AREA_ROUTE_POOLS: Record<HomeArea, string[]> = {
  marina: ["marina-inner-channel", "marina-entrance-lane"],
  palm: ["palm-outer-clockwise", "palm-inner-lagoon"],
  "jbr-harbour": ["jbr-offshore-lane", "marina-entrance-lane"],
  creek: ["creek-northbound-lane", "creek-southbound-lane"],
  "business-bay": ["business-bay-canal"],
  offshore: [],
};

// Routes hug the real basins (Marina, Palm, Gulf, Creek, Business Bay canal)
// so boats stay on water and never cross land.
const BASE_MODEL_REGISTRY: ModelConfig[] = [
  {
    id: "marina-yacht-01",
    name: "Marina Yacht 01",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    lng: 55.1405,
    lat: 25.0705,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.1405, 25.0705],
      [55.1385, 25.0745],
      [55.136, 25.079],
      [55.133, 25.083],
      [55.13, 25.0865],
      [55.1275, 25.0895],
    ],
    speed: 0.06,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-yacht-01",
    name: "Palm Jumeirah Yacht",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    lng: 55.118,
    lat: 25.108,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.118, 25.108],
      [55.13, 25.106],
      [55.142, 25.108],
      [55.15, 25.116],
      [55.144, 25.125],
      [55.132, 25.128],
      [55.12, 25.124],
    ],
    speed: 0.048,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "marina-yacht-02",
    name: "Marina Yacht 02 (Navy)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x1f3a5f, // deep navy hull
    lng: 55.135,
    lat: 25.088,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.135, 25.088],
      [55.1325, 25.0845],
      [55.1345, 25.0805],
      [55.138, 25.0785],
      [55.141, 25.0815],
      [55.1395, 25.0855],
    ],
    speed: 0.054,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-yacht-02",
    name: "Palm Jumeirah Yacht (Champagne)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xd9c7a3, // warm champagne hull
    lng: 55.146,
    lat: 25.118,
    altitude: 0,
    scale: 36.576,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.146, 25.118],
      [55.138, 25.114],
      [55.128, 25.112],
      [55.12, 25.116],
      [55.126, 25.122],
      [55.138, 25.124],
      [55.148, 25.122],
    ],
    speed: 0.04,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-yacht-03",
    name: "Arabian Gulf Yacht (Graphite)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x3a3f45, // graphite/charcoal hull
    lng: 55.108,
    lat: 25.118,
    altitude: 0,
    scale: 39.757,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.108, 25.118],
      [55.1, 25.125],
      [55.095, 25.134],
      [55.104, 25.142],
      [55.116, 25.14],
      [55.12, 25.13],
    ],
    speed: 0.036,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-cargo-ship-01",
    name: "Arabian Gulf Cargo Ship",
    type: "ship",
    modelUrl: "/models/ship.glb",
    lng: 55.1,
    lat: 25.13,
    altitude: 0,
    scale: 2138.281,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.1, 25.13],
      [55.115, 25.136],
      [55.135, 25.138],
      [55.155, 25.134],
      [55.165, 25.124],
    ],
    speed: 0.028,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "creek-abra-01",
    name: "Dubai Creek Abra",
    type: "abra",
    modelUrl: "/models/abra.glb",
    lng: 55.3,
    lat: 25.262,
    altitude: 0,
    scale: 19.603,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.3, 25.262],
      [55.308, 25.25],
      [55.317, 25.238],
      [55.326, 25.228],
      [55.332, 25.221],
    ],
    speed: 0.1,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "business-bay-boat-01",
    name: "Business Bay Tourist Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    lng: 55.2705,
    lat: 25.1875,
    altitude: 0,
    scale: 19.603,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.2705, 25.1875],
      [55.2685, 25.182],
      [55.267, 25.1765],
      [55.2685, 25.171],
      [55.272, 25.1665],
    ],
    speed: 0.07,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },

  // --- Palm Jumeirah focus: yachts & boats looping the crescent + fronds ---
  {
    id: "palm-crescent-yacht-01",
    name: "Palm Crescent Yacht",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xffffff,
    lng: 55.118,
    lat: 25.108,
    altitude: 0,
    scale: 34.986,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.118, 25.108],
      [55.113, 25.118],
      [55.117, 25.13],
      [55.13, 25.138],
      [55.145, 25.138],
      [55.158, 25.13],
      [55.163, 25.118],
      [55.158, 25.107],
      [55.145, 25.101],
      [55.13, 25.1],
      [55.118, 25.108],
    ],
    speed: 0.032,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-crescent-yacht-02",
    name: "Palm Crescent Yacht (Navy)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x1f3a5f,
    lng: 55.158,
    lat: 25.13,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.158, 25.13],
      [55.145, 25.138],
      [55.13, 25.138],
      [55.117, 25.13],
      [55.113, 25.118],
      [55.118, 25.108],
      [55.13, 25.1],
      [55.145, 25.101],
      [55.158, 25.107],
      [55.163, 25.118],
      [55.158, 25.13],
    ],
    speed: 0.038,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-tourist-boat-01",
    name: "Palm Tourist Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xffffff,
    lng: 55.126,
    lat: 25.106,
    altitude: 0,
    scale: 17.643,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.126, 25.106],
      [55.132, 25.112],
      [55.14, 25.116],
      [55.148, 25.112],
      [55.152, 25.106],
      [55.146, 25.102],
      [55.136, 25.1],
      [55.126, 25.106],
    ],
    speed: 0.06,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-tourist-boat-02",
    name: "Palm Frond Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xeef4f7,
    lng: 55.14,
    lat: 25.132,
    altitude: 0,
    scale: 16.663,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.14, 25.132],
      [55.132, 25.128],
      [55.126, 25.122],
      [55.132, 25.126],
      [55.142, 25.129],
      [55.15, 25.126],
      [55.14, 25.132],
    ],
    speed: 0.068,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-abra-01",
    name: "Palm Water Taxi",
    type: "abra",
    modelUrl: "/models/abra.glb",
    color: 0x8d6e63,
    lng: 55.12,
    lat: 25.112,
    altitude: 0,
    scale: 17.643,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.12, 25.112],
      [55.128, 25.114],
      [55.136, 25.116],
      [55.144, 25.114],
      [55.15, 25.11],
      [55.144, 25.108],
      [55.132, 25.108],
      [55.12, 25.112],
    ],
    speed: 0.056,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },

  // --- Dubai Harbour + JBR coastline ---
  {
    id: "harbour-yacht-01",
    name: "Dubai Harbour Yacht",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xd9c7a3,
    lng: 55.148,
    lat: 25.094,
    altitude: 0,
    scale: 33.396,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.148, 25.094],
      [55.14, 25.1],
      [55.132, 25.104],
      [55.126, 25.1],
      [55.132, 25.094],
      [55.14, 25.09],
      [55.148, 25.094],
    ],
    speed: 0.044,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "harbour-ship-01",
    name: "Dubai Harbour Cruise Ship",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0x9fb4c7,
    lng: 55.13,
    lat: 25.088,
    altitude: 0,
    scale: 2352.109,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.13, 25.088],
      [55.118, 25.092],
      [55.108, 25.1],
      [55.104, 25.11],
      [55.112, 25.104],
      [55.122, 25.096],
      [55.13, 25.088],
    ],
    speed: 0.026,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "jbr-boat-01",
    name: "JBR Beach Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xffffff,
    lng: 55.128,
    lat: 25.076,
    altitude: 0,
    scale: 16.663,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.128, 25.076],
      [55.12, 25.082],
      [55.112, 25.09],
      [55.108, 25.098],
      [55.114, 25.09],
      [55.122, 25.082],
      [55.128, 25.076],
    ],
    speed: 0.064,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "jbr-yacht-01",
    name: "JBR Marina Yacht",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x3a3f45,
    lng: 55.134,
    lat: 25.082,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.134, 25.082],
      [55.128, 25.09],
      [55.12, 25.096],
      [55.114, 25.092],
      [55.122, 25.086],
      [55.13, 25.08],
      [55.134, 25.082],
    ],
    speed: 0.048,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },

  // --- Extra Marina, Creek & Business Bay traffic ---
  {
    id: "marina-boat-03",
    name: "Marina Tour Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xeef4f7,
    lng: 55.142,
    lat: 25.072,
    altitude: 0,
    scale: 15.683,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.142, 25.072],
      [55.138, 25.078],
      [55.134, 25.084],
      [55.13, 25.089],
      [55.135, 25.083],
      [55.139, 25.077],
      [55.142, 25.072],
    ],
    speed: 0.072,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "creek-abra-02",
    name: "Dubai Creek Abra 02",
    type: "abra",
    modelUrl: "/models/abra.glb",
    color: 0xa1887f,
    lng: 55.31,
    lat: 25.252,
    altitude: 0,
    scale: 17.643,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.31, 25.252],
      [55.317, 25.242],
      [55.325, 25.232],
      [55.332, 25.224],
      [55.326, 25.23],
      [55.318, 25.24],
      [55.31, 25.252],
    ],
    speed: 0.092,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "business-bay-boat-02",
    name: "Business Bay Canal Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xffffff,
    lng: 55.268,
    lat: 25.184,
    altitude: 0,
    scale: 15.683,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.268, 25.184],
      [55.2665, 25.1785],
      [55.2675, 25.173],
      [55.2705, 25.1685],
      [55.269, 25.174],
      [55.2675, 25.18],
      [55.268, 25.184],
    ],
    speed: 0.076,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },

  // --- Extra fleet: more ships & boats across all basins, fast-moving ---
  {
    id: "gulf-cargo-ship-02",
    name: "Gulf Cargo Ship 02",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0x8fa3b5,
    lng: 55.09,
    lat: 25.14,
    altitude: 0,
    scale: 2138.281,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.09, 25.14],
      [55.105, 25.148],
      [55.125, 25.152],
      [55.148, 25.15],
      [55.165, 25.142],
      [55.17, 25.13],
      [55.155, 25.132],
      [55.13, 25.138],
      [55.09, 25.14],
    ],
    speed: 0.032,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-cargo-ship-03",
    name: "Gulf Container Ship",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0xb0453a,
    lng: 55.075,
    lat: 25.12,
    altitude: 0,
    scale: 2352.109,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.075, 25.12],
      [55.08, 25.135],
      [55.09, 25.15],
      [55.105, 25.158],
      [55.09, 25.148],
      [55.078, 25.132],
      [55.075, 25.12],
    ],
    speed: 0.028,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-cargo-ship-04",
    name: "Offshore Tanker",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0x556677,
    lng: 55.06,
    lat: 25.16,
    altitude: 0,
    scale: 2566.0,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.06, 25.16],
      [55.08, 25.17],
      [55.105, 25.172],
      [55.13, 25.168],
      [55.11, 25.166],
      [55.085, 25.166],
      [55.06, 25.16],
    ],
    speed: 0.026,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "harbour-ship-02",
    name: "Harbour Cruise Liner",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0xdfe6ec,
    lng: 55.115,
    lat: 25.085,
    altitude: 0,
    scale: 2780.0,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.115, 25.085],
      [55.1, 25.092],
      [55.088, 25.102],
      [55.082, 25.114],
      [55.092, 25.106],
      [55.104, 25.095],
      [55.115, 25.085],
    ],
    speed: 0.024,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "marina-yacht-04",
    name: "Marina Yacht 04 (Pearl)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xf0ead6,
    lng: 55.144,
    lat: 25.076,
    altitude: 0,
    scale: 33.396,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.144, 25.076],
      [55.139, 25.083],
      [55.133, 25.09],
      [55.128, 25.096],
      [55.134, 25.089],
      [55.14, 25.082],
      [55.144, 25.076],
    ],
    speed: 0.052,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "marina-yacht-05",
    name: "Marina Yacht 05 (Crimson)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x7a2f2f,
    lng: 55.137,
    lat: 25.07,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.137, 25.07],
      [55.132, 25.078],
      [55.127, 25.086],
      [55.132, 25.092],
      [55.139, 25.085],
      [55.143, 25.077],
      [55.137, 25.07],
    ],
    speed: 0.058,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "marina-boat-04",
    name: "Marina Speedboat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xffd54f,
    lng: 55.146,
    lat: 25.078,
    altitude: 0,
    scale: 14.7,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.146, 25.078],
      [55.14, 25.085],
      [55.133, 25.092],
      [55.127, 25.088],
      [55.134, 25.081],
      [55.141, 25.075],
      [55.146, 25.078],
    ],
    speed: 0.11,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "marina-boat-05",
    name: "Marina Jet Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0x26c6da,
    lng: 55.132,
    lat: 25.086,
    altitude: 0,
    scale: 13.7,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.132, 25.086],
      [55.128, 25.08],
      [55.134, 25.075],
      [55.141, 25.078],
      [55.138, 25.085],
      [55.132, 25.086],
    ],
    speed: 0.12,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-crescent-yacht-03",
    name: "Palm Crescent Yacht (Gold)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xc9a84c,
    lng: 55.163,
    lat: 25.118,
    altitude: 0,
    scale: 36.576,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.163, 25.118],
      [55.158, 25.107],
      [55.145, 25.101],
      [55.13, 25.1],
      [55.118, 25.108],
      [55.113, 25.118],
      [55.117, 25.13],
      [55.13, 25.138],
      [55.145, 25.138],
      [55.158, 25.13],
      [55.163, 25.118],
    ],
    speed: 0.04,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-boat-03",
    name: "Palm Frond Speedboat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xff7043,
    lng: 55.152,
    lat: 25.106,
    altitude: 0,
    scale: 14.7,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.152, 25.106],
      [55.146, 25.102],
      [55.136, 25.1],
      [55.126, 25.106],
      [55.132, 25.112],
      [55.14, 25.116],
      [55.148, 25.112],
      [55.152, 25.106],
    ],
    speed: 0.105,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "palm-abra-02",
    name: "Palm Water Taxi 02",
    type: "abra",
    modelUrl: "/models/abra.glb",
    color: 0x9c6b4f,
    lng: 55.15,
    lat: 25.11,
    altitude: 0,
    scale: 17.643,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.15, 25.11],
      [55.144, 25.108],
      [55.132, 25.108],
      [55.12, 25.112],
      [55.128, 25.114],
      [55.136, 25.116],
      [55.144, 25.114],
      [55.15, 25.11],
    ],
    speed: 0.07,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "harbour-yacht-02",
    name: "Dubai Harbour Yacht 02",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x2e5266,
    lng: 55.126,
    lat: 25.1,
    altitude: 0,
    scale: 33.396,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.126, 25.1],
      [55.132, 25.094],
      [55.14, 25.09],
      [55.148, 25.094],
      [55.14, 25.1],
      [55.132, 25.104],
      [55.126, 25.1],
    ],
    speed: 0.05,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "harbour-boat-01",
    name: "Harbour Speedboat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0x66bb6a,
    lng: 55.12,
    lat: 25.096,
    altitude: 0,
    scale: 13.7,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.12, 25.096],
      [55.112, 25.1],
      [55.106, 25.108],
      [55.112, 25.104],
      [55.12, 25.098],
      [55.12, 25.096],
    ],
    speed: 0.115,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "jbr-boat-02",
    name: "JBR Beach Speedboat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0x42a5f5,
    lng: 55.122,
    lat: 25.08,
    altitude: 0,
    scale: 14.2,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.122, 25.08],
      [55.114, 25.086],
      [55.108, 25.094],
      [55.114, 25.088],
      [55.122, 25.082],
      [55.122, 25.08],
    ],
    speed: 0.108,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "jbr-yacht-02",
    name: "JBR Marina Yacht 02",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xe0e0e0,
    lng: 55.13,
    lat: 25.08,
    altitude: 0,
    scale: 31.806,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.13, 25.08],
      [55.122, 25.086],
      [55.114, 25.092],
      [55.12, 25.096],
      [55.128, 25.09],
      [55.134, 25.082],
      [55.13, 25.08],
    ],
    speed: 0.048,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "creek-abra-03",
    name: "Dubai Creek Abra 03",
    type: "abra",
    modelUrl: "/models/abra.glb",
    color: 0x8d6e63,
    lng: 55.295,
    lat: 25.268,
    altitude: 0,
    scale: 18.6,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.295, 25.268],
      [55.304, 25.256],
      [55.313, 25.244],
      [55.322, 25.234],
      [55.314, 25.243],
      [55.305, 25.255],
      [55.295, 25.268],
    ],
    speed: 0.1,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "creek-boat-01",
    name: "Dubai Creek Tour Boat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0xffffff,
    lng: 55.32,
    lat: 25.23,
    altitude: 0,
    scale: 16.663,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.32, 25.23],
      [55.326, 25.222],
      [55.332, 25.216],
      [55.325, 25.223],
      [55.318, 25.231],
      [55.32, 25.23],
    ],
    speed: 0.085,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "business-bay-boat-03",
    name: "Business Bay Canal Boat 03",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0x29b6f6,
    lng: 55.272,
    lat: 25.19,
    altitude: 0,
    scale: 15.2,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.272, 25.19],
      [55.27, 25.184],
      [55.268, 25.178],
      [55.269, 25.172],
      [55.271, 25.178],
      [55.273, 25.184],
      [55.272, 25.19],
    ],
    speed: 0.09,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "business-bay-boat-04",
    name: "Business Bay Water Taxi",
    type: "abra",
    modelUrl: "/models/abra.glb",
    color: 0xa1887f,
    lng: 55.269,
    lat: 25.186,
    altitude: 0,
    scale: 16.2,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.269, 25.186],
      [55.2675, 25.18],
      [55.2685, 25.174],
      [55.271, 25.169],
      [55.2695, 25.175],
      [55.268, 25.181],
      [55.269, 25.186],
    ],
    speed: 0.078,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-yacht-04",
    name: "Arabian Gulf Yacht (Azure)",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x1565c0,
    lng: 55.1,
    lat: 25.128,
    altitude: 0,
    scale: 38.0,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.1, 25.128],
      [55.092, 25.138],
      [55.098, 25.148],
      [55.112, 25.15],
      [55.12, 25.14],
      [55.114, 25.132],
      [55.1, 25.128],
    ],
    speed: 0.044,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  // --- Open Gulf fleet: intentionally spread across the wider sea, away from Palm ---
  {
    id: "gulf-west-yacht-01",
    name: "Arabian Gulf West Yacht",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0xf4f1e8,
    lng: 55.06,
    lat: 25.112,
    altitude: 0,
    scale: 34,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.053, 25.091],
      [55.06, 25.112],
      [55.072, 25.136],
      [55.086, 25.149],
      [55.075, 25.124],
      [55.061, 25.103],
      [55.053, 25.091],
    ],
    speed: 0.038,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-north-yacht-01",
    name: "Arabian Gulf North Yacht",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    color: 0x24445a,
    lng: 55.091,
    lat: 25.17,
    altitude: 0,
    scale: 35,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.067, 25.157],
      [55.091, 25.17],
      [55.118, 25.176],
      [55.144, 25.165],
      [55.12, 25.156],
      [55.092, 25.158],
      [55.067, 25.157],
    ],
    speed: 0.035,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-west-boat-01",
    name: "Arabian Gulf West Speedboat",
    type: "boat",
    modelUrl: "/models/boat.glb",
    color: 0x4fc3f7,
    lng: 55.09,
    lat: 25.153,
    altitude: 0,
    scale: 17,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.076, 25.139],
      [55.09, 25.153],
      [55.108, 25.16],
      [55.126, 25.156],
      [55.107, 25.15],
      [55.089, 25.142],
      [55.076, 25.139],
    ],
    speed: 0.075,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-west-ship-01",
    name: "Arabian Gulf West Cargo Ship",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0x93a5b3,
    lng: 55.065,
    lat: 25.148,
    altitude: 0,
    scale: 2400,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.055, 25.118],
      [55.065, 25.148],
      [55.095, 25.17],
      [55.13, 25.177],
      [55.155, 25.162],
      [55.125, 25.152],
      [55.088, 25.142],
      [55.055, 25.118],
    ],
    speed: 0.022,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
  {
    id: "gulf-north-ship-01",
    name: "Arabian Gulf North Cargo Ship",
    type: "ship",
    modelUrl: "/models/ship.glb",
    color: 0xc7d0d6,
    lng: 55.105,
    lat: 25.174,
    altitude: 0,
    scale: 2450,
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
    animate: true,
    route: [
      [55.07, 25.158],
      [55.105, 25.174],
      [55.145, 25.172],
      [55.17, 25.152],
      [55.145, 25.157],
      [55.105, 25.158],
      [55.07, 25.158],
    ],
    speed: 0.02,
    visibleFromZoom: 9,
    visibleToZoom: 20,
  },
];

const ENTERPRISE_FLEET_TARGETS: Partial<Record<ModelConfig["type"], number>> = {
  ship: 12,
  yacht: 35,
  boat: 45,
  abra: 15,
};

const TYPE_COLOR_SWATCHES: Partial<Record<ModelConfig["type"], number[]>> = {
  ship: [0x8fa3b5, 0xc7d0d6, 0x93a5b3, 0xb0453a],
  yacht: [0xffffff, 0xf4f1e8, 0xd9c7a3, 0x24445a, 0x3a3f45, 0xc9a84c],
  boat: [0xffffff, 0x4fc3f7, 0xffd54f, 0x66bb6a, 0xff7043, 0xeef4f7],
  abra: [0x8d6e63, 0xa1887f, 0x9c6b4f, 0xb58a5a],
};

function deterministicScaleNudge(index: number) {
  return 0.94 + ((index * 7) % 13) / 100;
}

function expandFleetForEnterpriseTraffic(configs: ModelConfig[]) {
  const expanded = [...configs];

  for (const [type, targetCount] of Object.entries(ENTERPRISE_FLEET_TARGETS) as [
    ModelConfig["type"],
    number,
  ][]) {
    const templates = configs.filter((config) => config.type === type);
    if (templates.length === 0) continue;
    const currentCount = expanded.filter((config) => config.type === type).length;
    const palette = TYPE_COLOR_SWATCHES[type] ?? [];

    for (let i = currentCount; i < targetCount; i++) {
      const template = templates[i % templates.length];
      const id = `enterprise-${type}-${String(i + 1).padStart(2, "0")}`;
      const scaleNudge = deterministicScaleNudge(i);
      expanded.push({
        ...template,
        id,
        name: `Enterprise ${type} ${String(i + 1).padStart(2, "0")}`,
        color: palette[i % palette.length] ?? template.color,
        lng: template.lng,
        lat: template.lat,
        homeArea: template.homeArea ?? homeAreaForVesselId(template.id),
        route: undefined,
        routeId: defaultMarineRouteIdForVessel(id, type),
        routeMode: "pingpong",
        startProgress: ((i * 997) % 1000) / 1000,
        speed: undefined,
        speedMetersPerSecond: defaultSpeedMetersPerSecond(type) * (0.88 + ((i * 11) % 19) / 100),
        scale: template.scale * scaleNudge,
      });
    }
  }

  return expanded;
}

function normalizeRegistry(configs: ModelConfig[]) {
  return configs.map((rawConfig) => {
    const config = rawConfig as ModelConfig;
    const normalized: ModelConfig = {
      ...(VESSEL_ORIENTATIONS[config.modelUrl] ?? {}),
      routeMode: routeIsClosed(config.route) ? "loop" : "pingpong",
      ...config,
    };

    if (!isWatercraftType(normalized.type)) return normalized;

    const watercraft: ModelConfig = {
      ...normalized,
      route: undefined,
      routeId: normalized.routeId ?? defaultMarineRouteIdForVessel(normalized.id, normalized.type),
      routeMode: "pingpong",
      startProgress: normalized.startProgress ?? (hashRouteSeed(normalized.id) % 1000) / 1000,
      speedMetersPerSecond:
        normalized.speedMetersPerSecond ?? defaultSpeedMetersPerSecond(normalized.type),
      homeArea: normalized.homeArea ?? homeAreaForVesselId(normalized.id),
      scale: normalized.scale ?? 1,
    };
    return watercraft;
  });
}

function distributeFleetEvenly(configs: ModelConfig[]) {
  const distributed = configs.map((config) => ({ ...config }));

  for (const type of ["ship", "yacht", "boat", "abra"] as const) {
    const vessels = distributed.filter((config) => config.type === type);
    const fallbackRoutes = marineRoutesForVesselType(type);

    // Group by home area so each landmark basin gets a guaranteed contingent
    // instead of every vessel being interchangeably scattered across the
    // whole city (most of which is empty open-sea lanes far from any basin).
    const byArea = new Map<HomeArea, ModelConfig[]>();
    for (const vessel of vessels) {
      const area = (vessel.homeArea as HomeArea | undefined) ?? homeAreaForVesselId(vessel.id);
      const group = byArea.get(area) ?? [];
      group.push(vessel);
      byArea.set(area, group);
    }

    for (const [area, group] of byArea) {
      const homeRouteIds = HOME_AREA_ROUTE_POOLS[area];
      const homeRoutes = homeRouteIds
        .map((id) => getMarineRoute(id))
        .filter((route): route is NonNullable<typeof route> => !!route)
        .filter((route) => fallbackRoutes.some((r) => r.id === route.id));
      // Empty intersection (e.g. ships have no basin routes at all) falls
      // back to the full per-type pool so nothing goes unassigned.
      const routes = homeRoutes.length > 0 ? homeRoutes : fallbackRoutes;
      group.forEach((vessel, index) => {
        const route = routes[index % routes.length];
        vessel.routeId = route.id;
        vessel.routeMode =
          route.points.length > 2 && routeIsClosed(route.points) ? "loop" : "pingpong";
      });
    }
  }

  const routeGroups = new Map<string, ModelConfig[]>();
  for (const config of distributed) {
    if (!isWatercraftType(config.type) || !config.routeId) continue;
    const group = routeGroups.get(config.routeId) ?? [];
    group.push(config);
    routeGroups.set(config.routeId, group);
  }

  for (const [routeId, vessels] of routeGroups) {
    const route = getMarineRoute(routeId);
    if (!route) continue;
    vessels.sort((a, b) => a.id.localeCompare(b.id));
    vessels.forEach((vessel, index) => {
      // routePointAt uses distance-normalized progress, so this is true physical
      // spacing rather than waypoint-index spacing.
      vessel.startProgress = (index + 0.5) / vessels.length;
    });
  }

  return distributed;
}

export const MODEL_REGISTRY: ModelConfig[] = distributeFleetEvenly(
  normalizeRegistry(expandFleetForEnterpriseTraffic(BASE_MODEL_REGISTRY)),
);
