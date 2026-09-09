import type { FeatureCollection } from "./lib";

export function processWater(input: FeatureCollection): FeatureCollection {
  return {
    ...input,
    features: input.features.filter(
      (feature) => feature.properties.natural === "water" || feature.properties.waterway === "riverbank",
    ),
  };
}

