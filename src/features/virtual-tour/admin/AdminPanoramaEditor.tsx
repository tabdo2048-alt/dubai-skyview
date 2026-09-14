import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { TourHotspotRow, TourSceneRow } from "../types";
import {
  createPannellumViewer,
  destroyPannellumViewer,
  getPannellumCamera,
  pannellumCoordinatesFromMouseEvent,
  setPannellumHotspots,
  type PannellumCameraState,
  type PannellumHotspot,
  type PannellumViewer,
} from "../viewer/pannellumAdapter";

export interface AdminPanoramaEditorHandle {
  getCamera(): PannellumCameraState | null;
}

interface Placement {
  yaw: number;
  pitch: number;
}

interface AdminPanoramaEditorProps {
  scene: TourSceneRow;
  panoramaUrl: string;
  hotspots: TourHotspotRow[];
  placementMode: boolean;
  pendingPlacement: Placement | null;
  onPlace: (placement: Placement) => void;
  onSelectHotspot: (hotspot: TourHotspotRow) => void;
}

function editorHotspots(
  rows: TourHotspotRow[],
  pendingPlacement: Placement | null,
  onSelect: (hotspot: TourHotspotRow) => void,
): PannellumHotspot[] {
  const result: PannellumHotspot[] = rows.map((hotspot) => ({
    id: hotspot.id,
    pitch: hotspot.pitch,
    yaw: hotspot.yaw,
    type: hotspot.type,
    label: hotspot.label ?? hotspot.type,
    ariaLabel: `تعديل ${hotspot.label ?? hotspot.type}`,
    onActivate: () => onSelect(hotspot),
  }));
  if (pendingPlacement) {
    result.push({
      id: "admin-temporary-hotspot",
      pitch: pendingPlacement.pitch,
      yaw: pendingPlacement.yaw,
      type: "temporary",
      label: "موضع جديد",
      ariaLabel: "موضع Hotspot جديد",
      onActivate: () => undefined,
    });
  }
  return result;
}

export const AdminPanoramaEditor = forwardRef<AdminPanoramaEditorHandle, AdminPanoramaEditorProps>(
  function AdminPanoramaEditor(
    { scene, panoramaUrl, hotspots, placementMode, pendingPlacement, onPlace, onSelectHotspot },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<PannellumViewer | null>(null);
    const hotspotsRef = useRef(hotspots);
    const pendingRef = useRef(pendingPlacement);
    const selectRef = useRef(onSelectHotspot);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    hotspotsRef.current = hotspots;
    pendingRef.current = pendingPlacement;
    selectRef.current = onSelectHotspot;

    useImperativeHandle(
      forwardedRef,
      () => ({
        getCamera: () => (viewerRef.current ? getPannellumCamera(viewerRef.current) : null),
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container || typeof window === "undefined") return;
      let active = true;
      let created: PannellumViewer | null = null;
      setLoading(true);
      setError(null);

      void createPannellumViewer(container, {
        panoramaUrl,
        yaw: scene.initial_yaw,
        pitch: scene.initial_pitch,
        hfov: scene.initial_hfov,
        onLoad: () => active && setLoading(false),
        onError: () => {
          if (!active) return;
          setLoading(false);
          setError("تعذر تحميل Panorama للمعاينة.");
        },
      })
        .then((viewer) => {
          if (!active) return destroyPannellumViewer(viewer);
          created = viewer;
          viewerRef.current = viewer;
          setPannellumHotspots(
            viewer,
            editorHotspots(hotspotsRef.current, pendingRef.current, (hotspot) =>
              selectRef.current(hotspot),
            ),
          );
        })
        .catch(() => {
          if (!active) return;
          setLoading(false);
          setError("تعذر تشغيل عارض 360°.");
        });

      return () => {
        active = false;
        if (viewerRef.current === created) viewerRef.current = null;
        destroyPannellumViewer(created);
        container.replaceChildren();
      };
    }, [panoramaUrl, scene.id, scene.initial_hfov, scene.initial_pitch, scene.initial_yaw]);

    useEffect(() => {
      if (!viewerRef.current) return;
      setPannellumHotspots(
        viewerRef.current,
        editorHotspots(hotspots, pendingPlacement, (hotspot) => selectRef.current(hotspot)),
      );
    }, [hotspots, pendingPlacement]);

    return (
      <div className="relative h-full min-h-[24rem] overflow-hidden rounded-2xl bg-[#080a0d]">
        <div
          ref={containerRef}
          className={`size-full min-h-[24rem] ${placementMode ? "cursor-crosshair" : ""}`}
          role="application"
          aria-label={`محرر Panorama: ${scene.name}`}
          onClickCapture={(event) => {
            if (!placementMode || !viewerRef.current) return;
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest(".tour-hotspot, .pnlm-controls, button, input, select")
            ) {
              return;
            }
            try {
              onPlace(pannellumCoordinatesFromMouseEvent(viewerRef.current, event.nativeEvent));
            } catch {
              setError("تعذر تحديد موضع Hotspot.");
            }
          }}
        />
        {placementMode && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-gold px-4 py-2 text-xs font-semibold text-gold-foreground shadow-xl">
            اضغط داخل Panorama لتحديد المكان
          </div>
        )}
        {loading && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 text-sm text-cream">
            جاري تحميل المعاينة…
          </div>
        )}
        {error && (
          <div
            role="status"
            className="absolute bottom-3 left-3 rounded-xl bg-destructive/90 px-3 py-2 text-xs text-white"
          >
            {error}
          </div>
        )}
      </div>
    );
  },
);
