import { useEffect, useRef, useState } from "react";
import type { ImageryLayer, Primitive, Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./credits.css";
import { useFiltersStore } from "@/store/filters";
import {
  connectCesiumCamera,
  flyToEmirate,
  flyToProject,
  setInitialCesiumCamera,
} from "./CesiumCameraController";
import { connectProjectInteraction } from "./CesiumProjectInteraction";
import { CesiumProjectBoundaries } from "./CesiumProjectBoundaries";
import { CesiumProjectLayer } from "./CesiumProjectLayer";
import { CesiumRuntimeGeodata } from "./CesiumRuntimeGeodata";
import { CesiumPoiLayer } from "./CesiumPoiLayer";
import { CesiumRailLayer } from "./CesiumRailLayer";
import { CesiumZonesLayer } from "./CesiumZonesLayer";
import { createCesiumDubaiCoastlineLayer, connectCesiumWaterAnimation } from "./CesiumWaterLayer";
import { CesiumPhotorealisticCity, type CityState } from "./CesiumPhotorealisticCity";
import { readPhotorealisticConfig } from "./photorealisticConfig";
import { MASTERPLAN_THEME } from "./theme";
import { applyCesiumLightPreset, createCesiumScene } from "./CesiumSceneController";
import type { CesiumViewProps, ProjectPick } from "./types";

type Runtime = {
  viewer: Viewer;
  projects: CesiumProjectLayer;
  boundaries: CesiumProjectBoundaries;
  geodata: CesiumRuntimeGeodata;
  pois: CesiumPoiLayer;
  rail: CesiumRailLayer;
  zones: CesiumZonesLayer;
  coastline: Primitive | null;
  imagery: ImageryLayer | null;
};

export function CesiumView(props: CesiumViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const [cityState, setCityState] = useState<CityState>("loading");
  const [sceneError, setSceneError] = useState<string | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [geodataMessage, setGeodataMessage] = useState<string | null>(null);
  const [imageryMessage, setImageryMessage] = useState<string | null>(null);
  const [featurePick, setFeaturePick] = useState<ProjectPick | null>(null);
  const selectedProjectId = useFiltersStore((state) => state.selectedProjectId);
  const hoveredProjectId = useFiltersStore((state) => state.hoveredProjectId);
  const pinnedPlotIds = useFiltersStore((state) => state.pinnedPlotIds);
  const setSelectedProjectId = useFiltersStore((state) => state.setSelectedProjectId);
  const setHoveredProjectId = useFiltersStore((state) => state.setHoveredProjectId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let viewer: Viewer;
    try {
      viewer = createCesiumScene(
        container,
        propsRef.current.ionToken,
        creditRef.current ?? undefined,
      );
    } catch {
      setSceneError(
        "3D graphics could not start on this device. Switch to Satellite, or enable hardware acceleration and reload.",
      );
      propsRef.current.onReady?.();
      return;
    }
    setInitialCesiumCamera(viewer, propsRef.current.camera);
    applyCesiumLightPreset(viewer, propsRef.current.lightPreset);

    let fallbackStarted = false;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleBuildings = () => {
      if (!fallbackStarted) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (!viewer.isDestroyed()) void runtimeRef.current?.geodata.reloadBuildings();
      }, 150);
    };
    const projectLayer = new CesiumProjectLayer(viewer, {
      activate: (project) => {
        const allowed = city?.activate(project) ?? false;
        if (allowed) scheduleBuildings();
        return allowed;
      },
      deactivate: (projectId) => {
        city?.deactivate(projectId);
        scheduleBuildings();
      },
      onError: setGeodataMessage,
    });
    const boundaries = new CesiumProjectBoundaries(viewer);
    const pois = new CesiumPoiLayer(viewer);
    const rail = new CesiumRailLayer(viewer);
    const zones = new CesiumZonesLayer(viewer);
    let geodata = new CesiumRuntimeGeodata(
      viewer,
      () => propsRef.current.projects,
      setGeodataMessage,
    );
    const runtime: Runtime = {
      viewer,
      projects: projectLayer,
      boundaries,
      geodata,
      pois,
      rail,
      zones,
      coastline: null,
      imagery: null,
    };
    runtimeRef.current = runtime;
    let cancelled = false;
    let disconnectWaterAnimation = () => {};

    const startWater = () => {
      disconnectWaterAnimation = connectCesiumWaterAnimation(viewer);
      void createCesiumDubaiCoastlineLayer()
        .then((coastline) => {
          if (!coastline) return;
          if (cancelled || viewer.isDestroyed()) {
            coastline.destroy();
            return;
          }
          runtime.coastline = viewer.scene.primitives.add(coastline);
          viewer.scene.requestRender();
        })
        .catch((error) => console.warn("[Cesium] Dubai coastline failed to load", error));
    };

    const startGeodata = (satelliteReady: boolean) => {
      if (cancelled || viewer.isDestroyed()) return;
      geodata = new CesiumRuntimeGeodata(
        viewer,
        () => projectLayer.getVisibleProjects(),
        setGeodataMessage,
        "/geodata/dubai-pilot/manifest.json",
        satelliteReady ? "satellite-hybrid" : "masterplan",
      );
      runtime.geodata = geodata;
      startWater();
      void geodata.start();
    };

    const startFallback = () => {
      if (fallbackStarted || cancelled) return;
      fallbackStarted = true;
      startGeodata(false);
    };
    const city: CesiumPhotorealisticCity = new CesiumPhotorealisticCity(
      viewer,
      readPhotorealisticConfig(import.meta.env, propsRef.current.ionToken),
      (state, message) => {
        if (cancelled) return;
        setCityState(state);
        setImageryMessage(message);
        if (state === "masterplan") startFallback();
        projectLayer.refreshModels();
      },
    );
    void city.start();
    const contextLost = () => {
      setSceneError("3D graphics were interrupted. Switch to Satellite or reload to recover.");
      propsRef.current.onReady?.();
    };
    viewer.canvas.addEventListener("webglcontextlost", contextLost);

    const disconnectCamera = connectCesiumCamera(viewer, (camera) =>
      propsRef.current.onCameraChange(camera),
    );
    const disconnectInteraction = connectProjectInteraction(
      viewer,
      (picked) => projectLayer.resolvePick(picked),
      (pick) => {
        setHoveredProjectId(pick?.projectId ?? null);
        setFeaturePick((current) =>
          current?.kind === "project-feature" && current.projectId === pick?.projectId
            ? current
            : null,
        );
      },
      (pick) => {
        setSelectedProjectId(pick?.projectId ?? null);
        setFeaturePick(pick?.kind === "project-feature" ? pick : null);
        if (pick) {
          const project = propsRef.current.projects.find((item) => item.id === pick.projectId);
          if (project) flyToProject(viewer, project.lng, project.lat);
        }
      },
    );

    const ready = () => {
      propsRef.current.onReady?.();
      viewer.scene.postRender.removeEventListener(ready);
    };
    viewer.scene.postRender.addEventListener(ready);

    return () => {
      cancelled = true;
      fallbackStarted = false;
      clearTimeout(reloadTimer);
      disconnectWaterAnimation();
      viewer.canvas.removeEventListener("webglcontextlost", contextLost);
      disconnectInteraction();
      disconnectCamera();
      viewer.scene.postRender.removeEventListener(ready);
      geodata.destroy();
      if (runtime.coastline) viewer.scene.primitives.remove(runtime.coastline);
      if (runtime.imagery) viewer.imageryLayers.remove(runtime.imagery, true);
      zones.destroy();
      rail.destroy();
      pois.destroy();
      boundaries.destroy();
      projectLayer.destroy();
      city.destroy();
      runtimeRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, [setHoveredProjectId, setSelectedProjectId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.projects.setProjects(props.browsingPois ? [] : props.projects);
    void runtime.geodata.reloadBuildings();
  }, [props.browsingPois, props.projects]);

  useEffect(() => {
    runtimeRef.current?.pois.update(props.pois ?? []);
  }, [props.pois]);

  useEffect(() => {
    runtimeRef.current?.rail.update(
      props.metroMode && !props.browsingPois,
      props.trainMode && !props.browsingPois,
    );
  }, [props.browsingPois, props.metroMode, props.trainMode]);

  useEffect(() => {
    runtimeRef.current?.zones.update(
      props.zones ?? [],
      props.browsingPois ? new Set() : (props.zoneCategories ?? new Set()),
    );
  }, [props.browsingPois, props.zoneCategories, props.zones]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.projects.updateSelection(selectedProjectId, hoveredProjectId);
    const active = new Set(pinnedPlotIds);
    if (selectedProjectId) active.add(selectedProjectId);
    if (hoveredProjectId) active.add(hoveredProjectId);
    runtime.boundaries.update(props.projects, active);
  }, [hoveredProjectId, pinnedPlotIds, props.projects, selectedProjectId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime) applyCesiumLightPreset(runtime.viewer, props.lightPreset);
  }, [props.lightPreset]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && props.flyToTarget) flyToEmirate(runtime.viewer, props.flyToTarget);
  }, [props.flyToTarget]);

  return (
    <div
      className="relative flex h-full w-full flex-col"
      style={{ backgroundColor: MASTERPLAN_THEME.land }}
    >
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1"
        aria-label="Interactive 3D Dubai map"
      />
      <div className="relative z-[60] shrink-0 bg-slate-950 px-2 py-1 text-xs text-white">
        <div ref={creditRef} className="keyora-cesium-credits" aria-label="Map data attribution" />
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] hover:underline"
        >
          © OpenStreetMap contributors (overlays{cityState === "masterplan" ? " and fallback" : ""})
        </a>
      </div>
      {sceneError && (
        <div
          role="alert"
          className="absolute inset-x-4 top-24 z-20 rounded-lg bg-slate-950/90 p-4 text-sm text-amber-100"
        >
          {sceneError}
        </div>
      )}

      {imageryMessage && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xs rounded-lg border border-amber-300/30 bg-slate-950/75 px-3 py-2 text-[11px] leading-snug text-amber-100 backdrop-blur">
          {imageryMessage}
        </div>
      )}

      {geodataMessage && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-950/80 px-3 py-2 text-[11px] text-amber-100 backdrop-blur">
          {geodataMessage}
        </div>
      )}

      {featurePick?.featureName && (
        <div className="pointer-events-none absolute bottom-16 right-4 z-10 rounded-xl border border-[#c9a84c]/40 bg-[#102729]/90 px-4 py-3 text-sm text-[#f5f0e4] shadow-xl backdrop-blur">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">
            3D feature
          </span>
          {featurePick.featureName}
        </div>
      )}
    </div>
  );
}

export default CesiumView;
