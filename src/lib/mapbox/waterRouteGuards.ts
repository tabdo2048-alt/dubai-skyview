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
import { orderedMarineRouteCandidates } from "@/lib/marineRoutes";
import { WATERCRAFT_DISPLAY_LENGTH_METERS, type ModelConfig, type ModelType } from "./modelTypes";

const BOAT_ROUTE_DEBUG = false;
const WATERCRAFT_TYPES = new Set<ModelType>(["boat", "yacht", "ship", "abra"]);
const METERS_PER_LATITUDE_DEGREE = 111_320;
const ROUTE_SAMPLE_STEP_METERS = 25;
const loggedRoutes = new Set<string>();

export type InvalidRouteSample = {
  point: [number, number];
  segmentIndex: number;
  reason: "outside-navigation-water" | "inside-land-mask" | "shore-clearance";
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

function invalidSampleForPoint(
  point: [number, number],
  segmentIndex: number,
  clearanceMeters: number,
): InvalidRouteSample | undefined {
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

// Roughly one safety check every 25 m so long segments are never under-sampled.
function getSegmentSampleCount(start: [number, number], end: [number, number]) {
  const lengthMeters = distanceMeters(start, end);
  return Math.max(16, Math.ceil(lengthMeters / ROUTE_SAMPLE_STEP_METERS));
}

export function routeStaysInDubaiWater(route: [number, number][], clearanceMeters = 0) {
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
      const invalid = invalidSampleForPoint(point, i - 1, clearanceMeters);
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
      const invalid = invalidSampleForPoint(point, i - 1, clearanceMeters);
      if (invalid) invalidSamples.push(invalid);
    }
  }

  return invalidSamples;
}

export function modelStaysInDubaiWater(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  const route = waterRouteForDisplay(config);
  return (
    Boolean(route) &&
    routeStaysInDubaiWater(route as [number, number][], getVesselSafetyClearance(config))
  );
}

// Every vessel sails a verified open-sea lane. The lane derived from its id is
// tried first; if it somehow fails its clearance, the next lanes are tried; if
// none pass, the vessel is skipped rather than rendered onto land.
export function waterRouteForDisplay(config: ModelConfig): [number, number][] | undefined {
  if (!isWatercraft(config.type)) return config.route;

  const clearance = getVesselSafetyClearance(config);
  const candidates = orderedMarineRouteCandidates(config.id, config.routeId);
  for (let i = 0; i < candidates.length; i++) {
    if (routeStaysInDubaiWater(candidates[i].points, clearance)) {
      logRouteOnce(
        i === 0 ? "[BoatRoute] safe route accepted" : "[BoatRoute] fallback route used",
        `${config.id}:${candidates[i].id}`,
      );
      return candidates[i].points;
    }
  }

  logRouteOnce("[BoatRoute] vessel skipped: no safe route", config.id);
  return undefined;
}

export function modelHasWaterRoute(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  return Boolean(waterRouteForDisplay(config));
}
