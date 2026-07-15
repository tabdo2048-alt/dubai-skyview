import { MODEL_REGISTRY } from "../src/lib/mapbox/modelRegistry";
import { getMarineRoute } from "../src/lib/marineRoutes";

type Pt = [number, number];

function dist(a: Pt, b: Pt) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// Linear interpolation over route points by fraction — sufficient for a
// spawn-point distribution check (doesn't need exact arc-length precision).
function pointAtFraction(points: Pt[], t: number): Pt {
  if (points.length < 2) return points[0] ?? [0, 0];
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(idx));
  const localT = idx - i;
  const [ax, ay] = points[i];
  const [bx, by] = points[i + 1];
  return [ax + (bx - ax) * localT, ay + (by - ay) * localT];
}

const LANDMARKS: { name: string; center: Pt; radiusDeg: number }[] = [
  { name: "Palm Jumeirah", center: [55.138, 25.115], radiusDeg: 0.0225 },
  { name: "Dubai Marina", center: [55.138, 25.078], radiusDeg: 0.0225 },
  { name: "JBR", center: [55.128, 25.08], radiusDeg: 0.0225 },
  { name: "Business Bay", center: [55.26, 25.185], radiusDeg: 0.0225 },
  { name: "Dubai Creek", center: [55.32, 25.235], radiusDeg: 0.0225 },
];

const counts: Record<string, number> = Object.fromEntries(LANDMARKS.map((l) => [l.name, 0]));
counts["north open sea (unlabeled)"] = 0;

let watercraftTotal = 0;
for (const config of MODEL_REGISTRY) {
  if (!["ship", "yacht", "boat", "abra"].includes(config.type)) continue;
  watercraftTotal++;
  const route = getMarineRoute(config.routeId);
  const spawn: Pt = route
    ? pointAtFraction(route.points, config.startProgress ?? 0)
    : [config.lng, config.lat];

  const nearby = LANDMARKS.find((l) => dist(spawn, l.center) <= l.radiusDeg);
  if (nearby) counts[nearby.name]++;
  else counts["north open sea (unlabeled)"]++;
}

console.log(JSON.stringify({ watercraftTotal, counts }, null, 2));
