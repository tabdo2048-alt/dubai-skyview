import {
  OPEN_SEA_CONNECTOR_LANES,
  OPEN_SEA_DIAGONAL_LANES,
  OPEN_SEA_HORIZONTAL_LANES,
  OPEN_SEA_YACHT_LOOPS,
} from "./navigationWater";
import { BASIN_CORRIDORS, type BasinId } from "./navigationBasins";
import type { ModelType } from "./mapbox/modelTypes";
import { WATER_AREAS } from "./water";

type BasinRouteId =
  | "marina-inner-channel"
  | "marina-entrance-lane"
  | "palm-outer-clockwise"
  | "palm-inner-lagoon"
  | "creek-northbound-lane"
  | "creek-southbound-lane"
  | "business-bay-canal"
  | "jbr-offshore-lane";

export type MarineRouteId =
  | `gulf-horizontal-${number}`
  | `gulf-diagonal-${number}`
  | `gulf-connector-${number}`
  | `gulf-yacht-loop-${number}`
  | BasinRouteId;

export type MarineRouteCategory = "open-sea" | "yacht-loop" | "connector" | "basin";
export type MarineRouteLayout = "horizontal" | "diagonal" | "connector" | "loop" | "basin";

export type MarineRoute = {
  id: MarineRouteId;
  name: string;
  points: [number, number][];
  category: MarineRouteCategory;
  layout: MarineRouteLayout;
  /** For `basin` routes: which basin corridor the route is validated against. */
  basinId?: BasinId;
};

const BASIN_ROUTE_IDS: BasinRouteId[] = [
  "marina-inner-channel",
  "marina-entrance-lane",
  "palm-outer-clockwise",
  "palm-inner-lagoon",
  "creek-northbound-lane",
  "creek-southbound-lane",
  "business-bay-canal",
  "jbr-offshore-lane",
];

const BASIN_ROUTE_NAMES: Record<BasinRouteId, string> = {
  "marina-inner-channel": "Dubai Marina Inner Channel",
  "marina-entrance-lane": "Dubai Marina Entrance Lane",
  "palm-outer-clockwise": "Palm Jumeirah Outer Crescent (Clockwise)",
  "palm-inner-lagoon": "Palm Jumeirah Inner Lagoon",
  "creek-northbound-lane": "Dubai Creek Northbound Lane",
  "creek-southbound-lane": "Dubai Creek Southbound Lane",
  "business-bay-canal": "Dubai Water Canal & Business Bay Lane",
  "jbr-offshore-lane": "JBR Offshore Lane",
};

const ROUTE_BASIN: Partial<Record<BasinRouteId, BasinId>> = {
  "marina-inner-channel": "marina",
  "marina-entrance-lane": "marina",
  "palm-outer-clockwise": "palm-lagoon",
  "palm-inner-lagoon": "palm-lagoon",
  // The Creek water pinches shut mid-estuary, so it is two corridors.
  "creek-northbound-lane": "creek-north",
  "creek-southbound-lane": "creek-south",
  "business-bay-canal": "business-bay",
  "jbr-offshore-lane": "jbr",
};

const basinCenterlineById = new Map(
  BASIN_CORRIDORS.map((corridor) => [corridor.id, corridor.centerline]),
);

function basinRoutePoints(id: BasinRouteId): [number, number][] {
  const basinId = ROUTE_BASIN[id];
  if (basinId) {
    const centerline = basinCenterlineById.get(basinId) ?? [];
    const reversed =
      id === "creek-southbound-lane" || id === "marina-entrance-lane" || id === "palm-inner-lagoon";
    return reversed ? [...centerline].reverse() : [...centerline];
  }
  return [];
}

function numberedRoute(
  prefix: "horizontal" | "diagonal" | "connector" | "yacht-loop",
  index: number,
  points: [number, number][],
): MarineRoute {
  const number = index + 1;
  const isLoop = prefix === "yacht-loop";
  const isConnector = prefix === "connector";
  return {
    id: `gulf-${prefix}-${number}`,
    name: `Arabian Gulf ${prefix.replace("-", " ")} lane ${number}`,
    points,
    category: isLoop ? "yacht-loop" : isConnector ? "connector" : "open-sea",
    layout: isLoop ? "loop" : prefix,
  };
}

const OFFSHORE_ROUTES: MarineRoute[] = [
  ...OPEN_SEA_HORIZONTAL_LANES.map((points, index) => numberedRoute("horizontal", index, points)),
  ...OPEN_SEA_DIAGONAL_LANES.map((points, index) => numberedRoute("diagonal", index, points)),
  ...OPEN_SEA_CONNECTOR_LANES.map((points, index) => numberedRoute("connector", index, points)),
  ...OPEN_SEA_YACHT_LOOPS.map((points, index) => numberedRoute("yacht-loop", index, points)),
];

const BASIN_ROUTES: MarineRoute[] = BASIN_ROUTE_IDS.map((id) => ({
  id,
  name: BASIN_ROUTE_NAMES[id],
  points: basinRoutePoints(id),
  category: ROUTE_BASIN[id] ? "basin" : "connector",
  layout: ROUTE_BASIN[id] ? "basin" : "connector",
  basinId: ROUTE_BASIN[id],
}));

export const MARINE_ROUTES: MarineRoute[] = [...OFFSHORE_ROUTES, ...BASIN_ROUTES];
export const MARINE_ROUTE_IDS = MARINE_ROUTES.map((route) => route.id);

export function getMarineRoute(routeId: string | undefined) {
  return MARINE_ROUTES.find((route) => route.id === routeId);
}

export function getMarineRouteByPoints(points: [number, number][] | undefined) {
  return MARINE_ROUTES.find((route) => route.points === points);
}

export function hashRouteSeed(id: string) {
  return [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

export function marineRoutesForVesselType(type: ModelType) {
  // Cargo ships use the separated horizontal Gulf lanes only. The diagonal
  // routes remain for lighter traffic, keeping large hulls out of crossings.
  if (type === "ship") {
    return MARINE_ROUTES.filter(
      (route) => route.category === "open-sea" && route.layout === "horizontal",
    );
  }
  if (type === "abra") return MARINE_ROUTES.filter((route) => route.category === "basin");
  return MARINE_ROUTES;
}

export function defaultMarineRouteIdForVessel(id: string, type: ModelType): MarineRouteId {
  const candidates = marineRoutesForVesselType(type);
  return candidates[hashRouteSeed(id) % candidates.length].id;
}

const waterAreaById = new Map(WATER_AREAS.map((area) => [area.id, area]));
const basinWaterAreaById = new Map(BASIN_CORRIDORS.map((c) => [c.id, c.waterAreaId]));
const waveIntensityCache = new Map<string, number>();

// A vessel's wave-bob amplitude should match the animated water surface it's
// actually floating on, not a flat full-intensity default — the surface mesh
// scales Gerstner wave height per basin (see WaterArea.waveIntensity in
// water.ts: sheltered Marina/lagoon/canal basins move far less than the open
// Gulf). A route's basin never changes mid-lifetime, so this is computed once
// per route id and cached rather than looked up per frame.
export function waveIntensityForMarineRoute(routeId: string | undefined): number {
  if (!routeId) return 1;
  const cached = waveIntensityCache.get(routeId);
  if (cached !== undefined) return cached;

  const route = getMarineRoute(routeId);
  let intensity = 1;
  if (route?.basinId) {
    const waterAreaId = basinWaterAreaById.get(route.basinId);
    intensity = (waterAreaId && waterAreaById.get(waterAreaId)?.waveIntensity) ?? 1;
  }

  waveIntensityCache.set(routeId, intensity);
  return intensity;
}

export function orderedMarineRouteCandidates(id: string, preferredRouteId?: string) {
  const preferred = getMarineRoute(preferredRouteId);
  const seed = hashRouteSeed(id);
  const ordered = preferred ? [preferred] : [];

  for (let i = 0; i < MARINE_ROUTES.length; i++) {
    const route = MARINE_ROUTES[(seed + i) % MARINE_ROUTES.length];
    if (!ordered.some((candidate) => candidate.id === route.id)) ordered.push(route);
  }

  return ordered;
}

export function defaultSpeedMetersPerSecond(type: ModelType) {
  // Fast, energetic traffic — vessels visibly cruise across the map. Increased for visual impact.
  switch (type) {
    case "ship":
      return 24;
    case "yacht":
      return 32;
    case "boat":
      return 28;
    case "abra":
      return 18;
    default:
      return 0;
  }
}
