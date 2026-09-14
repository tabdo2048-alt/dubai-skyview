import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import type { TourHotspotRow, TourSceneRow } from "./types";
import type { VirtualTourBundle } from "./queries";
import { useSceneHotspots } from "./queries";
import {
  hotspotExternalUrl,
  validateSceneHotspots,
} from "./hotspotData";
import { useTourNavigation } from "./useTourNavigation";
import { supportsFullscreen } from "./viewer/pannellumAdapter";
import { VirtualTourViewer, type VirtualTourViewerHandle } from "./VirtualTourViewer";
import { TourControls } from "./TourControls";
import { TourError } from "./TourError";
import { TourHotspotCard } from "./TourHotspotCard";
import { TourLoading } from "./TourLoading";
import { TourSceneList } from "./TourSceneList";

interface TourPageProps {
  bundle: VirtualTourBundle;
  scene: TourSceneRow;
  panoramaUrl: string;
}

export function TourPage({ bundle, scene, panoramaUrl }: TourPageProps) {
  const viewerRef = useRef<VirtualTourViewerHandle>(null);
  const hotspotTriggerRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<TourHotspotRow | null>(null);
  const { project, tour, scenes } = bundle;
  const hotspotQuery = useSceneHotspots(scene.id);
  const hotspots = useMemo(
    () => validateSceneHotspots(hotspotQuery.data ?? [], scene.id, scenes),
    [hotspotQuery.data, scene.id, scenes],
  );

  const beforeSceneNavigation = useCallback(() => {
    setActiveHotspot(null);
    setViewerError(null);
    setLoading(true);
  }, []);
  const navigateToScene = useTourNavigation({
    slug: project.slug,
    tourId: tour.id,
    scenes,
    onBeforeNavigate: beforeSceneNavigation,
  });

  useEffect(() => setFullscreenSupported(supportsFullscreen()), []);
  useEffect(() => {
    setActiveHotspot(null);
    setViewerError(null);
    setLoading(true);
    track("scene_viewed", { project_id: project.id, tour_id: tour.id, scene_id: scene.id });
  }, [project.id, scene.id, tour.id]);
  useEffect(() => {
    track("tour_opened", { project_id: project.id, tour_id: tour.id });
  }, [project.id, tour.id]);

  const handleLoadingChange = useCallback((next: boolean) => setLoading(next), []);
  const handleViewerError = useCallback((message: string) => setViewerError(message), []);

  const closeHotspotCard = useCallback(() => {
    setActiveHotspot(null);
    requestAnimationFrame(() => hotspotTriggerRef.current?.focus());
  }, []);

  const handleHotspotActivate = useCallback(
    (hotspot: TourHotspotRow) => {
      track("hotspot_clicked", {
        tour_id: tour.id,
        scene_id: scene.id,
        hotspot_type: hotspot.type,
        target_scene_id: hotspot.target_scene_id,
      });

      if (hotspot.type === "navigation" && hotspot.target_scene_id) {
        navigateToScene(hotspot.target_scene_id);
        return;
      }

      if (hotspot.type === "external_link") {
        const externalUrl = hotspotExternalUrl(hotspot.metadata);
        if (externalUrl) {
          window.open(externalUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }

      hotspotTriggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setActiveHotspot(hotspot);
    },
    [navigateToScene, scene.id, tour.id],
  );

  return (
    <main className="fixed inset-0 z-50 grid bg-[#080a0d] lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="relative min-h-0 overflow-hidden" aria-label={tour.name + " virtual tour"}>
        <VirtualTourViewer
          ref={viewerRef}
          scene={scene}
          panoramaUrl={panoramaUrl}
          hotspots={hotspots}
          retryKey={retryKey}
          onLoadingChange={handleLoadingChange}
          onError={handleViewerError}
          onHotspotActivate={handleHotspotActivate}
        />
        <TourControls
          slug={project.slug}
          projectName={project.name}
          tourName={tour.name}
          fullscreenSupported={fullscreenSupported}
          onFullscreen={() => viewerRef.current?.toggleFullscreen()}
        />
        {loading && !viewerError && (
          <TourLoading projectName={project.name} sceneName={scene.name} />
        )}
        {viewerError && (
          <TourError
            message={viewerError}
            onRetry={() => {
              setViewerError(null);
              setLoading(true);
              setRetryKey((key) => key + 1);
            }}
          />
        )}
        {activeHotspot && (
          <TourHotspotCard
            hotspot={activeHotspot}
            projectSlug={project.slug}
            onClose={closeHotspotCard}
          />
        )}
        {hotspotQuery.isError && (
          <div
            role="status"
            className="pointer-events-none absolute bottom-24 left-3 z-30 rounded-full bg-black/70 px-3 py-1.5 text-xs text-cream/75 lg:bottom-5"
          >
            تعذر تحميل نقاط الجولة
          </div>
        )}
      </section>
      <aside
        className="absolute inset-x-0 bottom-0 z-40 max-h-[30vh] border-t border-white/10 bg-black/75 backdrop-blur-xl lg:static lg:max-h-none lg:border-l lg:border-t-0 lg:bg-[#0d1015]"
        aria-label="Scenes"
      >
        <div className="hidden px-4 pb-1 pt-5 text-xs uppercase tracking-[0.2em] text-muted-foreground lg:block">
          Scenes
        </div>
        <TourSceneList
          scenes={scenes}
          currentSceneId={scene.id}
          navigateToScene={navigateToScene}
        />
      </aside>
    </main>
  );
}
