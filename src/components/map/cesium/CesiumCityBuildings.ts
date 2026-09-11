import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  Primitive,
  ShadowMode,
} from "cesium";
import type { ProjectWithRelations } from "@/lib/types";
import { MASTERPLAN_LAYOUT, MASTERPLAN_THEME } from "./theme";
import { featurePolygons, polygonCentroid, polygonHierarchy } from "./geojson";
import { isInsideAnyProjectPlot } from "./CesiumProjectClipping";
import type { RuntimeGeoJson } from "./types";

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildingHeight(properties: RuntimeGeoJson["features"][number]["properties"]) {
  const official = finiteNumber(properties?.official_height_m);
  const osm = finiteNumber(properties?.height_m ?? properties?.height);
  const levels = finiteNumber(properties?.levels ?? properties?.["building:levels"]);
  const raw = official ?? osm ?? (levels ? levels * MASTERPLAN_LAYOUT.defaultFloorHeightM : null);
  const kind = String(properties?.building_usage ?? properties?.building ?? "unknown").toLowerCase();
  const fallbackKey =
    kind.includes("hotel") ? "hotel" :
    kind.includes("commercial") || kind.includes("office") ? "commercial" :
    kind.includes("apart") ? "apartments" :
    kind.includes("residential") ? "residential" :
    kind.includes("industrial") ? "industrial" :
    kind.includes("retail") ? "retail" : "unknown";
  return Math.min(
    MASTERPLAN_LAYOUT.maximumBuildingHeightM,
    Math.max(
      MASTERPLAN_LAYOUT.minimumBuildingHeightM,
      raw ?? MASTERPLAN_LAYOUT.fallbackHeightByTypeM[fallbackKey],
    ),
  );
}

function buildingColor(properties: RuntimeGeoJson["features"][number]["properties"]) {
  const kind = String(properties?.building_usage ?? properties?.building ?? "").toLowerCase();
  const material = String(properties?.["building:material"] ?? "").toLowerCase();
  if (properties?.landmark || material.includes("glass")) return MASTERPLAN_THEME.buildingLandmark;
  if (kind.includes("hotel")) return MASTERPLAN_THEME.buildingHotel;
  if (kind.includes("commercial") || kind.includes("office")) return MASTERPLAN_THEME.buildingCommercial;
  if (kind.includes("residential") || kind.includes("apart")) return MASTERPLAN_THEME.buildingResidential;
  return MASTERPLAN_THEME.buildingUnknown;
}

export function createCesiumCityBuildings(
  data: RuntimeGeoJson,
  projectsWithPlots: ProjectWithRelations[],
) {
  const instances: GeometryInstance[] = [];
  for (const feature of data.features) {
    for (const polygon of featurePolygons(feature)) {
      const centroid = polygonCentroid(polygon);
      if (centroid && isInsideAnyProjectPlot(centroid[0], centroid[1], projectsWithPlots)) continue;
      const hierarchy = polygonHierarchy(polygon);
      if (!hierarchy) continue;
      const color = Color.fromCssColorString(buildingColor(feature.properties));
      instances.push(
        new GeometryInstance({
          id: { kind: "base-building", featureId: feature.id, properties: feature.properties },
          geometry: new PolygonGeometry({
            polygonHierarchy: hierarchy,
            height: 0.4,
            extrudedHeight: buildingHeight(feature.properties),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
        }),
      );
    }
  }
  if (!instances.length) return null;
  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ flat: false, closed: true, translucent: false }),
    shadows: ShadowMode.ENABLED,
    asynchronous: true,
    allowPicking: true,
  });
}
