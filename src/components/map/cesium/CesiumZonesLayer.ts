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
  type Viewer,
} from "cesium";
import {
  ZONE_CATEGORIES,
  normalizeZoneCategory,
  type ZoneCategory,
  type ZoneRow,
} from "@/lib/zones";
import { polygonHierarchy } from "./geojson";

type Resource = GroundPrimitive | GroundPolylinePrimitive;

function geometry(zone: ZoneRow) {
  const candidate = zone.geometry as { type?: unknown; coordinates?: unknown } | null;
  return candidate?.type === "Polygon" && Array.isArray(candidate.coordinates)
    ? (candidate.coordinates as number[][][])
    : null;
}

export class CesiumZonesLayer {
  private resources: Resource[] = [];

  constructor(private readonly viewer: Viewer) {}

  update(zones: ZoneRow[], categories: Set<ZoneCategory>) {
    for (const resource of this.resources) this.viewer.scene.primitives.remove(resource);
    this.resources = [];
    for (const category of categories) {
      const fills: GeometryInstance[] = [];
      const lines: GeometryInstance[] = [];
      const color = Color.fromCssColorString(ZONE_CATEGORIES[category].full);
      for (const zone of zones) {
        if (normalizeZoneCategory(zone.category) !== category) continue;
        const polygon = geometry(zone);
        if (!polygon) continue;
        const hierarchy = polygonHierarchy(polygon);
        if (!hierarchy) continue;
        fills.push(new GeometryInstance({
          id: { kind: "investment-zone", zoneId: zone.id, name: zone.name, category },
          geometry: new PolygonGeometry({ polygonHierarchy: hierarchy, vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.14)) },
        }));
        lines.push(new GeometryInstance({
          id: { kind: "investment-zone", zoneId: zone.id, name: zone.name, category },
          geometry: new GroundPolylineGeometry({
            positions: Cartesian3.fromDegreesArray(polygon[0].flatMap((point) => point.slice(0, 2))),
            width: 3,
          }),
        }));
      }
      if (fills.length) {
        this.resources.push(this.viewer.scene.primitives.add(new GroundPrimitive({
          geometryInstances: fills,
          appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
          asynchronous: true,
        })));
      }
      if (lines.length) {
        this.resources.push(this.viewer.scene.primitives.add(new GroundPolylinePrimitive({
          geometryInstances: lines,
          appearance: new PolylineMaterialAppearance({ material: Material.fromType("Color", { color }) }),
          asynchronous: true,
        })));
      }
    }
    this.viewer.scene.requestRender();
  }

  destroy() {
    for (const resource of this.resources) this.viewer.scene.primitives.remove(resource);
    this.resources = [];
  }
}

