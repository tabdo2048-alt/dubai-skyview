import {
  LAND_EXCLUSION_POLYGONS,
  NAVIGATION_WATER_POLYGONS,
  type NavigationPolygon,
} from "@/lib/navigationWater";
import { WATERCRAFT_DISPLAY_LENGTH_METERS, type ModelConfig, type ModelType } from "./modelTypes";

const BOAT_ROUTE_DEBUG = false;
const WATERCRAFT_TYPES = new Set<ModelType>(["boat", "yacht", "ship", "abra"]);
const METERS_PER_LATITUDE_DEGREE = 111_320;
const ROUTE_SAMPLE_STEP_METERS = 25;
const loggedRoutes = new Set<string>();

const BASE_SAFETY_CLEARANCE_METERS: Partial<Record<ModelType, number>> = {
  ship: 110,
  yacht: 55,
  boat: 30,
  abra: 20,
};

const SAFE_OFFSHORE_SHIP_ROUTES: [number, number][][] = [
  [
    [55.055, 25.118],
    [55.065, 25.148],
    [55.095, 25.17],
    [55.13, 25.177],
    [55.155, 25.162],
    [55.125, 25.152],
    [55.088, 25.142],
    [55.055, 25.118],
  ],
  [
    [55.06, 25.09],
    [55.055, 25.125],
    [55.08, 25.155],
    [55.11, 25.166],
    [55.095, 25.14],
    [55.072, 25.116],
    [55.06, 25.09],
  ],
  [
    [55.07, 25.158],
    [55.105, 25.174],
    [55.145, 25.172],
    [55.17, 25.152],
    [55.145, 25.157],
    [55.105, 25.158],
    [55.07, 25.158],
  ],
];

const SAFE_PALM_YACHT_ROUTES: [number, number][][] = [
  [
    [55.075, 25.103],
    [55.078, 25.13],
    [55.095, 25.154],
    [55.122, 25.164],
    [55.145, 25.158],
    [55.13, 25.146],
    [55.1, 25.14],
    [55.083, 25.12],
    [55.075, 25.103],
  ],
  [
    [55.087, 25.091],
    [55.079, 25.115],
    [55.09, 25.144],
    [55.112, 25.158],
    [55.137, 25.158],
    [55.158, 25.144],
    [55.143, 25.14],
    [55.11, 25.13],
    [55.087, 25.091],
  ],
  [
    [55.106, 25.149],
    [55.126, 25.162],
    [55.151, 25.154],
    [55.167, 25.136],
    [55.153, 25.129],
    [55.127, 25.14],
    [55.106, 25.149],
  ],
];

const SAFE_MARINA_BOAT_ROUTES: [number, number][][] = [
  [
    [55.118, 25.078],
    [55.128, 25.095],
    [55.145, 25.098],
    [55.154, 25.087],
    [55.146, 25.075],
    [55.131, 25.074],
    [55.118, 25.078],
  ],
  [
    [55.121, 25.086],
    [55.132, 25.101],
    [55.151, 25.097],
    [55.156, 25.083],
    [55.143, 25.072],
    [55.127, 25.073],
    [55.121, 25.086],
  ],
];

const SAFE_CREEK_ABRA_ROUTES: [number, number][][] = [
  [
    [55.301, 25.262],
    [55.309, 25.249],
    [55.318, 25.237],
    [55.327, 25.226],
    [55.334, 25.217],
  ],
  [
    [55.334, 25.218],
    [55.326, 25.229],
    [55.317, 25.24],
    [55.308, 25.252],
    [55.301, 25.262],
  ],
];

const SAFE_BUSINESS_BAY_ROUTES: [number, number][][] = [
  [
    [55.2675, 25.187],
    [55.2665, 25.18],
    [55.2675, 25.173],
    [55.2715, 25.1665],
  ],
  [
    [55.2715, 25.1665],
    [55.269, 25.174],
    [55.2675, 25.182],
    [55.268, 25.188],
  ],
];

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

export function isPointInsideAnyLandMask(point: [number, number]) {
  return isPointInAnyPolygon(point, LAND_EXCLUSION_POLYGONS);
}

export function distanceToLandBoundaryMeters(point: [number, number]) {
  return distanceToNearestPolygonBoundaryMeters(point, LAND_EXCLUSION_POLYGONS);
}

export function isPointInSafeNavigationWater(point: [number, number], clearanceMeters = 0) {
  if (!isPointInAnyPolygon(point, NAVIGATION_WATER_POLYGONS)) return false;
  if (isPointInsideAnyLandMask(point)) return false;
  if (distanceToLandBoundaryMeters(point) < clearanceMeters) return false;
  return true;
}

export function isPointInDubaiWater(point: [number, number]) {
  return isPointInAnyPolygon(point, NAVIGATION_WATER_POLYGONS);
}

export function getVesselSafetyClearance(
  config: Pick<ModelConfig, "type" | "displayLengthMeters">,
) {
  const displayLength =
    config.displayLengthMeters ?? WATERCRAFT_DISPLAY_LENGTH_METERS[config.type] ?? 50;
  return (BASE_SAFETY_CLEARANCE_METERS[config.type] ?? 25) + displayLength / 2;
}

export function routeStaysInDubaiWater(route: [number, number][], clearanceMeters = 0) {
  if (route.length < 2) return false;

  for (let i = 1; i < route.length; i++) {
    const start = route[i - 1];
    const end = route[i];
    const segmentLength = distanceMeters(start, end);
    const samples = Math.max(1, Math.ceil(segmentLength / ROUTE_SAMPLE_STEP_METERS));
    for (let step = 0; step <= samples; step++) {
      const t = step / samples;
      const point: [number, number] = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ];
      if (!isPointInSafeNavigationWater(point, clearanceMeters)) {
        if (BOAT_ROUTE_DEBUG) console.warn("[BoatRoute] rejected sample", point, clearanceMeters);
        return false;
      }
    }
  }

  return true;
}

function routeIndexForId(id: string, routeCount: number) {
  return [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % routeCount;
}

function safeFallbackGroupsFor(config: ModelConfig): [number, number][][] {
  const id = config.id.toLowerCase();
  if (config.type === "ship") return SAFE_OFFSHORE_SHIP_ROUTES;
  if (id.includes("creek") || config.type === "abra") return SAFE_CREEK_ABRA_ROUTES;
  if (id.includes("business")) return SAFE_BUSINESS_BAY_ROUTES;
  if (id.includes("marina")) return SAFE_MARINA_BOAT_ROUTES;
  if (id.includes("palm") || id.includes("gulf") || id.includes("harbour") || id.includes("jbr")) {
    return SAFE_PALM_YACHT_ROUTES;
  }
  return SAFE_MARINA_BOAT_ROUTES;
}

function selectSafeFallbackRoute(config: ModelConfig, clearanceMeters: number) {
  const routes = safeFallbackGroupsFor(config);
  const firstIndex = routeIndexForId(config.id, routes.length);

  for (let offset = 0; offset < routes.length; offset++) {
    const route = routes[(firstIndex + offset) % routes.length];
    if (routeStaysInDubaiWater(route, clearanceMeters)) return route;
  }

  return undefined;
}

export function modelStaysInDubaiWater(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  const clearance = getVesselSafetyClearance(config);
  if (config.route && config.route.length > 1)
    return routeStaysInDubaiWater(config.route, clearance);
  return isPointInSafeNavigationWater([config.lng, config.lat], clearance);
}

export function waterRouteForDisplay(config: ModelConfig): [number, number][] | undefined {
  if (!isWatercraft(config.type)) return config.route;
  if (!config.route || config.route.length < 2) return config.route;

  const clearance = getVesselSafetyClearance(config);
  if (routeStaysInDubaiWater(config.route, clearance)) {
    logRouteOnce("[BoatRoute] safe route accepted", config.id);
    return config.route;
  }

  const fallbackRoute = selectSafeFallbackRoute(config, clearance);
  if (fallbackRoute) {
    logRouteOnce("[BoatRoute] fallback route used", config.id);
    return fallbackRoute;
  }

  logRouteOnce("[BoatRoute] vessel skipped: no safe route", config.id);
  return undefined;
}

export function modelHasWaterRoute(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  if (config.route && config.route.length > 1) return Boolean(waterRouteForDisplay(config));
  return isPointInSafeNavigationWater([config.lng, config.lat], getVesselSafetyClearance(config));
}
