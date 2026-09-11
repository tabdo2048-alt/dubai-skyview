import { HEIGHT_FALLBACKS } from "./config";
import type { Feature, FeatureCollection, Properties } from "./lib";

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function fallbackType(properties: Properties) {
  const value = String(properties.building_usage ?? properties.building ?? "unknown").toLowerCase();
  if (value.includes("hotel")) return "hotel";
  if (value.includes("commercial") || value.includes("office")) return "commercial";
  if (value.includes("apart")) return "apartments";
  if (value.includes("residential")) return "residential";
  if (value.includes("industrial")) return "industrial";
  if (value.includes("retail")) return "retail";
  return "unknown";
}

export function processBuildings(input: FeatureCollection): FeatureCollection {
  const features: Feature[] = input.features
    .filter((feature) => Boolean(feature.properties.building))
    .map((feature) => {
      const official = numeric(feature.properties.official_height_m);
      const osmHeight = numeric(feature.properties.height);
      const osmLandmarkHeight = feature.properties.landmark
        ? numeric(feature.properties.maxheight)
        : null;
      const levels = numeric(feature.properties["building:levels"]);
      const kind = fallbackType(feature.properties);
      const height =
        official ??
        osmHeight ??
        osmLandmarkHeight ??
        (levels ? levels * HEIGHT_FALLBACKS.floorHeightM : HEIGHT_FALLBACKS.byTypeM[kind]);
      const heightSource = official
        ? "official"
        : osmHeight
          ? "osm-height"
          : osmLandmarkHeight
            ? "osm-landmark-maxheight"
          : levels
            ? "osm-levels-estimate"
            : "type-estimate";
      return {
        ...feature,
        properties: {
          ...feature.properties,
          height_m: Math.max(3, Math.min(HEIGHT_FALLBACKS.maximumHeightM, height)),
          height_source: heightSource,
          height_is_estimated: heightSource.includes("estimate"),
        },
      };
    });
  return { ...input, features };
}
