import { OPEN_SEA_LANES } from "./navigationWater";
import type { ModelType } from "./mapbox/modelTypes";

export type MarineRouteId =
  | "gulf-west-east-outer"
  | "gulf-west-east-middle"
  | "gulf-west-east-inner"
  | "gulf-southwest-northeast"
  | "gulf-northwest-southeast"
  | "gulf-west-vertical"
  | "gulf-mid-vertical"
  | "gulf-east-vertical"
  | "gulf-yacht-loop-west"
  | "gulf-yacht-loop-east"
  | "marina-inner-channel"
  | "marina-entrance-lane"
  | "palm-outer-clockwise"
  | "palm-inner-lagoon"
  | "creek-northbound-lane"
  | "creek-southbound-lane"
  | "business-bay-canal"
  | "jbr-offshore-lane";

export type MarineRoute = {
  id: MarineRouteId;
  name: string;
  points: [number, number][];
  category: "open-sea" | "yacht-loop" | "connector";
};

const ROUTE_IDS: MarineRouteId[] = [
  "gulf-west-east-outer",
  "gulf-west-east-middle",
  "gulf-west-east-inner",
  "gulf-southwest-northeast",
  "gulf-northwest-southeast",
  "gulf-west-vertical",
  "gulf-mid-vertical",
  "gulf-east-vertical",
  "gulf-yacht-loop-west",
  "gulf-yacht-loop-east",
  "marina-inner-channel",
  "marina-entrance-lane",
  "palm-outer-clockwise",
  "palm-inner-lagoon",
  "creek-northbound-lane",
  "creek-southbound-lane",
  "business-bay-canal",
  "jbr-offshore-lane",
];

const ROUTE_NAMES: Record<MarineRouteId, string> = {
  "gulf-west-east-outer": "Arabian Gulf outer west-east lane",
  "gulf-west-east-middle": "Arabian Gulf middle west-east lane",
  "gulf-west-east-inner": "Arabian Gulf inner west-east lane",
  "gulf-southwest-northeast": "Arabian Gulf southwest to northeast crossing",
  "gulf-northwest-southeast": "Arabian Gulf northwest to southeast crossing",
  "gulf-west-vertical": "Arabian Gulf west connector",
  "gulf-mid-vertical": "Arabian Gulf central connector",
  "gulf-east-vertical": "Arabian Gulf east connector",
  "gulf-yacht-loop-west": "Arabian Gulf west yacht loop",
  "gulf-yacht-loop-east": "Arabian Gulf east yacht loop",
  "marina-inner-channel": "Dubai Marina Inner Channel",
  "marina-entrance-lane": "Dubai Marina Entrance Lane",
  "palm-outer-clockwise": "Palm Jumeirah Outer Crescent (Clockwise)",
  "palm-inner-lagoon": "Palm Jumeirah Inner Lagoon",
  "creek-northbound-lane": "Dubai Creek Northbound Lane",
  "creek-southbound-lane": "Dubai Creek Southbound Lane",
  "business-bay-canal": "Dubai Water Canal & Business Bay Lane",
  "jbr-offshore-lane": "JBR Offshore Lane",
};

function routeCategory(index: number): MarineRoute["category"] {
  if (index >= 18) return "connector"; // basin routes (index 10-17)
  if (index >= 8) return "yacht-loop";
  if (index >= 5) return "connector";
  return "open-sea";
}

// Basin-specific routes (8 new): Marina, Palm, Creek, Business Bay, JBR
// TODO(satellite-trace): Replace placeholder coordinates with satellite-traced waypoints
const BASIN_ROUTES: Partial<Record<MarineRouteId, [number, number][]>> = {
  "marina-inner-channel": [
    [55.1405, 25.0705],
    [55.1385, 25.0745],
    [55.136, 25.079],
    [55.133, 25.083],
    [55.13, 25.0865],
    [55.1275, 25.0895],
  ],
  "marina-entrance-lane": [
    [55.1442, 25.0688],
    [55.1405, 25.0705],
    [55.1360, 25.0725],
    [55.1310, 25.0745],
  ],
  "palm-outer-clockwise": [
    [55.104, 25.128],
    [55.118, 25.134],
    [55.134, 25.136],
    [55.150, 25.132],
    [55.162, 25.122],
    [55.166, 25.108],
    [55.160, 25.096],
    [55.146, 25.090],
    [55.130, 25.089],
    [55.116, 25.094],
    [55.106, 25.104],
    [55.102, 25.116],
    [55.104, 25.128],
  ],
  "palm-inner-lagoon": [
    [55.118, 25.108],
    [55.128, 25.112],
    [55.138, 25.115],
    [55.148, 25.116],
    [55.156, 25.113],
    [55.150, 25.105],
    [55.140, 25.103],
    [55.128, 25.104],
  ],
  "creek-northbound-lane": [
    [55.332, 25.221],
    [55.3255, 25.229],
    [55.317, 25.239],
    [55.308, 25.251],
    [55.3005, 25.2615],
  ],
  "creek-southbound-lane": [
    [55.3, 25.262],
    [55.308, 25.25],
    [55.317, 25.238],
    [55.326, 25.228],
    [55.332, 25.221],
  ],
  "business-bay-canal": [
    [55.2705, 25.1875],
    [55.2685, 25.182],
    [55.267, 25.1765],
    [55.2685, 25.171],
    [55.272, 25.1665],
  ],
  "jbr-offshore-lane": [
    [55.118, 25.058],
    [55.108, 25.070],
    [55.100, 25.084],
    [55.094, 25.100],
    [55.090, 25.116],
  ],
};

export const MARINE_ROUTES: MarineRoute[] = ROUTE_IDS.map((id, index) => ({
  id,
  name: ROUTE_NAMES[id],
  points: index < 10 ? OPEN_SEA_LANES[index] : (BASIN_ROUTES[id] ?? []),
  category: routeCategory(index),
}));

export const MARINE_ROUTE_IDS = MARINE_ROUTES.map((route) => route.id);

export function getMarineRoute(routeId: string | undefined) {
  return MARINE_ROUTES.find((route) => route.id === routeId);
}

export function hashRouteSeed(id: string) {
  return [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

export function defaultMarineRouteIdForVessel(id: string, type: ModelType): MarineRouteId {
  const seed = hashRouteSeed(id);
  const candidates =
    type === "ship"
      ? MARINE_ROUTES.filter((route) => route.category === "open-sea")
      : MARINE_ROUTES;
  return candidates[seed % candidates.length].id;
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
  switch (type) {
    case "ship":
      return 6;
    case "yacht":
      return 8.5;
    case "boat":
      return 7.2;
    case "abra":
      return 5;
    default:
      return 0;
  }
}
