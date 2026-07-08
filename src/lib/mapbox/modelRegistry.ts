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

// Routes hug the real basins (Marina, Palm, Gulf, Creek, Business Bay canal)
// so boats stay on water and never cross land.
export const MODEL_REGISTRY: ModelConfig[] = [
  {
    id: "marina-yacht-01",
    name: "Marina Yacht 01",
    type: "yacht",
    modelUrl: "/models/yacht.glb",
    lng: 55.1405,
    lat: 25.0705,
    altitude: 0,
    scale: 1,
    rotation: [0, 0, 0],
    animate: true,
    route: [
      [55.1405, 25.0705],
      [55.1385, 25.0745],
      [55.136, 25.079],
      [55.133, 25.083],
      [55.13, 25.0865],
      [55.1275, 25.0895],
    ],
    speed: 0.03,
    visibleFromZoom: 11,
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
    scale: 1,
    rotation: [0, 0, 0],
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
    speed: 0.024,
    visibleFromZoom: 11,
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
    scale: 1,
    rotation: [0, 0, 0],
    animate: true,
    route: [
      [55.1, 25.13],
      [55.115, 25.136],
      [55.135, 25.138],
      [55.155, 25.134],
      [55.165, 25.124],
    ],
    speed: 0.014,
    visibleFromZoom: 11,
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
    scale: 1,
    rotation: [0, 0, 0],
    animate: true,
    route: [
      [55.3, 25.262],
      [55.308, 25.25],
      [55.317, 25.238],
      [55.326, 25.228],
      [55.332, 25.221],
    ],
    speed: 0.05,
    visibleFromZoom: 11,
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
    scale: 1,
    rotation: [0, 0, 0],
    animate: true,
    route: [
      [55.2705, 25.1875],
      [55.2685, 25.182],
      [55.267, 25.1765],
      [55.2685, 25.171],
      [55.272, 25.1665],
    ],
    speed: 0.035,
    visibleFromZoom: 11,
    visibleToZoom: 20,
  },
];
