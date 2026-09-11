import {
  Cartesian3,
  ClippingPolygon,
  ClippingPolygonCollection,
  type Cesium3DTileset,
  type Viewer,
} from "cesium";
import { buffer, booleanValid, kinks, polygon } from "@turf/turf";
import type { ProjectWithRelations } from "@/lib/types";
import { validPlotGeometry } from "./CesiumProjectClipping";

/** Supports concave parcels and courtyard holes, including buffer-generated MultiPolygons. */
export function insertPolygons(plot: unknown, paddingMeters: number): number[][][][] | null {
  const coordinates = validPlotGeometry(plot);
  if (!coordinates) return null;
  const source = polygon(coordinates);
  if (!booleanValid(source) || kinks(source).features.length) return null;
  const buffered = paddingMeters > 0 ? buffer(source, paddingMeters, { units: "meters" }) : source;
  if (!buffered || !booleanValid(buffered)) return null;
  return buffered.geometry.type === "Polygon"
    ? [buffered.geometry.coordinates]
    : buffered.geometry.coordinates;
}

/** Each entry exists only while its developer resource is READY and VISIBLE. */
export class CesiumBuildingInserts {
  private readonly collection = new ClippingPolygonCollection({ inverse: false });
  private readonly polygons = new Map<string, ClippingPolygon[]>();
  constructor(
    private readonly viewer: Viewer,
    tileset: Cesium3DTileset,
    private readonly padding: number,
  ) {
    tileset.clippingPolygons = this.collection;
  }
  activate(project: { id: string; plot_geometry: unknown }): boolean {
    if (this.polygons.has(project.id)) return true;
    const added: ClippingPolygon[] = [];
    try {
      const footprints = insertPolygons(project.plot_geometry, this.padding);
      if (!footprints) return false;
      const positions = (ring: number[][]) =>
        ring.slice(0, -1).map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat));
      const polygons = footprints.map(
        (rings) =>
          new ClippingPolygon({
            positions: positions(rings[0]),
            holes: rings.slice(1).map(positions),
          }),
      );
      for (const polygon of polygons) {
        this.collection.add(polygon);
        added.push(polygon);
      }
      this.polygons.set(project.id, polygons);
      this.viewer.scene.requestRender();
      return true;
    } catch {
      for (const polygon of added) this.collection.remove(polygon);
      return false;
    }
  }
  deactivate(projectId: string) {
    for (const polygon of this.polygons.get(projectId) ?? []) this.collection.remove(polygon);
    this.polygons.delete(projectId);
    this.viewer.scene.requestRender();
  }
  clear() {
    this.collection.removeAll();
    this.polygons.clear();
  }
}
