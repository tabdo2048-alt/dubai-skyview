import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { TourSceneRow } from "./types";
import {
  createPannellumViewer,
  destroyPannellumViewer,
  type PannellumViewer,
} from "./viewer/pannellumAdapter";

export interface VirtualTourViewerHandle {
  toggleFullscreen(): void;
}

interface VirtualTourViewerProps {
  scene: TourSceneRow;
  panoramaUrl: string;
  retryKey: number;
  onLoadingChange: (loading: boolean) => void;
  onError: (message: string) => void;
}

export const VirtualTourViewer = forwardRef<VirtualTourViewerHandle, VirtualTourViewerProps>(
  function VirtualTourViewer(
    { scene, panoramaUrl, retryKey, onLoadingChange, onError },
    forwardedRef,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<PannellumViewer | null>(null);

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
    }, [onError, onLoadingChange, panoramaUrl, retryKey, scene.id, scene.initial_hfov, scene.initial_pitch, scene.initial_yaw]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full bg-[#080a0d]"
        role="application"
        aria-label={`360 degree panorama: ${scene.name}`}
      />
    );
  },
);
