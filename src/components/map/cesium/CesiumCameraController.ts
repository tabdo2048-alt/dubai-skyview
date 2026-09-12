import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Viewer,
} from "cesium";
import {
  DUBAI_CENTER,
  MAP_MAX_BOUNDS,
  ZOOM_OUT_BOUNDS,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM_OFFSET,
  MAP_PAN_CLAMP_EPSILON,
  type EmirateView,
} from "@/lib/dubai";
import type { MapCameraState } from "../mapTypes";

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const MAPBOX_WORLD_SIZE_Z0 = 512;

type GeographicBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type GeographicView = GeographicBounds;

function mercatorY(latitude: number) {
  const clamped = Math.max(-85.051129, Math.min(85.051129, latitude));
  const radians = CesiumMath.toRadians(clamped);
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

/** Equivalent to Mapbox cameraForBounds(..., { padding: 0 }) at bearing/pitch zero. */
export function boundsFitZoom(
  bounds: GeographicBounds,
  viewportWidth: number,
  viewportHeight: number,
) {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const longitudeSpan = Math.max(1e-9, (bounds.east - bounds.west) / 360);
  const latitudeSpan = Math.max(
    1e-9,
    Math.abs(mercatorY(bounds.north) - mercatorY(bounds.south)),
  );
  return Math.min(
    Math.log2(width / (MAPBOX_WORLD_SIZE_Z0 * longitudeSpan)),
    Math.log2(height / (MAPBOX_WORLD_SIZE_Z0 * latitudeSpan)),
  );
}

export function zoomToCameraHeight(zoom: number, latitude: number, viewportHeight: number) {
  const visibleMeters =
    (EARTH_CIRCUMFERENCE_M * Math.max(0.2, Math.cos(CesiumMath.toRadians(latitude)))) /
    2 ** zoom;
  const viewportFactor = Math.max(0.65, Math.min(1.8, viewportHeight / 800));
  return Math.max(80, (visibleMeters * viewportFactor) / Math.tan(CesiumMath.toRadians(30)));
}

export function cameraHeightToZoom(height: number, latitude: number, viewportHeight: number) {
  const viewportFactor = Math.max(0.65, Math.min(1.8, viewportHeight / 800));
  const visibleMeters = Math.max(1, (height * Math.tan(CesiumMath.toRadians(30))) / viewportFactor);
  return Math.log2(
    (EARTH_CIRCUMFERENCE_M * Math.max(0.2, Math.cos(CesiumMath.toRadians(latitude)))) /
      visibleMeters,
  );
}

function zoomRules(viewer: Viewer) {
  const width = viewer.canvas.clientWidth || 1200;
  const height = viewer.canvas.clientHeight || 800;
  const tightFitZoom = boundsFitZoom(MAP_MAX_BOUNDS, width, height);
  const minZoom = boundsFitZoom(ZOOM_OUT_BOUNDS, width, height) + MAP_MIN_ZOOM_OFFSET;
  return {
    tightFitZoom,
    minZoom,
    minHeight: zoomToCameraHeight(MAP_MAX_ZOOM, DUBAI_CENTER.lat, height),
    maxHeight: zoomToCameraHeight(minZoom, DUBAI_CENTER.lat, height),
  };
}

function boundsForZoom(zoom: number, tightFitZoom: number): GeographicBounds {
  return zoom >= tightFitZoom + MAP_PAN_CLAMP_EPSILON ? MAP_MAX_BOUNDS : ZOOM_OUT_BOUNDS;
}

function clampPoint(longitude: number, latitude: number, bounds: GeographicBounds) {
  return {
    longitude: Math.max(bounds.west, Math.min(bounds.east, longitude)),
    latitude: Math.max(bounds.south, Math.min(bounds.north, latitude)),
  };
}

/** Match Mapbox's viewport-edge clamp rather than clamping only the camera position. */
export function viewBoundsNudge(view: GeographicView, bounds: GeographicBounds) {
  let longitude = 0;
  let latitude = 0;
  if (view.east - view.west < bounds.east - bounds.west) {
    if (view.west < bounds.west) longitude = bounds.west - view.west;
    else if (view.east > bounds.east) longitude = bounds.east - view.east;
  }
  if (view.north - view.south < bounds.north - bounds.south) {
    if (view.south < bounds.south) latitude = bounds.south - view.south;
    else if (view.north > bounds.north) latitude = bounds.north - view.north;
  }
  return { longitude, latitude };
}

function destinationFromState(viewer: Viewer, camera: MapCameraState) {
  const rules = zoomRules(viewer);
  const height =
    camera.height ?? zoomToCameraHeight(camera.zoom, camera.lat, viewer.canvas.clientHeight || 800);
  const bounds = boundsForZoom(camera.zoom, rules.tightFitZoom);
  const position = clampPoint(camera.lng, camera.lat, bounds);
  return Cartesian3.fromDegrees(
    position.longitude,
    position.latitude,
    Math.max(rules.minHeight, Math.min(height, rules.maxHeight)),
  );
}

export function setInitialCesiumCamera(viewer: Viewer, camera: MapCameraState) {
  viewer.camera.setView({
    destination: destinationFromState(viewer, camera),
    orientation: {
      heading: CesiumMath.toRadians(camera.heading ?? 0),
      pitch: CesiumMath.toRadians(camera.pitch ?? -45),
      roll: 0,
    },
  });
}

export function flyToEmirate(viewer: Viewer, target: EmirateView) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      target.center.lng,
      target.center.lat,
      zoomToCameraHeight(target.zoom, target.center.lat, viewer.canvas.clientHeight || 800),
    ),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-45),
      roll: 0,
    },
    duration: 1.35,
  });
}

export function flyToProject(viewer: Viewer, longitude: number, latitude: number, radiusM = 350) {
  viewer.camera.flyToBoundingSphere(
    new BoundingSphere(Cartesian3.fromDegrees(longitude, latitude, Math.max(10, radiusM / 3)), radiusM),
    { duration: 1.15 },
  );
}

export function readCesiumCamera(viewer: Viewer): MapCameraState {
  const center = viewer.camera.pickEllipsoid(
    new Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2),
    viewer.scene.globe.ellipsoid,
  );
  const position = Cartographic.fromCartesian(center ?? viewer.camera.positionWC);
  const cameraPosition = viewer.camera.positionCartographic;
  const lat = CesiumMath.toDegrees(position.latitude);
  const lng = CesiumMath.toDegrees(position.longitude);
  const height = Math.max(1, cameraPosition.height);
  return {
    lat,
    lng,
    height,
    zoom: cameraHeightToZoom(height, lat, viewer.canvas.clientHeight || 800),
    heading: CesiumMath.toDegrees(viewer.camera.heading),
    pitch: CesiumMath.toDegrees(viewer.camera.pitch),
  };
}

export function connectCesiumCamera(
  viewer: Viewer,
  onChange: (camera: MapCameraState) => void,
) {
  let lastUpdate = 0;
  const controller = viewer.scene.screenSpaceCameraController;
  const applyZoomLimits = () => {
    const rules = zoomRules(viewer);
    controller.minimumZoomDistance = rules.minHeight;
    controller.maximumZoomDistance = rules.maxHeight;
    return rules;
  };
  const listener = () => {
    const now = performance.now();
    if (now - lastUpdate < 120) return;
    lastUpdate = now;
    onChange(readCesiumCamera(viewer));
  };
  const constrain = () => {
    const rules = applyZoomLimits();
    const camera = viewer.camera;
    const state = readCesiumCamera(viewer);
    const bounds = boundsForZoom(state.zoom, rules.tightFitZoom);
    const rectangle = camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    let nudge = { longitude: 0, latitude: 0 };
    if (rectangle && rectangle.east >= rectangle.west) {
      nudge = viewBoundsNudge(
        {
          west: CesiumMath.toDegrees(rectangle.west),
          south: CesiumMath.toDegrees(rectangle.south),
          east: CesiumMath.toDegrees(rectangle.east),
          north: CesiumMath.toDegrees(rectangle.north),
        },
        bounds,
      );
    } else {
      const bounded = clampPoint(state.lng, state.lat, bounds);
      nudge = {
        longitude: bounded.longitude - state.lng,
        latitude: bounded.latitude - state.lat,
      };
    }
    const position = camera.positionCartographic;
    const height = Math.max(rules.minHeight, Math.min(position.height, rules.maxHeight));
    if (
      Math.abs(nudge.longitude) < 0.00001 &&
      Math.abs(nudge.latitude) < 0.00001 &&
      Math.abs(height - position.height) < 0.5
    ) {
      return;
    }
    camera.setView({
      destination: Cartesian3.fromRadians(
        position.longitude + CesiumMath.toRadians(nudge.longitude),
        position.latitude + CesiumMath.toRadians(nudge.latitude),
        height,
      ),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
    });
    onChange(readCesiumCamera(viewer));
  };
  applyZoomLimits();
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => applyZoomLimits());
  resizeObserver?.observe(viewer.canvas);
  viewer.camera.moveEnd.addEventListener(constrain);
  viewer.camera.percentageChanged = 0.01;
  viewer.camera.changed.addEventListener(listener);
  return () => {
    resizeObserver?.disconnect();
    viewer.camera.changed.removeEventListener(listener);
    viewer.camera.moveEnd.removeEventListener(constrain);
  };
}
