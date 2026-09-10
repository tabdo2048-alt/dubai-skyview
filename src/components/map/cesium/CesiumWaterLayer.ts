import {
  buildModuleUrl,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  Material,
  PolygonGeometry,
  Primitive,
} from "cesium";
import { featurePolygons, polygonHierarchy } from "./geojson";
import { MASTERPLAN_LAYOUT, MASTERPLAN_THEME, MASTERPLAN_VISUALS } from "./theme";
import type { RuntimeGeoJson } from "./types";

export function createCesiumWaterLayer(data: RuntimeGeoJson) {
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
            perPositionHeight: true,
            vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
          }),
        }),
      );
    }
  }
  if (!instances.length) return null;
  const material = Material.fromType(Material.WaterType, {
    baseWaterColor: Color.fromCssColorString(MASTERPLAN_THEME.water),
    blendColor: Color.fromCssColorString(MASTERPLAN_THEME.waterBlend),
    normalMap: buildModuleUrl("Assets/Textures/waterNormalsSmall.jpg"),
    ...MASTERPLAN_VISUALS.water,
  });
  return new Primitive({
    geometryInstances: instances,
    appearance: new EllipsoidSurfaceAppearance({
      aboveGround: true,
      faceForward: true,
      flat: false,
      material,
      translucent: false,
    }),
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
