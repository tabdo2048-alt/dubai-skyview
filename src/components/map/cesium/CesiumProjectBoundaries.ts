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
import type { ProjectWithRelations } from "@/lib/types";
import { polygonHierarchy } from "./geojson";
import { projectPlot } from "./CesiumProjectClipping";
import { MASTERPLAN_THEME } from "./theme";

type BoundaryResource = GroundPrimitive | GroundPolylinePrimitive;

export class CesiumProjectBoundaries {
  private resources: BoundaryResource[] = [];

  constructor(private readonly viewer: Viewer) {}

  update(projects: ProjectWithRelations[], activeIds: Set<string>) {
    for (const resource of this.resources) this.viewer.scene.primitives.remove(resource);
    this.resources = [];
    const fills: GeometryInstance[] = [];
    const lines: GeometryInstance[] = [];
    for (const project of projects) {
      if (!activeIds.has(project.id)) continue;
      const plot = projectPlot(project);
      if (!plot) continue;
      const hierarchy = polygonHierarchy(plot);
      if (!hierarchy) continue;
      const color = Color.fromCssColorString(project.plot_color || MASTERPLAN_THEME.projectBoundary);
      fills.push(
        new GeometryInstance({
          id: { kind: "project", projectId: project.id, source: "marker" },
          geometry: new PolygonGeometry({
            polygonHierarchy: hierarchy,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.16)) },
        }),
      );
      lines.push(
        new GeometryInstance({
          id: { kind: "project", projectId: project.id, source: "marker" },
          geometry: new GroundPolylineGeometry({
            positions: Cartesian3.fromDegreesArray(plot[0].flatMap((point) => point.slice(0, 2))),
            width: 3,
          }),
        }),
      );
    }
    if (fills.length) {
      this.resources.push(
        this.viewer.scene.primitives.add(
          new GroundPrimitive({
            geometryInstances: fills,
            appearance: new PerInstanceColorAppearance({ flat: true, translucent: true }),
            asynchronous: true,
          }),
        ),
      );
    }
    if (lines.length) {
      this.resources.push(
        this.viewer.scene.primitives.add(
          new GroundPolylinePrimitive({
            geometryInstances: lines,
            appearance: new PolylineMaterialAppearance({
              material: Material.fromType("Color", {
                color: Color.fromCssColorString(MASTERPLAN_THEME.projectBoundary),
              }),
            }),
            asynchronous: true,
          }),
        ),
      );
    }
    this.viewer.scene.requestRender();
  }

  destroy() {
    for (const resource of this.resources) this.viewer.scene.primitives.remove(resource);
    this.resources = [];
  }
}

