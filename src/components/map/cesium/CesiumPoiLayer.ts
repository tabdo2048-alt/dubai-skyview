import {
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  PointPrimitiveCollection,
  VerticalOrigin,
  type Viewer,
} from "cesium";
import type { PoiPoint } from "@/hooks/use-pois";

const COLORS = { hospitals: "#ef4444", schools: "#3b82f6", tourism: "#f59e0b" } as const;

export class CesiumPoiLayer {
  private readonly points: PointPrimitiveCollection;
  private readonly labels: LabelCollection;

  constructor(private readonly viewer: Viewer) {
    this.points = viewer.scene.primitives.add(new PointPrimitiveCollection());
    this.labels = viewer.scene.primitives.add(new LabelCollection());
  }

  update(pois: PoiPoint[]) {
    this.points.removeAll();
    this.labels.removeAll();
    for (const poi of pois) {
      const position = Cartesian3.fromDegrees(poi.lng, poi.lat, 8);
      this.points.add({
        position,
        id: { kind: "poi", poiId: poi.id, category: poi.category },
        pixelSize: 14,
        color: Color.fromCssColorString(COLORS[poi.category]),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: 12_000,
      });
      this.labels.add({
        position,
        text: poi.name,
        font: "600 12px system-ui",
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString("#102729"),
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -13),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 25_000),
      });
    }
    this.viewer.scene.requestRender();
  }

  destroy() {
    this.viewer.scene.primitives.remove(this.points);
    this.viewer.scene.primitives.remove(this.labels);
  }
}

