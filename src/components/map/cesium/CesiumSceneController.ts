import {
  Color,
  EllipsoidTerrainProvider,
  Ion,
  JulianDate,
  Viewer,
} from "cesium";
import type { LightPreset } from "../mapTypes";
import { MASTERPLAN_THEME } from "./theme";

const LIGHT_TIMES: Record<LightPreset, string> = {
  dawn: "2026-01-15T02:30:00Z",
  day: "2026-01-15T08:00:00Z",
  dusk: "2026-01-15T14:10:00Z",
  night: "2026-01-15T20:00:00Z",
};

function isConstrainedDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
}

export function createCesiumScene(container: HTMLElement, ionToken?: string) {
  if (ionToken) Ion.defaultAccessToken = ionToken;

  const constrained = isConstrainedDevice();
  const viewer = new Viewer(container, {
    baseLayer: false,
    terrainProvider: new EllipsoidTerrainProvider(),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    useBrowserRecommendedResolution: true,
    msaaSamples: constrained ? 1 : 4,
  });

  viewer.targetFrameRate = constrained ? 30 : 60;
  viewer.resolutionScale = constrained ? Math.min(window.devicePixelRatio, 1.25) : 1;
  viewer.scene.backgroundColor = Color.fromCssColorString(MASTERPLAN_THEME.sky);
  viewer.scene.globe.baseColor = Color.fromCssColorString(MASTERPLAN_THEME.land);
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.highDynamicRange = !constrained;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.hueShift = -0.03;
    viewer.scene.skyAtmosphere.saturationShift = -0.15;
    viewer.scene.skyAtmosphere.brightnessShift = 0.08;
  }

  return viewer;
}

export function applyCesiumLightPreset(viewer: Viewer, preset: LightPreset) {
  viewer.clock.currentTime = JulianDate.fromIso8601(LIGHT_TIMES[preset]);
  viewer.scene.globe.enableLighting = preset !== "day";
  viewer.scene.requestRender();
}

