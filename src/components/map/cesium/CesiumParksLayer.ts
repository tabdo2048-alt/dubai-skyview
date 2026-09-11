import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  PerInstanceColorAppearance,
  PolygonGeometry,
} from "cesium";
import { featurePolygons, polygonHierarchy } from "./geojson";
import { MASTERPLAN_THEME } from "./theme";
import type { RuntimeGeoJson } from "./types";

export function createCesiumParksLayer(data: RuntimeGeoJson) {
  const instances: GeometryInstance[] = [];
  const color = Color.fromCssColorString(MASTERPLAN_THEME.park);

  for (const feature of data.features) {
    for (const polygon of featurePolygons(feature)) {
      const hierarchy = polygonHierarchy(polygon);
      if (!hierarchy) continue;
      instances.push(new GeometryInstance({
        id: { kind: "park", featureId: feature.id, properties: feature.properties },
        geometry: new PolygonGeometry({
          polygonHierarchy: hierarchy,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
      }));
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
