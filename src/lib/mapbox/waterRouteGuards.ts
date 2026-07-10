import { WATER_AREAS } from "@/lib/water";
import type { ModelConfig, ModelType } from "./modelTypes";

const WATERCRAFT_TYPES = new Set<ModelType>(["boat", "yacht", "ship", "abra"]);
const METERS_PER_LATITUDE_DEGREE = 111_320;
const PALM_LAND_CENTER: [number, number] = [55.138, 25.118];
const PALM_LAND_RADIUS_METERS = 1_450;
const SHORE_CLEARANCE_METERS: Partial<Record<ModelType, number>> = {
  ship: 260,
  yacht: 110,
  boat: 85,
  abra: 45,
};

// Cargo and cruise ships use short offshore loops. Keeping these lanes west of
// JBR and Palm prevents the broad Palm water mask from accepting paths that cut
// across the island or the Dubai shoreline.
const OFFSHORE_SHIP_ROUTES: [number, number][][] = [
  [
    [55.073, 25.075],
    [55.066, 25.088],
    [55.064, 25.104],
    [55.071, 25.115],
    [55.077, 25.099],
    [55.08, 25.084],
    [55.073, 25.075],
  ],
  [
    [55.066, 25.118],
    [55.065, 25.132],
    [55.072, 25.146],
    [55.086, 25.157],
    [55.091, 25.145],
    [55.08, 25.134],
    [55.066, 25.118],
  ],
  [
    [55.095, 25.158],
    [55.111, 25.166],
    [55.13, 25.17],
    [55.148, 25.165],
    [55.135, 25.158],
    [55.116, 25.155],
    [55.095, 25.158],
  ],
];

const PALM_OFFSHORE_ROUTES: [number, number][][] = [
  [
    [55.083, 25.108],
    [55.078, 25.12],
    [55.079, 25.134],
    [55.087, 25.144],
    [55.094, 25.135],
    [55.09, 25.12],
    [55.083, 25.108],
  ],
  [
    [55.098, 25.158],
    [55.112, 25.165],
    [55.128, 25.168],
    [55.142, 25.164],
    [55.13, 25.157],
    [55.112, 25.154],
    [55.098, 25.158],
  ],
  [
    [55.082, 25.145],
    [55.093, 25.157],
    [55.108, 25.163],
    [55.116, 25.155],
    [55.104, 25.148],
    [55.091, 25.14],
    [55.082, 25.145],
  ],
];

export function isWatercraft(type: ModelType) {
  return WATERCRAFT_TYPES.has(type);
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

function isInsidePalmLandBuffer(point: [number, number], clearanceMeters: number) {
  return distanceMeters(point, PALM_LAND_CENTER) < PALM_LAND_RADIUS_METERS + clearanceMeters;
}

export function isPointInDubaiWater(point: [number, number]) {
  return WATER_AREAS.some((area) => pointInRing(point, area.polygon));
}

function isPointInSafeDubaiWater(point: [number, number], clearanceMeters: number) {
  if (isInsidePalmLandBuffer(point, clearanceMeters)) return false;
  return WATER_AREAS.some(
    (area) =>
      pointInRing(point, area.polygon) &&
      distanceToRingMeters(point, area.polygon) >= clearanceMeters,
  );
}

export function routeStaysInDubaiWater(
  route: [number, number][],
  samplesPerSegment = 16,
  clearanceMeters = 0,
) {
  if (route.length < 2) return false;

  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1];
    const [bx, by] = route[i];
    for (let step = 0; step <= samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const point: [number, number] = [ax + (bx - ax) * t, ay + (by - ay) * t];
      if (!isPointInSafeDubaiWater(point, clearanceMeters)) return false;
    }
  }

  return true;
}

function offshoreShipRoute(id: string) {
  const routeIndex = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return OFFSHORE_SHIP_ROUTES[routeIndex % OFFSHORE_SHIP_ROUTES.length];
}

function palmOffshoreRoute(id: string) {
  const routeIndex = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return PALM_OFFSHORE_ROUTES[routeIndex % PALM_OFFSHORE_ROUTES.length];
}

export function modelStaysInDubaiWater(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  if (config.route && config.route.length > 1) return routeStaysInDubaiWater(config.route);
  return isPointInDubaiWater([config.lng, config.lat]);
}

export function compactWaterRoute(route: [number, number][], factor = 0.58): [number, number][] {
  if (route.length < 2) return route;
  const center = route.reduce(
    (acc, point) => {
      acc[0] += point[0];
      acc[1] += point[1];
      return acc;
    },
    [0, 0] as [number, number],
  );
  center[0] /= route.length;
  center[1] /= route.length;

  return route.map(([lng, lat]) => [
    center[0] + (lng - center[0]) * factor,
    center[1] + (lat - center[1]) * factor,
  ]);
}

export function waterRouteForDisplay(config: ModelConfig): [number, number][] | undefined {
  if (!isWatercraft(config.type) || !config.route || config.route.length < 2) return config.route;

  if (config.type === "ship") return offshoreShipRoute(config.id);

  const clearance = SHORE_CLEARANCE_METERS[config.type] ?? 80;

  const compacted = compactWaterRoute(config.route);
  if (routeStaysInDubaiWater(compacted, 16, clearance)) return compacted;
  if (routeStaysInDubaiWater(config.route, 16, clearance)) return config.route;
  if (config.id.includes("palm")) return palmOffshoreRoute(config.id);
  return undefined;
}

export function modelHasWaterRoute(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  if (config.route && config.route.length > 1) return Boolean(waterRouteForDisplay(config));
  return isPointInSafeDubaiWater(
    [config.lng, config.lat],
    SHORE_CLEARANCE_METERS[config.type] ?? 80,
  );
}
