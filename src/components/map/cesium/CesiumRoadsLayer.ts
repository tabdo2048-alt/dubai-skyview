import {
  Cartesian3,
  Color,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  Material,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
} from "cesium";
import { featureLines, lineToPositions } from "./geojson";
import { MASTERPLAN_LAYOUT, MASTERPLAN_THEME } from "./theme";
import type { RuntimeGeoJson, RuntimeGeoJsonFeature } from "./types";

type RoadClass = "motorway" | "trunk" | "primary" | "secondary" | "tertiary" | "residential" | "service";

const ROAD_STYLE: Record<RoadClass, { color: string; width: number }> = {
  motorway: { color: MASTERPLAN_THEME.roadMotorway, width: 7 },
  trunk: { color: MASTERPLAN_THEME.roadTrunk, width: 6 },
  primary: { color: MASTERPLAN_THEME.roadPrimary, width: 5 },
  secondary: { color: MASTERPLAN_THEME.roadSecondary, width: 4 },
  tertiary: { color: MASTERPLAN_THEME.roadTertiary, width: 3.2 },
  residential: { color: MASTERPLAN_THEME.roadLocal, width: 2.2 },
  service: { color: MASTERPLAN_THEME.roadService, width: 1.4 },
};

function roadClass(feature: RuntimeGeoJsonFeature): RoadClass {
  const raw = String(feature.properties?.road_class ?? feature.properties?.highway ?? "service");
  if (raw.includes("motorway")) return "motorway";
  if (raw.includes("trunk")) return "trunk";
  if (raw.includes("primary")) return "primary";
  if (raw.includes("secondary")) return "secondary";
  if (raw.includes("tertiary")) return "tertiary";
  if (raw.includes("residential") || raw.includes("living_street")) return "residential";
  return "service";
}

function isBridge(feature: RuntimeGeoJsonFeature) {
  const bridge = feature.properties?.bridge;
  return bridge === true || (typeof bridge === "string" && bridge !== "no");
}

function isTunnel(feature: RuntimeGeoJsonFeature) {
  const tunnel = feature.properties?.tunnel;
  return tunnel === true || (typeof tunnel === "string" && tunnel !== "no");
}

function bridgeHeight(feature: RuntimeGeoJsonFeature) {
  const layer = Math.max(1, Number(feature.properties?.layer) || 1);
  const explicit = Number(feature.properties?.elevation_m);
  return Number.isFinite(explicit)
    ? explicit
    : MASTERPLAN_LAYOUT.bridgeBaseClearanceM + (layer - 1) * MASTERPLAN_LAYOUT.bridgeLayerStepM;
}

export type CesiumRoadPrimitives = {
  ground: GroundPolylinePrimitive[];
  elevated: Primitive[];
};

export function createCesiumRoadsLayer(data: RuntimeGeoJson): CesiumRoadPrimitives {
  const grouped = new Map<RoadClass, GeometryInstance[]>();
  const bridges = new Map<RoadClass, GeometryInstance[]>();

  for (const feature of data.features) {
    if (isTunnel(feature)) continue;
    const kind = roadClass(feature);
    const target = isBridge(feature) ? bridges : grouped;
    const height = isBridge(feature) ? bridgeHeight(feature) : MASTERPLAN_LAYOUT.roadGroundOffsetM;
    for (const line of featureLines(feature)) {
      if (line.length < 2) continue;
      const geometry = isBridge(feature)
        ? new PolylineGeometry({ positions: lineToPositions(line, height), width: ROAD_STYLE[kind].width })
        : new GroundPolylineGeometry({
            positions: Cartesian3.fromDegreesArray(line.flatMap((point) => point.slice(0, 2))),
            width: ROAD_STYLE[kind].width,
          });
      const instances = target.get(kind) ?? [];
      instances.push(
        new GeometryInstance({
          id: { kind: isBridge(feature) ? "road-bridge" : "road", featureId: feature.id, properties: feature.properties },
          geometry,
        }),
      );
      target.set(kind, instances);
    }
  }

  const ground: GroundPolylinePrimitive[] = [];
  const elevated: Primitive[] = [];
  for (const [kind, geometryInstances] of grouped) {
    ground.push(
      new GroundPolylinePrimitive({
        geometryInstances,
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType("Color", { color: Color.fromCssColorString(ROAD_STYLE[kind].color) }),
        }),
        asynchronous: true,
        allowPicking: true,
      }),
    );
  }
  for (const [kind, geometryInstances] of bridges) {
    elevated.push(
      new Primitive({
        geometryInstances,
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType("Color", { color: Color.fromCssColorString(MASTERPLAN_THEME.roadBridge) }),
        }),
        asynchronous: true,
        allowPicking: true,
      }),
    );
  }
  return { ground, elevated };
}

