import { MARINE_ROUTES, getMarineRoute } from "../src/lib/marineRoutes";
import { MODEL_REGISTRY } from "../src/lib/mapbox/modelRegistry";
import {
  getVesselSafetyClearance,
  isWatercraft,
  routeContextForCategory,
  routeStaysInDubaiWater,
  ROUTE_SAMPLE_STEP_METERS,
} from "../src/lib/mapbox/waterRouteGuards";
import { WATERCRAFT_DISPLAY_LENGTH_METERS } from "../src/lib/mapbox/modelTypes";

const failures: string[] = [];

function distanceMeters(a: [number, number], b: [number, number]) {
  const latitude = ((a[1] + b[1]) * Math.PI) / 360;
  const latitudeMeters = 111_320;
  return Math.hypot(
    (a[0] - b[0]) * latitudeMeters * Math.cos(latitude),
    (a[1] - b[1]) * latitudeMeters,
  );
}

function routeLengthMeters(points: [number, number][]) {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return total;
}

const routeCounts = Object.fromEntries(
  ["horizontal", "diagonal", "connector", "loop", "basin"].map((layout) => [
    layout,
    MARINE_ROUTES.filter((route) => route.layout === layout).length,
  ]),
);

if (routeCounts.horizontal < 10 || routeCounts.horizontal > 12) {
  failures.push(`horizontal route count is ${routeCounts.horizontal}`);
}
if (routeCounts.diagonal < 5 || routeCounts.diagonal > 8) {
  failures.push(`diagonal route count is ${routeCounts.diagonal}`);
}
if (routeCounts.connector < 4 || routeCounts.connector > 6) {
  failures.push(`connector route count is ${routeCounts.connector}`);
}

for (const route of MARINE_ROUTES) {
  const context = routeContextForCategory(route.category);
  if (!routeStaysInDubaiWater(route.points, 0, context)) {
    failures.push(`route outside ${context} navigation water: ${route.id}`);
  }
}

const vessels = MODEL_REGISTRY.filter((config) => isWatercraft(config.type));
const fleetCounts = Object.fromEntries(
  ["ship", "yacht", "boat", "abra"].map((type) => [
    type,
    vessels.filter((config) => config.type === type).length,
  ]),
);
const fleetRanges: Record<string, [number, number]> = {
  ship: [12, 16],
  yacht: [35, 50],
  boat: [45, 65],
  abra: [15, 20],
};

for (const [type, [minimum, maximum]] of Object.entries(fleetRanges)) {
  const count = fleetCounts[type];
  if (count < minimum || count > maximum) failures.push(`${type} count is ${count}`);
}

const vesselsByRoute = new Map<string, typeof vessels>();
for (const vessel of vessels) {
  const route = getMarineRoute(vessel.routeId);
  if (!route) {
    failures.push(`missing route for ${vessel.id}`);
    continue;
  }
  const context = routeContextForCategory(route.category);
  const clearance = context === "basin" ? 0 : getVesselSafetyClearance(vessel);
  if (!routeStaysInDubaiWater(route.points, clearance, context)) {
    failures.push(`unsafe assigned route ${route.id} for ${vessel.id}`);
  }
  const group = vesselsByRoute.get(route.id) ?? [];
  group.push(vessel);
  vesselsByRoute.set(route.id, group);
}

for (const [routeId, routeVessels] of vesselsByRoute) {
  const route = getMarineRoute(routeId);
  if (!route || routeVessels.length < 2) continue;
  const length = routeLengthMeters(route.points);
  const sorted = [...routeVessels].sort((a, b) => (a.startProgress ?? 0) - (b.startProgress ?? 0));
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const gapMeters = ((current.startProgress ?? 0) - (previous.startProgress ?? 0)) * length;
    const requiredGap =
      ((previous.displayLengthMeters ?? WATERCRAFT_DISPLAY_LENGTH_METERS[previous.type] ?? 50) +
        (current.displayLengthMeters ?? WATERCRAFT_DISPLAY_LENGTH_METERS[current.type] ?? 50)) /
        2 +
      20;
    if (gapMeters < requiredGap) {
      failures.push(
        `initial overlap risk on ${routeId}: ${previous.id}/${current.id} (${gapMeters.toFixed(0)}m)`,
      );
    }
  }
}

console.log(
  JSON.stringify(
    {
      sampleStepMeters: ROUTE_SAMPLE_STEP_METERS,
      routes: { total: MARINE_ROUTES.length, ...routeCounts },
      fleet: fleetCounts,
      validatedVessels: vessels.length,
      failures,
    },
    null,
    2,
  ),
);

if (ROUTE_SAMPLE_STEP_METERS !== 10) failures.push("route sample step is not 10m");
if (failures.length > 0)
  throw new Error(`Marine validation failed with ${failures.length} issue(s)`);
