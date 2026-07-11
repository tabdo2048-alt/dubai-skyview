import type mapboxgl from "mapbox-gl";
import { LAND_EXCLUSION_POLYGONS, NAVIGATION_WATER_POLYGONS } from "@/lib/navigationWater";
import { MARINE_ROUTES } from "@/lib/marineRoutes";
import { SHORELINE_PATHS } from "@/lib/shorelines";
import type { ModelConfig } from "./modelTypes";
import {
  collectInvalidRouteSamples,
  getVesselSafetyClearance,
  isWatercraft,
  waterRouteForDisplay,
} from "./waterRouteGuards";

type DebugFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] };
};

type DebugCollection = {
  type: "FeatureCollection";
  features: DebugFeature[];
};

const DEBUG_LAYER_PREFIX = "navigation-debug";

function collection(features: DebugFeature[]): DebugCollection {
  return { type: "FeatureCollection", features };
}

function lineFeature(
  id: string,
  coordinates: [number, number][],
  properties: DebugFeature["properties"] = {},
): DebugFeature {
  return {
    type: "Feature",
    properties: { id, ...properties },
    geometry: { type: "LineString", coordinates },
  };
}

function polygonFeature(
  id: string,
  coordinates: [number, number][],
  properties: DebugFeature["properties"] = {},
): DebugFeature {
  return {
    type: "Feature",
    properties: { id, ...properties },
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

function pointFeature(
  id: string,
  coordinates: [number, number],
  properties: DebugFeature["properties"] = {},
): DebugFeature {
  return {
    type: "Feature",
    properties: { id, ...properties },
    geometry: { type: "Point", coordinates },
  };
}

export function shouldShowNavigationDebugOverlay() {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_NAVIGATION_DEBUG_OVERLAY === "true") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("dubai:navigation-debug") === "1";
}

export function addSatelliteNavigationDebugOverlay(map: mapboxgl.Map, models: ModelConfig[]) {
  if (map.getSource(`${DEBUG_LAYER_PREFIX}-routes`)) return;

  const coastline = SHORELINE_PATHS.map((shoreline) =>
    lineFeature(shoreline.id, shoreline.points, {
      name: shoreline.name,
      type: "satellite-coastline",
    }),
  );
  const navigationPolygons = NAVIGATION_WATER_POLYGONS.map((area) =>
    polygonFeature(area.id, area.polygon, { name: area.name, type: "navigation-water" }),
  );
  const landMasks = LAND_EXCLUSION_POLYGONS.map((area) =>
    polygonFeature(area.id, area.polygon, { name: area.name, type: "land-exclusion" }),
  );
  const laneCenterlines = MARINE_ROUTES.map((route, index) =>
    lineFeature(route.id, route.points, {
      name: route.name,
      type: "satellite-traced-lane",
      category: route.category,
      laneIndex: index + 1,
    }),
  );

  const routeCenterlines: DebugFeature[] = [];
  const invalidSamples: DebugFeature[] = [];

  for (const model of models) {
    if (!isWatercraft(model.type)) continue;
    const clearance = getVesselSafetyClearance(model);
    const route = waterRouteForDisplay(model);
    if (route) {
      routeCenterlines.push(
        lineFeature(model.id, route, {
          name: model.name,
          type: "validated-vessel-route",
          clearanceMeters: Math.round(clearance),
        }),
      );
    }

    const rawInvalid = collectInvalidRouteSamples(model.route, clearance);
    const displayInvalid = collectInvalidRouteSamples(route, clearance);
    for (const [sampleIndex, sample] of [...rawInvalid, ...displayInvalid].entries()) {
      invalidSamples.push(
        pointFeature(`${model.id}-invalid-${sampleIndex}`, sample.point, {
          modelId: model.id,
          segmentIndex: sample.segmentIndex,
          reason: sample.reason,
          clearanceMeters: Math.round(sample.clearanceMeters),
          nearestLandMeters: Math.round(sample.nearestLandMeters),
        }),
      );
    }
  }

  const sources: Record<string, DebugCollection> = {
    [`${DEBUG_LAYER_PREFIX}-coastline`]: collection(coastline),
    [`${DEBUG_LAYER_PREFIX}-water-polygons`]: collection(navigationPolygons),
    [`${DEBUG_LAYER_PREFIX}-land-masks`]: collection(landMasks),
    [`${DEBUG_LAYER_PREFIX}-lanes`]: collection(laneCenterlines),
    [`${DEBUG_LAYER_PREFIX}-routes`]: collection(routeCenterlines),
    [`${DEBUG_LAYER_PREFIX}-invalid-samples`]: collection(invalidSamples),
  };

  for (const [sourceId, data] of Object.entries(sources)) {
    map.addSource(sourceId, { type: "geojson", data });
  }

  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-water-fill`,
    type: "fill",
    source: `${DEBUG_LAYER_PREFIX}-water-polygons`,
    paint: {
      "fill-color": "rgba(33, 150, 243, 0.18)",
      "fill-outline-color": "rgba(33, 150, 243, 0.75)",
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-water-outline`,
    type: "line",
    source: `${DEBUG_LAYER_PREFIX}-water-polygons`,
    paint: {
      "line-color": "rgba(33, 150, 243, 0.9)",
      "line-width": 2,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-land-clearance-buffer`,
    type: "line",
    source: `${DEBUG_LAYER_PREFIX}-land-masks`,
    paint: {
      "line-color": "rgba(255, 193, 7, 0.35)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 18, 14, 34, 17, 58],
      "line-blur": 4,
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-land-outline`,
    type: "line",
    source: `${DEBUG_LAYER_PREFIX}-land-masks`,
    paint: {
      "line-color": "rgba(255, 193, 7, 0.95)",
      "line-width": 2,
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-satellite-coastline`,
    type: "line",
    source: `${DEBUG_LAYER_PREFIX}-coastline`,
    paint: {
      "line-color": "rgba(255, 255, 255, 0.9)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 16, 3.5],
      "line-blur": 0.5,
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-lane-centerlines`,
    type: "line",
    source: `${DEBUG_LAYER_PREFIX}-lanes`,
    paint: {
      "line-color": "rgba(0, 255, 255, 0.7)",
      "line-width": 2,
      "line-dasharray": [1.5, 1.5],
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-route-centerlines`,
    type: "line",
    source: `${DEBUG_LAYER_PREFIX}-routes`,
    paint: {
      "line-color": "rgba(20, 255, 120, 0.9)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 4],
      "line-blur": 0.4,
    },
  });
  map.addLayer({
    id: `${DEBUG_LAYER_PREFIX}-invalid-route-samples`,
    type: "circle",
    source: `${DEBUG_LAYER_PREFIX}-invalid-samples`,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 9],
      "circle-color": "#ff1f1f",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.95,
    },
  });

  console.log("[BoatRouteDebug] satellite navigation overlay enabled", {
    coastlinePaths: coastline.length,
    navigationPolygons: navigationPolygons.length,
    lanes: laneCenterlines.length,
    routes: routeCenterlines.length,
    invalidSamples: invalidSamples.length,
  });
}
