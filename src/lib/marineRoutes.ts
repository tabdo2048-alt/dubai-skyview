// Named vessel routes + fleet for the 3D vessel layer.
//
// Lanes are [lng, lat][] polylines authored to sit inside the WATER_AREAS
// basins (src/lib/water.ts) so vessels never sail onto land. Each fleet member's
// `intensity` mirrors its basin's `waveIntensity` so the boat bobs by the same
// amount as the surface under it. Coordinates are a first pass — tune them
// against the satellite basemap (they are the main "put it right" knob).

import type { Group } from "three";
import { buildBoat, buildShip, buildYacht } from "@/lib/mapbox/vesselModels";

export type Path = [number, number][];

// Open Gulf, offshore of Marina / JBR (open-sea basin, waveIntensity 1).
export const GULF_LANE: Path = [
  [55.045, 25.02],
  [55.09, 25.055],
  [55.14, 25.095],
  [55.19, 25.13],
];

// Dubai Marina channel (marina-channels basin, waveIntensity 0.35).
export const MARINA_LANE: Path = [
  [55.135, 25.074],
  [55.14, 25.081],
  [55.145, 25.088],
  [55.15, 25.094],
];

// Palm Jumeirah inner lagoon (palm-lagoon basin, waveIntensity 0.25).
export const PALM_LAGOON_LANE: Path = [
  [55.12, 25.105],
  [55.128, 25.111],
  [55.136, 25.117],
];

// Dubai Creek (dubai-creek basin, waveIntensity 0.3).
export const CREEK_LANE: Path = [
  [55.319, 25.25],
  [55.327, 25.242],
  [55.335, 25.234],
  [55.342, 25.227],
];

// Dubai Water Canal / Business Bay (business-bay-canal basin, waveIntensity 0.22).
export const CANAL_LANE: Path = [
  [55.25, 25.178],
  [55.258, 25.184],
  [55.266, 25.19],
  [55.274, 25.196],
];

export type VesselSpec = {
  name: string;
  route: Path;
  count: number; // copies staggered evenly along the lane
  speedMps: number; // real sailing speed in metres/second
  sizeScale: number; // metre-mesh multiplier for readability at city zoom
  intensity: number; // wave energy of the basin (match waveIntensity)
  build: () => Group;
};

// Speeds are real m/s: a ship cruises ~7 m/s (~14 kn), boats ~9 m/s, sheltered
// yachts idle slower. Sizes are exaggerated a few× so a 15–50 m hull still reads
// at city zoom without a real vessel's true (sub-pixel) footprint.
export const VESSEL_FLEET: VesselSpec[] = [
  { name: "gulf-ship", route: GULF_LANE, count: 1, speedMps: 7, sizeScale: 4.5, intensity: 1, build: buildShip },
  { name: "gulf-boats", route: GULF_LANE, count: 2, speedMps: 9, sizeScale: 9, intensity: 1, build: buildBoat },
  { name: "marina-yacht", route: MARINA_LANE, count: 1, speedMps: 4, sizeScale: 5.5, intensity: 0.35, build: buildYacht },
  { name: "marina-boats", route: MARINA_LANE, count: 2, speedMps: 6, sizeScale: 8.5, intensity: 0.35, build: buildBoat },
  { name: "palm-yacht", route: PALM_LAGOON_LANE, count: 1, speedMps: 4, sizeScale: 5.5, intensity: 0.25, build: buildYacht },
  { name: "palm-boat", route: PALM_LAGOON_LANE, count: 1, speedMps: 6, sizeScale: 8.5, intensity: 0.25, build: buildBoat },
  { name: "creek-boats", route: CREEK_LANE, count: 2, speedMps: 5, sizeScale: 8.5, intensity: 0.3, build: buildBoat },
  { name: "canal-yacht", route: CANAL_LANE, count: 1, speedMps: 3, sizeScale: 5, intensity: 0.22, build: buildYacht },
];
