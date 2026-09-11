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
import { MASTERPLAN_LAYOUT, MASTERPLAN_THEME, MASTERPLAN_VISUALS } from "./theme";
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

type PreparedRoad = {
  feature: RuntimeGeoJsonFeature;
  line: number[][];
  height: number;
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

function material(color: string, alpha = 1) {
  return Material.fromType(Material.ColorType, {
    color: Color.fromCssColorString(color).withAlpha(alpha),
  });
}

function groundInstances(roads: PreparedRoad[], width: number, pickable: boolean) {
  return roads.map(({ feature, line }) => new GeometryInstance({
    id: pickable ? { kind: "road", featureId: feature.id, properties: feature.properties } : undefined,
    geometry: new GroundPolylineGeometry({
      positions: Cartesian3.fromDegreesArray(line.flatMap((point) => point.slice(0, 2))),
      width,
    }),
  }));
}

function elevatedInstances(
  roads: PreparedRoad[],
  width: number,
  heightOffset: number,
  pickable: boolean,
) {
  return roads.map(({ feature, line, height }) => new GeometryInstance({
    id: pickable ? { kind: "road-bridge", featureId: feature.id, properties: feature.properties } : undefined,
    geometry: new PolylineGeometry({
      positions: lineToPositions(line, Math.max(0.5, height + heightOffset)),
      width,
    }),
  }));
}

export type CesiumRoadPrimitives = {
  ground: GroundPolylinePrimitive[];
  elevated: Primitive[];
};

export function createCesiumRoadsLayer(
  data: RuntimeGeoJson,
  options: { showGround?: boolean } = {},
): CesiumRoadPrimitives {
  const grouped = new Map<RoadClass, PreparedRoad[]>();
  const bridges = new Map<RoadClass, PreparedRoad[]>();

  for (const feature of data.features) {
    if (isTunnel(feature)) continue;
    const kind = roadClass(feature);
    const bridge = isBridge(feature);
    const target = bridge ? bridges : grouped;
    const height = bridge ? bridgeHeight(feature) : MASTERPLAN_LAYOUT.roadGroundOffsetM;
    for (const line of featureLines(feature)) {
      if (line.length < 2) continue;
      const roads = target.get(kind) ?? [];
      roads.push({ feature, line, height });
      target.set(kind, roads);
    }
  }

  const ground: GroundPolylinePrimitive[] = [];
  const elevated: Primitive[] = [];
  for (const [kind, roads] of options.showGround === false ? [] : grouped) {
    const style = ROAD_STYLE[kind];
    ground.push(
      new GroundPolylinePrimitive({
        geometryInstances: groundInstances(
          roads,
          style.width + MASTERPLAN_VISUALS.roads.casingExtraWidthPx,
          false,
        ),
        appearance: new PolylineMaterialAppearance({ material: material(MASTERPLAN_THEME.roadCasing) }),
        asynchronous: true,
        allowPicking: false,
      }),
      new GroundPolylinePrimitive({
        geometryInstances: groundInstances(roads, style.width, true),
        appearance: new PolylineMaterialAppearance({ material: material(style.color) }),
        asynchronous: true,
        allowPicking: true,
      }),
    );
    if (kind === "motorway" || kind === "trunk") {
      ground.push(new GroundPolylinePrimitive({
        geometryInstances: groundInstances(roads, MASTERPLAN_VISUALS.roads.centerLineWidthPx, false),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.PolylineDashType, {
            color: Color.fromCssColorString(MASTERPLAN_THEME.roadCenterLine),
            gapColor: Color.TRANSPARENT,
            dashLength: 18,
          }),
        }),
        asynchronous: true,
        allowPicking: false,
      }));
    }
  }

  for (const [kind, roads] of bridges) {
    const style = ROAD_STYLE[kind];
    elevated.push(
      new Primitive({
        geometryInstances: elevatedInstances(
          roads,
          style.width + MASTERPLAN_VISUALS.roads.bridgeShadowExtraWidthPx,
          -MASTERPLAN_VISUALS.roads.bridgeShadowDropM,
          false,
        ),
        appearance: new PolylineMaterialAppearance({ material: material(MASTERPLAN_THEME.roadBridgeShadow, 0.24) }),
        asynchronous: true,
        allowPicking: false,
      }),
      new Primitive({
        geometryInstances: elevatedInstances(
          roads,
          style.width + MASTERPLAN_VISUALS.roads.bridgeCasingExtraWidthPx,
          -0.08,
          false,
        ),
        appearance: new PolylineMaterialAppearance({ material: material(MASTERPLAN_THEME.roadBridgeCasing) }),
        asynchronous: true,
        allowPicking: false,
      }),
      new Primitive({
        geometryInstances: elevatedInstances(roads, style.width, 0, true),
        appearance: new PolylineMaterialAppearance({ material: material(MASTERPLAN_THEME.roadBridge) }),
        asynchronous: true,
        allowPicking: true,
      }),
      new Primitive({
        geometryInstances: elevatedInstances(
          roads,
          MASTERPLAN_VISUALS.roads.centerLineWidthPx,
          0.12,
          false,
        ),
        appearance: new PolylineMaterialAppearance({ material: material(MASTERPLAN_THEME.roadCenterLine) }),
        asynchronous: true,
        allowPicking: false,
      }),
    );
  }

  return { ground, elevated };
}
