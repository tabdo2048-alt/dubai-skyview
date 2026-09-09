import type { FeatureCollection } from "./lib";

export function processTunnels(input: FeatureCollection): FeatureCollection {
  return {
    ...input,
    features: input.features.map((feature) => {
      const tunnel = feature.properties.tunnel;
      if (!(tunnel === true || (typeof tunnel === "string" && tunnel !== "no"))) return feature;
      return {
        ...feature,
        properties: { ...feature.properties, tunnel: true, render_policy: "hidden-below-ground" },
      };
    }),
  };
}

