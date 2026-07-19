// Vessel fleet for the 3D vessel layer.
//
// Lanes are NO LONGER hand-authored. They are auto-generated from the real water
// polygons (WATER_AREAS in src/lib/water.ts) by src/lib/mapbox/waterMask.ts, which
// marches each lane forward in small metre steps and point-in-water tests every
// step — so a whole lane is provably inside water, never over land or an island.
// Generation is deterministic (seeded PRNG), so the fleet is identical every build.

import type { Group } from "three";
import { generateFleet, pointInWater } from "@/lib/mapbox/waterMask";

export type Path = [number, number][];

export type VesselSpec = {
  name: string;
  route: Path;
  count: number; // copies staggered evenly along the lane
  speedMps: number; // real sailing speed in metres/second
  sizeScale: number; // metre-mesh multiplier for readability at city zoom
  intensity: number; // wave energy of the basin (matches the basin's waveIntensity)
  build: () => Group;
};

export const VESSEL_FLEET: VesselSpec[] = generateFleet();

// DEV guard: prove the generator's contract at load time. Every waypoint of every
// route must lie on water; warn (don't throw) on any offender so the map still runs.
if (import.meta.env.DEV) {
  for (const spec of VESSEL_FLEET) {
    for (const [lng, lat] of spec.route) {
      if (!pointInWater(lng, lat)) {
        console.warn(`[marineRoutes] "${spec.name}" waypoint out of water: [${lng}, ${lat}]`);
      }
    }
  }
  // Expose internals so the Chrome verification check can reach ES-module state.
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__VESSEL_DEBUG = { VESSEL_FLEET, pointInWater };
  }
}
