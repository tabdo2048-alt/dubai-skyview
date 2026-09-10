import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  GroundPrimitive,
  Material,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolylineMaterialAppearance,
} from "cesium";
import { featurePolygons, polygonHierarchy } from "./geojson";
import { MASTERPLAN_THEME } from "./theme";
import type { RuntimeGeoJson } from "./types";

export function createCesiumCommunitiesLayer(
  data: RuntimeGeoJson,
  options: { showFill?: boolean } = {},
) {
  const fills: GeometryInstance[] = [];
  const outlines: GeometryInstance[] = [];
  for (const feature of data.features) {
    for (const polygon of featurePolygons(feature)) {
      const hierarchy = polygonHierarchy(polygon);
      if (!hierarchy) continue;
      const id = { kind: "community", featureId: feature.id, properties: feature.properties };
      fills.push(
        new GeometryInstance({
          id,
          geometry: new PolygonGeometry({
            polygonHierarchy: hierarchy,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              Color.fromCssColorString(MASTERPLAN_THEME.goldAccent).withAlpha(0.07),
            ),
          },
        }),
      );
      const outer = polygon[0];
      if (outer?.length > 2) {
        outlines.push(
          new GeometryInstance({
            id,
            geometry: new GroundPolylineGeometry({
              positions: Cartesian3.fromDegreesArray(outer.flatMap((point) => point.slice(0, 2))),
              width: 2,
            }),
          }),
        );
      }
    }
  }
  const fill = fills.length && options.showFill !== false
    ? new GroundPrimitive({
        geometryInstances: fills,
        appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
        asynchronous: true,
        allowPicking: true,
      })
    : null;
  const outline = outlines.length
    ? new GroundPolylinePrimitive({
        geometryInstances: outlines,
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType("Color", {
            color: Color.fromCssColorString(MASTERPLAN_THEME.projectBoundary).withAlpha(0.75),
          }),
        }),
        asynchronous: true,
        allowPicking: true,
      })
    : null;
  return { fill, outline };
}
