import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Viewer,
} from "cesium";
import type { EmirateView } from "@/lib/dubai";
import type { MapCameraState } from "../mapTypes";

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

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

function destinationFromState(viewer: Viewer, camera: MapCameraState) {
  const height =
    camera.height ?? zoomToCameraHeight(camera.zoom, camera.lat, viewer.canvas.clientHeight || 800);
  return Cartesian3.fromDegrees(camera.lng, camera.lat, height);
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
  const listener = () => {
    const now = performance.now();
    if (now - lastUpdate < 120) return;
    lastUpdate = now;
    onChange(readCesiumCamera(viewer));
  };
  viewer.camera.percentageChanged = 0.01;
  viewer.camera.changed.addEventListener(listener);
  return () => viewer.camera.changed.removeEventListener(listener);
}
