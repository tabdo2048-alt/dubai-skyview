import {
  Cartesian3,
  Color,
  Material,
  PointPrimitiveCollection,
  PolylineCollection,
  type Viewer,
} from "cesium";
import { METRO_LINES, TRAIN_LINES, type MetroLine } from "@/lib/metro";

function positions(path: [number, number][]) {
  return Cartesian3.fromDegreesArrayHeights(path.flatMap(([longitude, latitude]) => [longitude, latitude, 4]));
}

export class CesiumRailLayer {
  private readonly lines: PolylineCollection;
  private readonly stations: PointPrimitiveCollection;

  constructor(private readonly viewer: Viewer) {
    this.lines = viewer.scene.primitives.add(new PolylineCollection());
    this.stations = viewer.scene.primitives.add(new PointPrimitiveCollection());
  }

  update(showMetro: boolean, showRegionalRail: boolean) {
    this.lines.removeAll();
    this.stations.removeAll();
    const sources: MetroLine[] = [
      ...(showMetro ? METRO_LINES : []),
      ...(showRegionalRail ? TRAIN_LINES : []),
    ];
    for (const line of sources) {
      if (line.path.length < 2) continue;
      const color = Color.fromCssColorString(line.color);
      this.lines.add({
        positions: positions(line.path),
        width: line.category === "train" ? 3 : 4,
        material: Material.fromType("Color", { color }),
        id: { kind: "rail-line", lineId: line.id, name: line.name },
      });
      for (const station of line.stations) {
        this.stations.add({
          position: Cartesian3.fromDegrees(station.coord[0], station.coord[1], 5),
          pixelSize: station.interchange ? 10 : 7,
          color,
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          id: { kind: "rail-station", stationId: station.id, name: station.name },
        });
      }
    }
    this.viewer.scene.requestRender();
  }

  destroy() {
    this.viewer.scene.primitives.remove(this.lines);
    this.viewer.scene.primitives.remove(this.stations);
  }
}

