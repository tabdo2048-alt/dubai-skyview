import {
  OPEN_SEA_CONNECTOR_LANES,
  OPEN_SEA_DIAGONAL_LANES,
  OPEN_SEA_HORIZONTAL_LANES,
  OPEN_SEA_YACHT_LOOPS,
} from "./navigationWater";
import { BASIN_CORRIDORS, type BasinId } from "./navigationBasins";
import type { ModelType } from "./mapbox/modelTypes";

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
  // jbr-offshore-lane: deep water off JBR/Marina, inside the open-gulf navigation
  // polygon (the beachfront itself is too close to shore for moving vessels).
  return [
    [55.1, 25.182],
    [55.09, 25.186],
    [55.078, 25.19],
    [55.066, 25.193],
    [55.054, 25.195],
  ];
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
  if (type === "ship") return MARINE_ROUTES.filter((route) => route.category === "open-sea");
  if (type === "abra") return MARINE_ROUTES.filter((route) => route.category === "basin");
  return MARINE_ROUTES;
}

export function defaultMarineRouteIdForVessel(id: string, type: ModelType): MarineRouteId {
  const candidates = marineRoutesForVesselType(type);
  return candidates[hashRouteSeed(id) % candidates.length].id;
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
  // Brisk but believable traffic that remains readable at Dubai-wide zoom.
  switch (type) {
    case "ship":
      return 9;
    case "yacht":
      return 12;
    case "boat":
      return 11;
    case "abra":
      return 7.5;
    default:
      return 0;
  }
}
