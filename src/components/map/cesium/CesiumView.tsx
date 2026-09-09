import { useEffect, useRef, useState } from "react";
import type { GroundPrimitive, Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
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
import { createCesiumDubaiCoastlineLayer } from "./CesiumWaterLayer";
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
  coastline: GroundPrimitive | null;
};

export function CesiumView(props: CesiumViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [geodataMessage, setGeodataMessage] = useState<string | null>(null);
  const [featurePick, setFeaturePick] = useState<ProjectPick | null>(null);
  const selectedProjectId = useFiltersStore((state) => state.selectedProjectId);
  const hoveredProjectId = useFiltersStore((state) => state.hoveredProjectId);
  const pinnedPlotIds = useFiltersStore((state) => state.pinnedPlotIds);
  const setSelectedProjectId = useFiltersStore((state) => state.setSelectedProjectId);
  const setHoveredProjectId = useFiltersStore((state) => state.setHoveredProjectId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = createCesiumScene(container, propsRef.current.ionToken);
    setInitialCesiumCamera(viewer, propsRef.current.camera);
    applyCesiumLightPreset(viewer, propsRef.current.lightPreset);

    const projectLayer = new CesiumProjectLayer(viewer);
    const boundaries = new CesiumProjectBoundaries(viewer);
    const pois = new CesiumPoiLayer(viewer);
    const rail = new CesiumRailLayer(viewer);
    const zones = new CesiumZonesLayer(viewer);
    const geodata = new CesiumRuntimeGeodata(
      viewer,
      () => propsRef.current.projects,
      setGeodataMessage,
    );
    const runtime: Runtime = { viewer, projects: projectLayer, boundaries, geodata, pois, rail, zones, coastline: null };
    runtimeRef.current = runtime;
    let cancelled = false;
    void createCesiumDubaiCoastlineLayer().then((coastline) => {
      if (!coastline || cancelled || viewer.isDestroyed()) return;
      runtime.coastline = viewer.scene.primitives.add(coastline);
      viewer.scene.requestRender();
    }).catch((error) => console.warn("[Cesium] Dubai coastline failed to load", error));

    const disconnectCamera = connectCesiumCamera(viewer, (camera) =>
      propsRef.current.onCameraChange(camera),
    );
    const disconnectInteraction = connectProjectInteraction(
      viewer,
      (picked) => projectLayer.resolvePick(picked),
      (pick) => {
        setHoveredProjectId(pick?.projectId ?? null);
        setFeaturePick((current) =>
          current?.kind === "project-feature" && current.projectId === pick?.projectId ? current : null,
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
    void geodata.start();

    return () => {
      cancelled = true;
      disconnectInteraction();
      disconnectCamera();
      viewer.scene.postRender.removeEventListener(ready);
      geodata.destroy();
      if (runtime.coastline) viewer.scene.primitives.remove(runtime.coastline);
      zones.destroy();
      rail.destroy();
      pois.destroy();
      boundaries.destroy();
      projectLayer.destroy();
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
    runtimeRef.current?.rail.update(props.metroMode && !props.browsingPois, props.trainMode && !props.browsingPois);
  }, [props.browsingPois, props.metroMode, props.trainMode]);

  useEffect(() => {
    runtimeRef.current?.zones.update(props.zones ?? [], props.browsingPois ? new Set() : (props.zoneCategories ?? new Set()));
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
    runtimeRef.current?.geodata.setRoadsVisible(props.roadsMode && !props.browsingPois);
  }, [props.browsingPois, props.roadsMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime) applyCesiumLightPreset(runtime.viewer, props.lightPreset);
  }, [props.lightPreset]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && props.flyToTarget) flyToEmirate(runtime.viewer, props.flyToTarget);
  }, [props.flyToTarget]);

  return (
    <div className="relative h-full w-full bg-[#d8cbb3]">
      <div ref={containerRef} className="absolute inset-0" aria-label="Interactive 3D Dubai map" />

      {!props.ionToken && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xs rounded-lg border border-amber-300/30 bg-slate-950/75 px-3 py-2 text-[11px] leading-snug text-amber-100 backdrop-blur">
          Local masterplan data is active. Set VITE_CESIUM_ION_TOKEN only for scoped ion-hosted assets.
        </div>
      )}

      {geodataMessage && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-950/80 px-3 py-2 text-[11px] text-amber-100 backdrop-blur">
          {geodataMessage}
        </div>
      )}

      {featurePick?.featureName && (
        <div className="pointer-events-none absolute bottom-16 right-4 z-10 rounded-xl border border-[#c9a84c]/40 bg-[#102729]/90 px-4 py-3 text-sm text-[#f5f0e4] shadow-xl backdrop-blur">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">3D feature</span>
          {featurePick.featureName}
        </div>
      )}

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1 right-2 z-10 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-700 hover:underline"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}

export default CesiumView;
