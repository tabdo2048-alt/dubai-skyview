// Dubai animated water surfaces for the 3D water layer.
// Coordinates are [lng, lat].
//
// IMPORTANT: This file is the SOLE SOURCE for animated water surface coverage.
// It is intentionally decoupled from vessel routing:
//   - Vessel navigation safety masks live in src/lib/navigationWater.ts
//   - Named vessel routes live in src/lib/marineRoutes.ts
// The hand-drawn route lines used to design those systems are NOT used here.
//
// The hand-traced water geometry has been removed. WATER_AREAS is refilled from
// real OpenStreetMap-derived geometry (src/lib/coastline.generated.ts, produced
// by scripts/generate-water-geometry.ts) so animated water covers the entire sea
// inside the map bounds, clipped exactly to the real coastline and islands.

import {
  SEA_POLYGONS,
  PALM_LAGOON_RING,
  PALM_LAGOON_HOLES,
  MARINA_RING,
  CREEK_RING,
  CREEK_ISLAND_HOLES,
  CANAL_RING,
} from "@/lib/coastline.generated";

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
  // When true, the OUTER ring is a water-water seam (e.g. the Palm lagoon meets
  // the open sea at the crescent openings), so no shoreline foam is drawn along
  // it — but the area's HOLES (real land) still get foam. Generalizes the old
  // PALM_JUMEIRAH_SURROUND_RING identity hack. Defaults to false.
  suppressOuterFoam?: boolean;
  // Per-area wave energy fed to the shared Gerstner model: 1 = exposed open
  // Gulf, lower = sheltered Marina/Creek/lagoon. Defaults to 1.
  waveIntensity?: number;
};

// Five rendered basins, all from OSM-derived geometry:
//   1. open-sea — the whole Gulf inside the map bounds, minus real land/islands.
//   2. palm-lagoon — calm sheltered water inside the Palm Jumeirah crescent.
//   3-5. marina / creek / canal — the developed basins (own OSM relations).
export const WATER_AREAS: WaterArea[] = [
  // One open-sea surface per sea lobe. The Gulf inside COVER can be split by the
  // coast (e.g. the RAK/Sharjah headland caps the north edge) into a western and
  // an eastern lobe; both render so water reaches every map edge.
  ...SEA_POLYGONS.map((sp, i): WaterArea => ({
    id: i === 0 ? "open-sea" : `open-sea-${i}`,
    name: i === 0 ? "Arabian Gulf" : `Arabian Gulf (lobe ${i + 1})`,
    center: sp.outer[0],
    renderSurface: true,
    openSea: true,
    waveIntensity: 1,
    polygon: sp.outer,
    holes: sp.holes,
  })),
  {
    id: "palm-lagoon",
    name: "Palm Jumeirah Inner Lagoon",
    center: [55.13, 25.11],
    renderSurface: true,
    waveIntensity: 0.25,
    // Outer ring meets the open sea at the crescent openings — a water-water
    // seam, so suppress foam there; the frond/land holes still get foam.
    suppressOuterFoam: true,
    polygon: PALM_LAGOON_RING,
    holes: PALM_LAGOON_HOLES,
  },
  {
    id: "marina-channels",
    name: "Dubai Marina Channels",
    center: [55.14, 25.08],
    renderSurface: true,
    waveIntensity: 0.35,
    polygon: MARINA_RING,
  },
  {
    id: "dubai-creek",
    name: "Dubai Creek",
    center: [55.33, 25.24],
    renderSurface: true,
    waveIntensity: 0.3,
    polygon: CREEK_RING,
    holes: CREEK_ISLAND_HOLES,
  },
  {
    id: "business-bay-canal",
    name: "Dubai Water Canal & Business Bay",
    center: [55.26, 25.185],
    renderSurface: true,
    waveIntensity: 0.22,
    polygon: CANAL_RING,
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
