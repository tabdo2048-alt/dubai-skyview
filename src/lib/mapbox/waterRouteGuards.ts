import { WATER_AREAS } from "@/lib/water";
import type { ModelConfig, ModelType } from "./modelTypes";

const WATERCRAFT_TYPES = new Set<ModelType>(["boat", "yacht", "ship", "abra"]);

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

export function isPointInDubaiWater(point: [number, number]) {
  return WATER_AREAS.some((area) => pointInRing(point, area.polygon));
}

export function routeStaysInDubaiWater(route: [number, number][], samplesPerSegment = 10) {
  if (route.length < 2) return false;

  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1];
    const [bx, by] = route[i];
    for (let step = 0; step <= samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const point: [number, number] = [ax + (bx - ax) * t, ay + (by - ay) * t];
      if (!isPointInDubaiWater(point)) return false;
    }
  }

  return true;
}

export function modelStaysInDubaiWater(config: ModelConfig) {
  if (!isWatercraft(config.type)) return true;
  if (config.route && config.route.length > 1) return routeStaysInDubaiWater(config.route);
  return isPointInDubaiWater([config.lng, config.lat]);
}
