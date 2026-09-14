import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { TourHotspotRow, TourSceneRow } from "./types";
import {
  createPannellumViewer,
  destroyPannellumViewer,
  setPannellumHotspots,
  type PannellumHotspot,
  type PannellumViewer,
} from "./viewer/pannellumAdapter";

export interface VirtualTourViewerHandle {
  toggleFullscreen(): void;
}

interface VirtualTourViewerProps {
  scene: TourSceneRow;
  panoramaUrl: string;
  hotspots: TourHotspotRow[];
  retryKey: number;
  onLoadingChange: (loading: boolean) => void;
  onError: (message: string) => void;
  onHotspotActivate: (hotspot: TourHotspotRow) => void;
}

function hotspotAriaLabel(hotspot: TourHotspotRow): string {
  const name = hotspot.label ?? "hotspot";
  if (hotspot.type === "navigation") return "انتقل إلى " + name;
  if (hotspot.type === "external_link") return "افتح رابط " + name;
  return "عرض معلومات " + name;
}

function renderHotspots(
  viewer: PannellumViewer,
  rows: TourHotspotRow[],
  onActivate: (hotspot: TourHotspotRow) => void,
): void {
  const pannellumHotspots: PannellumHotspot[] = rows.map((hotspot) => ({
    id: hotspot.id,
    pitch: hotspot.pitch,
    yaw: hotspot.yaw,
    type: hotspot.type,
    label: hotspot.label ?? "Explore",
    ariaLabel: hotspotAriaLabel(hotspot),
    onActivate: () => onActivate(hotspot),
  }));
  setPannellumHotspots(viewer, pannellumHotspots);
}

export const VirtualTourViewer = forwardRef<VirtualTourViewerHandle, VirtualTourViewerProps>(
  function VirtualTourViewer(
    {
      scene,
      panoramaUrl,
      hotspots,
      retryKey,
      onLoadingChange,
      onError,
      onHotspotActivate,
    },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<PannellumViewer | null>(null);
    const hotspotsRef = useRef(hotspots);
    const onHotspotActivateRef = useRef(onHotspotActivate);

    hotspotsRef.current = hotspots;
    onHotspotActivateRef.current = onHotspotActivate;

    useImperativeHandle(
      forwardedRef,
      () => ({
        toggleFullscreen() {
          viewerRef.current?.toggleFullscreen();
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container || typeof window === "undefined") return;
      let active = true;
      let createdViewer: PannellumViewer | null = null;
      onLoadingChange(true);

      void createPannellumViewer(container, {
        panoramaUrl,
        yaw: scene.initial_yaw,
        pitch: scene.initial_pitch,
        hfov: scene.initial_hfov,
        onLoad: () => {
          if (active) onLoadingChange(false);
        },
        onError: (message) => {
          if (!active) return;
          onLoadingChange(false);
          onError(message || "تعذر تحميل المشهد");
        },
      })
        .then((viewer) => {
          if (!active) {
            destroyPannellumViewer(viewer);
            return;
          }
          createdViewer = viewer;
          viewerRef.current = viewer;
          renderHotspots(
            viewer,
            hotspotsRef.current,
            (hotspot) => onHotspotActivateRef.current(hotspot),
          );
        })
        .catch((error: unknown) => {
          if (!active) return;
          onLoadingChange(false);
          onError(error instanceof Error ? error.message : "تعذر تشغيل عارض 360°");
        });

      return () => {
        active = false;
        if (viewerRef.current === createdViewer) viewerRef.current = null;
        destroyPannellumViewer(createdViewer);
        container.replaceChildren();
      };
    }, [
      onError,
      onLoadingChange,
      panoramaUrl,
      retryKey,
      scene.id,
      scene.initial_hfov,
      scene.initial_pitch,
      scene.initial_yaw,
    ]);

    useEffect(() => {
      if (!viewerRef.current) return;
      renderHotspots(
        viewerRef.current,
        hotspots,
        (hotspot) => onHotspotActivateRef.current(hotspot),
      );
    }, [hotspots]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full bg-[#080a0d]"
        role="application"
        aria-label={"360 degree panorama: " + scene.name}
      />
    );
  },
);
