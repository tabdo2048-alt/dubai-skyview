import {
  buildModuleUrl,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  Material,
  PolygonGeometry,
  Primitive,
  type Viewer,
} from "cesium";
import { SATELLITE_WATER } from "@/lib/waterAppearance";
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
  const opacity = data.features.some((feature) => feature.properties?.water === "sea")
    ? SATELLITE_WATER.seaOpacity : SATELLITE_WATER.inlandOpacity;
  const material = Material.fromType(Material.WaterType, {
    baseWaterColor: Color.fromCssColorString(MASTERPLAN_THEME.water).withAlpha(opacity),
    blendColor: Color.fromCssColorString(MASTERPLAN_THEME.waterBlend).withAlpha(opacity),
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
      translucent: true,
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

/** Request-render scenes need explicit frames for water even when the camera is idle.
 * Bound the refresh rate and stop requests in hidden tabs / distant globe views.
 */
export function connectCesiumWaterAnimation(viewer: Viewer) {
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const timer = window.setInterval(() => {
    if (viewer.isDestroyed() || document.hidden || viewer.camera.positionCartographic.height > 150_000) return;
    viewer.scene.requestRender();
  }, 1000 / (mobile ? 20 : 30));
  return () => window.clearInterval(timer);
}
