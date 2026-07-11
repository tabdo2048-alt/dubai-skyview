// Route safety for the animated 3D vessels.
//
// The rule is simple and strict: a vessel may only ever occupy DEEP OPEN GULF
// water. We validate against navigationWater.ts (the open-sea polygon + hard
// land masks), NOT the visual coastal WATER_AREAS. Every vessel is assigned a
// pre-verified offshore lane; anything that cannot be validated is skipped
// rather than rendered onto land.

import {
  LAND_EXCLUSION_POLYGONS,
  NAVIGATION_WATER_POLYGONS,
  type NavigationPolygon,
} from "@/lib/navigationWater";
import { isPointInAnyBasinNavigationWater } from "@/lib/navigationBasins";
import { orderedMarineRouteCandidates, type MarineRouteCategory } from "@/lib/marineRoutes";
import { WATERCRAFT_DISPLAY_LENGTH_METERS, type ModelConfig, type ModelType } from "./modelTypes";

const BOAT_ROUTE_DEBUG = false;
const WATERCRAFT_TYPES = new Set<ModelType>(["boat", "yacht", "ship", "abra"]);
const METERS_PER_LATITUDE_DEGREE = 111_320;
export const ROUTE_SAMPLE_STEP_METERS = 10;
const loggedRoutes = new Set<string>();

export type InvalidRouteSample = {
  point: [number, number];
  segmentIndex: number;
  reason:
    "outside-navigation-water" | "outside-basin-water" | "inside-land-mask" | "shore-clearance";
  clearanceMeters: number;
  nearestLandMeters: number;
};

// Base clearance from any land boundary; the vessel's own half-length is added
// on top in getVesselSafetyClearance().
const BASE_SAFETY_CLEARANCE_METERS: Partial<Record<ModelType, number>> = {
  ship: 110,
  yacht: 55,
  boat: 30,
  abra: 20,
};

console.log("[BoatRoute] navigation polygons loaded", NAVIGATION_WATER_POLYGONS.length);
console.log("[BoatRoute] land masks loaded", LAND_EXCLUSION_POLYGONS.length);

export function isWatercraft(type: ModelType) {
  return WATERCRAFT_TYPES.has(type);
}

function logRouteOnce(message: string, id: string) {
  const key = `${message}:${id}`;
  if (loggedRoutes.has(key)) return;
  loggedRoutes.add(key);
  console.log(message, id);
}

// --- Geometry helpers -------------------------------------------------------
function pointInRing(point: [number, number], ring: [number, number][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceMeters(a: [number, number], b: [number, number]) {
  const meanLatitude = ((a[1] + b[1]) * Math.PI) / 360;
  const dx = (a[0] - b[0]) * METERS_PER_LATITUDE_DEGREE * Math.cos(meanLatitude);
  const dy = (a[1] - b[1]) * METERS_PER_LATITUDE_DEGREE;
  return Math.hypot(dx, dy);
}

function distanceToSegmentMeters(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const meanLatitude = ((point[1] + start[1] + end[1]) * Math.PI) / 540;
  const lngScale = METERS_PER_LATITUDE_DEGREE * Math.cos(meanLatitude);
  const px = (point[0] - start[0]) * lngScale;
  const py = (point[1] - start[1]) * METERS_PER_LATITUDE_DEGREE;
  const ex = (end[0] - start[0]) * lngScale;
  const ey = (end[1] - start[1]) * METERS_PER_LATITUDE_DEGREE;
  const lengthSquared = ex * ex + ey * ey;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - ex * t, py - ey * t);
}

function distanceToRingMeters(point: [number, number], ring: [number, number][]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < ring.length; i++) {
    nearest = Math.min(nearest, distanceToSegmentMeters(point, ring[i - 1], ring[i]));
  }
  return nearest;
}

function isPointInAnyPolygon(point: [number, number], polygons: NavigationPolygon[]) {
  return polygons.some((area) => pointInRing(point, area.polygon));
}

function distanceToNearestPolygonBoundaryMeters(
  point: [number, number],
  polygons: NavigationPolygon[],
) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    nearest = Math.min(nearest, distanceToRingMeters(point, polygon.polygon));
  }
  return nearest;
}

// --- Land / water tests -----------------------------------------------------
export function isPointInsideAnyLandMask(point: [number, number]) {
  return isPointInAnyPolygon(point, LAND_EXCLUSION_POLYGONS);
}

export function distanceToLandBoundaryMeters(point: [number, number]) {
  return distanceToNearestPolygonBoundaryMeters(point, LAND_EXCLUSION_POLYGONS);
}

// Validation context: open-sea routes are checked against the deep-Gulf mask +
// coarse land boxes; basin routes are checked against the basin corridors, which
// are already clipped to the real basin water polygon (and its holes). The two
// never mix — the coarse mainland box would wrongly reject in-basin points, and
// the offshore mask does not cover the sheltered basins.
export type RouteContext = "open-sea" | "basin";

export function routeContextForCategory(category: MarineRouteCategory): RouteContext {
  return category === "basin" ? "basin" : "open-sea";
}

function invalidSampleForPoint(
  point: [number, number],
  segmentIndex: number,
  clearanceMeters: number,
  context: RouteContext = "open-sea",
): InvalidRouteSample | undefined {
  if (context === "basin") {
    // A basin corridor already guarantees water + island-hole exclusion, so the
    // only failure mode is drifting out of the corridor / basin water.
    if (!isPointInAnyBasinNavigationWater(point)) {
      return {
        point,
        segmentIndex,
        reason: "outside-basin-water",
        clearanceMeters,
        nearestLandMeters: 0,
      };
    }
    return undefined;
  }

  const nearestLandMeters = distanceToLandBoundaryMeters(point);
  if (!isPointInAnyPolygon(point, NAVIGATION_WATER_POLYGONS)) {
    return {
      point,
      segmentIndex,
      reason: "outside-navigation-water",
      clearanceMeters,
      nearestLandMeters,
    };
  }
  if (isPointInsideAnyLandMask(point)) {
    return {
      point,
      segmentIndex,
      reason: "inside-land-mask",
      clearanceMeters,
      nearestLandMeters,
    };
  }
  if (nearestLandMeters < clearanceMeters) {
    return {
      point,
      segmentIndex,
      reason: "shore-clearance",
      clearanceMeters,
      nearestLandMeters,
    };
  }
  return undefined;
}

// Safe only if: inside a navigation-water polygon, outside every land mask, AND
// at least `clearanceMeters` from any land boundary.
export function isPointInSafeNavigationWater(point: [number, number], clearanceMeters = 0) {
  if (!isPointInAnyPolygon(point, NAVIGATION_WATER_POLYGONS)) return false;
  if (isPointInsideAnyLandMask(point)) return false;
  if (distanceToLandBoundaryMeters(point) < clearanceMeters) return false;
  return true;
}

// Runtime per-frame safety net used by Model3DLayer. A point is safe if it is
// valid open-sea navigation water OR valid basin navigation water. Basin vessels
// ride corridors clipped to real basin water, so they satisfy the basin branch
// even though the coarse offshore mask would reject them.
export function isPointInAnySafeWater(
  point: [number, number],
  clearanceMeters = 0,
  context: RouteContext = "open-sea",
) {
  if (context === "basin") return isPointInAnyBasinNavigationWater(point);
  return isPointInSafeNavigationWater(point, clearanceMeters);
}

export function isPointInDubaiWater(point: [number, number]) {
  return isPointInAnyPolygon(point, NAVIGATION_WATER_POLYGONS);
}

// Clearance a vessel keeps from land: a per-type baseline plus half its own
// display length, so a big ship stays farther out than a small abra.
export function getVesselSafetyClearance(
  config: Pick<ModelConfig, "type" | "displayLengthMeters">,
) {
  const displayLength =
    config.displayLengthMeters ?? WATERCRAFT_DISPLAY_LENGTH_METERS[config.type] ?? 50;
  return (BASE_SAFETY_CLEARANCE_METERS[config.type] ?? 25) + displayLength / 2;
}

// Enterprise acceptance requires at least one safety check every 10 m.
function getSegmentSampleCount(start: [number, number], end: [number, number]) {
  const lengthMeters = distanceMeters(start, end);
  return Math.max(16, Math.ceil(lengthMeters / ROUTE_SAMPLE_STEP_METERS));
}

export function routeStaysInDubaiWater(
  route: [number, number][],
  clearanceMeters = 0,
  context: RouteContext = "open-sea",
) {
  if (route.length < 2) return false;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];
    const samples = getSegmentSampleCount(start, end);
    for (let step = 0; step <= samples; step++) {
      const t = step / samples;
      const point: [number, number] = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ];
      const invalid = invalidSampleForPoint(point, i - 1, clearanceMeters, context);
      if (invalid) {
        if (BOAT_ROUTE_DEBUG) console.warn("[BoatRoute] rejected sample", invalid);
        return false;
      }
    }
  }

  return true;
}

export function collectInvalidRouteSamples(
  route: [number, number][] | undefined,
  clearanceMeters = 0,
  context: RouteContext = "open-sea",
) {
  const invalidSamples: InvalidRouteSample[] = [];
  if (!route || route.length < 2) return invalidSamples;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];
    const samples = getSegmentSampleCount(start, end);
    for (let step = 0; step <= samples; step++) {
      const t = step / samples;
      const point: [number, number] = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ];
      const invalid = invalidSampleForPoint(point, i - 1, clearanceMeters, context);
      if (invalid) invalidSamples.push(invalid);
    }
  }

  return invalidSamples;
}

export function modelStaysInDubaiWater(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  return Boolean(waterRouteForDisplay(config));
}

function routeFitsVessel(config: ModelConfig, category: MarineRouteCategory) {
  if (config.type === "ship") return category === "open-sea";
  return true;
}

// Every vessel sails a verified named route. Open-sea routes are checked against
// the Gulf navigation mask and land buffers; basin routes are checked against
// their corridor clipped to visual water polygons.
export function waterRouteForDisplay(config: ModelConfig): [number, number][] | undefined {
  if (!isWatercraft(config.type)) return config.route;

  const clearance = getVesselSafetyClearance(config);
  const candidates = orderedMarineRouteCandidates(config.id, config.routeId);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!routeFitsVessel(config, candidate.category)) continue;
    const context = routeContextForCategory(candidate.category);
    // Basin corridors already carry their own clearance, so no extra land
    // clearance is imposed there (the coarse land boxes don't apply in-basin).
    const clearanceForContext = context === "basin" ? 0 : clearance;
    if (routeStaysInDubaiWater(candidate.points, clearanceForContext, context)) {
      logRouteOnce(
        i === 0 ? "[BoatRoute] safe route accepted" : "[BoatRoute] fallback route used",
        `${config.id}:${candidate.id}`,
      );
      return candidate.points;
    }
  }

  logRouteOnce("[BoatRoute] vessel skipped: no safe route", config.id);
  return undefined;
}

export function modelHasWaterRoute(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  return Boolean(waterRouteForDisplay(config));
}
