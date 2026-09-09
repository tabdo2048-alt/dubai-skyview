import type { FeatureCollection } from "./lib";
import { processBridges } from "./process-bridges";
import { processTunnels } from "./process-tunnels";

const SUPPORTED = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
  "living_street", "service",
]);

export function processRoads(input: FeatureCollection): FeatureCollection {
  const roads: FeatureCollection = {
    ...input,
    features: input.features
      .filter((feature) => SUPPORTED.has(String(feature.properties.highway)))
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          road_class: String(feature.properties.highway).replace(/_link$/, ""),
          source_priority: "osm-general",
        },
      })),
  };
  return processTunnels(processBridges(roads));
}

