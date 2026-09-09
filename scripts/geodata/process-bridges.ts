import { ESTIMATED_ROAD_ELEVATION } from "./config";
import type { FeatureCollection } from "./lib";

export function processBridges(input: FeatureCollection): FeatureCollection {
  return {
    ...input,
    features: input.features.map((feature) => {
      const bridge = feature.properties.bridge;
      if (!(bridge === true || (typeof bridge === "string" && bridge !== "no"))) return feature;
      const layer = Math.max(1, Number(feature.properties.layer) || 1);
      const explicit = Number(feature.properties.ele);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          bridge: true,
          layer,
          elevation_m: Number.isFinite(explicit)
            ? explicit
            : ESTIMATED_ROAD_ELEVATION.bridgeBaseClearanceM +
              (layer - 1) * ESTIMATED_ROAD_ELEVATION.layerStepM,
          elevation_source: Number.isFinite(explicit) ? "osm-ele" : "configurable-estimate",
        },
      };
    }),
  };
}

