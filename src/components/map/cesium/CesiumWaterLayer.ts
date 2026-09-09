import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  PerInstanceColorAppearance,
  PolygonGeometry,
} from "cesium";
import { featurePolygons, polygonHierarchy } from "./geojson";
import { MASTERPLAN_LAYOUT, MASTERPLAN_THEME } from "./theme";
import type { RuntimeGeoJson } from "./types";

export function createCesiumWaterLayer(data: RuntimeGeoJson) {
  const color = Color.fromCssColorString(MASTERPLAN_THEME.water).withAlpha(0.94);
  const instances: GeometryInstance[] = [];
  for (const feature of data.features) {
    for (const polygon of featurePolygons(feature)) {
      const hierarchy = polygonHierarchy(polygon, MASTERPLAN_LAYOUT.waterOffsetM);
      if (!hierarchy) continue;
      instances.push(
        new GeometryInstance({
          id: { kind: "water", featureId: feature.id, properties: feature.properties },
          geometry: new PolygonGeometry({
            polygonHierarchy: hierarchy,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
        }),
      );
    }
  }
  if (!instances.length) return null;
  return new GroundPrimitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ flat: true, translucent: false }),
    asynchronous: true,
    allowPicking: false,
  });
}

/** Reuses the repository's existing OSM-derived Dubai coastline in Cesium. */
export async function createCesiumDubaiCoastlineLayer() {
  const coastline = await import("@/lib/coastline.generated");
  const features: RuntimeGeoJson["features"] = coastline.SEA_POLYGONS.map((polygon, index) => ({
    type: "Feature",
    id: `osm-dubai-sea-${index + 1}`,
    properties: { source: "OpenStreetMap", water: "sea" },
    geometry: { type: "Polygon", coordinates: [polygon.outer, ...polygon.holes] },
  }));
  return createCesiumWaterLayer({
    type: "FeatureCollection",
    features,
    metadata: {
      source: "OpenStreetMap",
      sourceDate: "2026-09-02",
      generatedAt: "2026-09-02T00:00:00.000Z",
      pipelineVersion: 1,
      license: "ODbL-1.0",
    },
  });
}
