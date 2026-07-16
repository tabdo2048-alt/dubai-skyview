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

// The hand-traced water geometry has been removed. WATER_AREAS is refilled from
// the OSM-derived generator output in a subsequent step; an empty list here is
// the intentional intermediate state (repo builds, no water renders yet).
export const WATER_AREAS: WaterArea[] = [];

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
