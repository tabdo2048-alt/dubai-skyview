import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import type { TourSceneRow } from "./types";
import type { VirtualTourBundle } from "./queries";
import { supportsFullscreen } from "./viewer/pannellumAdapter";
import { VirtualTourViewer, type VirtualTourViewerHandle } from "./VirtualTourViewer";
import { TourControls } from "./TourControls";
import { TourError } from "./TourError";
import { TourLoading } from "./TourLoading";
import { TourSceneList } from "./TourSceneList";

interface TourPageProps {
  bundle: VirtualTourBundle;
  scene: TourSceneRow;
  panoramaUrl: string;
}
export function TourPage({ bundle, scene, panoramaUrl }: TourPageProps) {
  const viewerRef = useRef<VirtualTourViewerHandle>(null);
  const [loading, setLoading] = useState(true);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const { project, tour, scenes } = bundle;

  useEffect(() => setFullscreenSupported(supportsFullscreen()), []);
  useEffect(() => {
    setViewerError(null);
    setLoading(true);
    track("scene_viewed", { project_id: project.id, tour_id: tour.id, scene_id: scene.id });
  }, [project.id, scene.id, tour.id]);
  useEffect(() => {
    track("tour_opened", { project_id: project.id, tour_id: tour.id });
  }, [project.id, tour.id]);

  const handleLoadingChange = useCallback((next: boolean) => setLoading(next), []);
  const handleViewerError = useCallback((message: string) => setViewerError(message), []);

  return (
    <main className="fixed inset-0 z-50 grid bg-[#080a0d] lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="relative min-h-0 overflow-hidden" aria-label={`${tour.name} virtual tour`}>
        <VirtualTourViewer
          ref={viewerRef}
          scene={scene}
          panoramaUrl={panoramaUrl}
          retryKey={retryKey}
          onLoadingChange={handleLoadingChange}
          onError={handleViewerError}
        />
        <TourControls
          slug={project.slug}
          projectName={project.name}
          tourName={tour.name}
          fullscreenSupported={fullscreenSupported}
          onFullscreen={() => viewerRef.current?.toggleFullscreen()}
        />
        {loading && !viewerError && <TourLoading projectName={project.name} sceneName={scene.name} />}
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
      </section>
      <aside className="absolute inset-x-0 bottom-0 z-40 max-h-[30vh] border-t border-white/10 bg-black/75 backdrop-blur-xl lg:static lg:max-h-none lg:border-l lg:border-t-0 lg:bg-[#0d1015]" aria-label="Scenes">
        <div className="hidden px-4 pb-1 pt-5 text-xs uppercase tracking-[0.2em] text-muted-foreground lg:block">Scenes</div>
        <TourSceneList slug={project.slug} tourId={tour.id} scenes={scenes} currentSceneId={scene.id} />
      </aside>
    </main>
  );
}
