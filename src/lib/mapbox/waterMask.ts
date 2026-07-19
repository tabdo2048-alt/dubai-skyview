// Water geometry tests + a deterministic, water-only vessel-lane generator.
//
// The animated water surface is triangulated from WATER_AREAS (src/lib/water.ts),
// so "inside a WATER_AREA polygon (minus its holes)" is exactly "on rendered
// water". This module reuses those same polygons to grow vessel lanes that are
// PROVABLY on water: a lane is marched forward in small metre steps and every
// step (and, in holed basins, its midpoint) is point-in-water tested, so the
// whole polyline — not just its vertices — stays off land and islands.
//
// Everything is deterministic: one seeded PRNG (mulberry32) consumed in a fixed
// order, so the fleet is byte-identical every build/reload and a Chrome-verified
// layout stays valid until the coastline data itself changes.

import { WATER_AREAS, type WaterArea } from "../water";
import { buildBoat, buildYacht, buildShip } from "./vesselModels";
// Type-only: erased at compile time, so marineRoutes → waterMask (value) is not a
// runtime import cycle even though marineRoutes calls generateFleet() at load.
import type { VesselSpec, Path } from "../marineRoutes";

const FLEET_SEED = 20260719; // fixed constant — import.meta.env is not available here
const M_PER_DEG_LAT = 111320; // metres per degree of latitude

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, deterministic PRNG. Returns uniform floats [0,1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Point-in-polygon geometry
// ---------------------------------------------------------------------------

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

function ringBBox(ring: [number, number][]): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

function inBBox(lng: number, lat: number, b: BBox): boolean {
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat;
}

// Cache each area's outer + hole bboxes (computed once, reused across the many
// generation queries — the biggest speedup on the thousand-point open-sea ring).
const bboxCache = new WeakMap<WaterArea, { outer: BBox; holes: BBox[] }>();
function areaBoxes(area: WaterArea): { outer: BBox; holes: BBox[] } {
  let boxes = bboxCache.get(area);
  if (!boxes) {
    boxes = {
      outer: ringBBox(area.polygon),
      holes: (area.holes ?? []).map(ringBBox),
    };
    bboxCache.set(area, boxes);
  }
  return boxes;
}

/**
 * Even-odd ray cast (horizontal ray toward +lng). x = ring[i][0] = lng,
 * y = ring[i][1] = lat. The strict `(yi > lat) !== (yj > lat)` on BOTH operands
 * is what prevents double-counting a vertex lying exactly on the ray; it also
 * guarantees `yj !== yi` so the division is safe. The `j = i++` wrap treats the
 * ring as closed without an explicit repeated final point.
 */
export function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside the area's outer ring AND not inside any of its holes. */
export function pointInArea(lng: number, lat: number, area: WaterArea): boolean {
  const boxes = areaBoxes(area);
  if (!inBBox(lng, lat, boxes.outer)) return false;
  if (!pointInRing(lng, lat, area.polygon)) return false;
  const holes = area.holes ?? [];
  for (let h = 0; h < holes.length; h++) {
    // Most holes are tiny islands — the bbox early-out skips nearly all ring casts.
    if (inBBox(lng, lat, boxes.holes[h]) && pointInRing(lng, lat, holes[h])) return false;
  }
  return true;
}

/** True if the point lies on any water basin. Exported for the DEV assertion. */
export function pointInWater(lng: number, lat: number): boolean {
  for (const area of WATER_AREAS) {
    if (pointInArea(lng, lat, area)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Lane generation
// ---------------------------------------------------------------------------

export type LaneOpts = {
  stepMeters: number; // march increment
  minLengthMeters: number; // reject a lane shorter than this
  targetLengthMeters: [number, number]; // random target drawn in this range
  headingJitterRad: number; // max per-step heading change (uniform ±)
  wallProbe: boolean; // try turning instead of terminating on a wall hit (narrow basins)
  checkMidpoint: boolean; // also test the step midpoint (thin-spit / frond guard)
  mirror: boolean; // append the reversed path → closed out-and-back loop
  maxStartAttempts?: number; // default 200
  maxLaneAttempts?: number; // default 40
};

// On a wall hit, try nudging the heading by these offsets (radians) before giving
// up — lets a lane follow a winding channel while every point stays in water.
const WALL_PROBES = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];
const STRAIGHT_PROBES = [0];

/**
 * Grow a single lane fully inside `area`. Rejection-samples an in-water start in
 * the area bbox, then marches forward, appending a point only while the next
 * step stays in water. Returns null if no lane ≥ minLengthMeters is found within
 * the retry budget (caller skips that spec).
 */
export function generateLaneInArea(
  area: WaterArea,
  rng: () => number,
  opts: LaneOpts,
): Path | null {
  const bbox = areaBoxes(area).outer;
  const maxStart = opts.maxStartAttempts ?? 200;
  const maxLane = opts.maxLaneAttempts ?? 40;
  const [targetMin, targetMax] = opts.targetLengthMeters;
  const probes = opts.wallProbe ? WALL_PROBES : STRAIGHT_PROBES;

  for (let laneAttempt = 0; laneAttempt < maxLane; laneAttempt++) {
    // Phase 1: rejection-sample an in-water start inside the bbox.
    let startLng = 0;
    let startLat = 0;
    let found = false;
    for (let a = 0; a < maxStart; a++) {
      const lng = bbox.minLng + rng() * (bbox.maxLng - bbox.minLng);
      const lat = bbox.minLat + rng() * (bbox.maxLat - bbox.minLat);
      if (pointInArea(lng, lat, area)) {
        startLng = lng;
        startLat = lat;
        found = true;
        break;
      }
    }
    if (!found) continue;

    // Phase 2: heading (0 = north, clockwise) + target length. Convert metres to
    // degrees once from the start latitude — negligible error over a few km.
    let heading = rng() * 2 * Math.PI;
    const target = targetMin + rng() * (targetMax - targetMin);
    const degPerMLat = 1 / M_PER_DEG_LAT;
    const degPerMLng = 1 / (M_PER_DEG_LAT * Math.cos((startLat * Math.PI) / 180));

    // Phase 3: march, appending points only while each step stays in water.
    const pts: [number, number][] = [[startLng, startLat]];
    let lng = startLng;
    let lat = startLat;
    let travelled = 0;
    while (travelled < target) {
      heading += (rng() * 2 - 1) * opts.headingJitterRad;
      let stepped = false;
      for (const dh of probes) {
        const h2 = heading + dh;
        const nLng = lng + Math.sin(h2) * opts.stepMeters * degPerMLng;
        const nLat = lat + Math.cos(h2) * opts.stepMeters * degPerMLat;
        let ok = pointInArea(nLng, nLat, area);
        if (ok && opts.checkMidpoint) {
          ok = pointInArea((lng + nLng) / 2, (lat + nLat) / 2, area);
        }
        if (ok) {
          heading = h2; // commit the turn
          lng = nLng;
          lat = nLat;
          pts.push([lng, lat]);
          travelled += opts.stepMeters;
          stepped = true;
          break;
        }
      }
      if (!stepped) break; // boxed in — lane ends here
    }

    // Phase 4: accept or retry with a fresh start.
    if (travelled >= opts.minLengthMeters && pts.length >= 2) {
      if (!opts.mirror) return pts;
      // Closed out-and-back so VesselLayer's modulo-1 progress never teleports.
      return pts.concat(pts.slice(0, -1).reverse());
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fleet plan
// ---------------------------------------------------------------------------

type LaneDef = {
  kind: string;
  build: () => import("three").Group;
  count: number;
  speedMps: number;
  sizeScale: number;
};

type FleetEntry = {
  // "open-sea" resolves to the largest open-sea lobe; others match by id.
  areaId: string;
  openSea?: boolean;
  opts: LaneOpts;
  lanes: LaneDef[];
};

// Per-basin lane options — tighter steps + wall-probing in the narrow basins,
// midpoint checks wherever holes (islands / palm fronds) could hide under a step.
const OPTS_OPEN_SEA: LaneOpts = {
  stepMeters: 80,
  targetLengthMeters: [3000, 6000],
  minLengthMeters: 1500,
  headingJitterRad: 0.08,
  wallProbe: false,
  checkMidpoint: true,
  mirror: true,
};
const OPTS_PALM: LaneOpts = {
  stepMeters: 40,
  targetLengthMeters: [1200, 2500],
  minLengthMeters: 600,
  headingJitterRad: 0.15,
  wallProbe: true,
  checkMidpoint: true,
  mirror: true,
};
const OPTS_MARINA: LaneOpts = {
  stepMeters: 30,
  targetLengthMeters: [800, 1600],
  minLengthMeters: 400,
  headingJitterRad: 0.2,
  wallProbe: true,
  checkMidpoint: false,
  mirror: true,
};
const OPTS_CREEK: LaneOpts = {
  stepMeters: 30,
  targetLengthMeters: [1000, 2500],
  minLengthMeters: 500,
  headingJitterRad: 0.2,
  wallProbe: true,
  checkMidpoint: true,
  mirror: true,
};
const OPTS_CANAL: LaneOpts = {
  stepMeters: 25,
  targetLengthMeters: [700, 1400],
  minLengthMeters: 350,
  headingJitterRad: 0.2,
  wallProbe: true,
  checkMidpoint: false,
  mirror: true,
};

// Fixed order + fixed contents → deterministic PRNG consumption. Totals 25 copies.
const FLEET_PLAN: FleetEntry[] = [
  {
    areaId: "open-sea",
    openSea: true,
    opts: OPTS_OPEN_SEA,
    lanes: [
      { kind: "ship-a", build: buildShip, count: 2, speedMps: 7, sizeScale: 4.5 },
      { kind: "ship-b", build: buildShip, count: 2, speedMps: 7, sizeScale: 4.5 },
      { kind: "boat-a", build: buildBoat, count: 2, speedMps: 8, sizeScale: 8.5 },
      { kind: "boat-b", build: buildBoat, count: 2, speedMps: 8, sizeScale: 8.5 },
    ],
  },
  {
    areaId: "palm-lagoon",
    opts: OPTS_PALM,
    lanes: [
      { kind: "yacht-a", build: buildYacht, count: 2, speedMps: 3.5, sizeScale: 5.5 },
      { kind: "yacht-b", build: buildYacht, count: 1, speedMps: 4, sizeScale: 5.5 },
      { kind: "boat", build: buildBoat, count: 2, speedMps: 6, sizeScale: 8.5 },
    ],
  },
  {
    areaId: "marina-channels",
    opts: OPTS_MARINA,
    lanes: [
      { kind: "yacht-a", build: buildYacht, count: 1, speedMps: 3, sizeScale: 5 },
      { kind: "yacht-b", build: buildYacht, count: 1, speedMps: 3, sizeScale: 5 },
      { kind: "boat", build: buildBoat, count: 2, speedMps: 5, sizeScale: 8.5 },
    ],
  },
  {
    areaId: "dubai-creek",
    opts: OPTS_CREEK,
    lanes: [
      { kind: "boat-a", build: buildBoat, count: 2, speedMps: 5, sizeScale: 9 },
      { kind: "boat-b", build: buildBoat, count: 2, speedMps: 5, sizeScale: 9 },
      { kind: "yacht", build: buildYacht, count: 1, speedMps: 3, sizeScale: 5 },
    ],
  },
  {
    areaId: "business-bay-canal",
    opts: OPTS_CANAL,
    lanes: [
      { kind: "boat", build: buildBoat, count: 2, speedMps: 5, sizeScale: 8.5 },
      { kind: "yacht", build: buildYacht, count: 1, speedMps: 3, sizeScale: 5 },
    ],
  },
];

/** Resolve the WaterArea an entry targets (largest lobe for open-sea). */
function resolveArea(entry: FleetEntry): WaterArea | null {
  if (entry.openSea) {
    const lobes = WATER_AREAS.filter((a) => a.openSea && a.renderSurface);
    if (lobes.length === 0) return null;
    let best = lobes[0];
    let bestArea = bboxAreaOf(best);
    for (let i = 1; i < lobes.length; i++) {
      const a = bboxAreaOf(lobes[i]);
      if (a > bestArea || (a === bestArea && lobes[i].id.localeCompare(best.id) < 0)) {
        best = lobes[i];
        bestArea = a;
      }
    }
    return best;
  }
  return WATER_AREAS.find((a) => a.id === entry.areaId && a.renderSurface) ?? null;
}

function bboxAreaOf(area: WaterArea): number {
  const b = areaBoxes(area).outer;
  return (b.maxLng - b.minLng) * (b.maxLat - b.minLat);
}

/** Build the whole fleet from the water polygons. Deterministic given the data. */
export function generateFleet(): VesselSpec[] {
  const rng = mulberry32(FLEET_SEED);
  const specs: VesselSpec[] = [];

  for (const entry of FLEET_PLAN) {
    const area = resolveArea(entry);
    if (!area) {
      console.warn(`[waterMask] water area not found: ${entry.areaId}`);
      continue;
    }
    const intensity = area.waveIntensity ?? 1;
    let laneIndex = 0;
    for (const lane of entry.lanes) {
      const route = generateLaneInArea(area, rng, entry.opts);
      if (!route) {
        console.warn(`[waterMask] no lane found for ${area.id}/${lane.kind}`);
        continue;
      }
      specs.push({
        name: `${area.id}-${lane.kind}-${laneIndex++}`,
        route,
        count: lane.count,
        speedMps: lane.speedMps,
        sizeScale: lane.sizeScale,
        intensity,
        build: lane.build,
      });
    }
  }
  return specs;
}
