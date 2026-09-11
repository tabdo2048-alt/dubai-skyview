import type { FeatureCollection } from "./lib";

export function processParks(input: FeatureCollection): FeatureCollection {
  return {
    ...input,
    features: input.features.filter((feature) => feature.properties.leisure === "park"),
  };
}
