import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Map as MapIcon } from "lucide-react";
import { track } from "@/lib/analytics";
import type { TourHotspotRow, TourSceneRow } from "./types";
import type { VirtualTourBundle } from "./queries";
import {
  fetchFirstPublishedUnitTour,
  useFirstPublishedBuildingTour,
  useFirstPublishedProjectTour,
  useSceneHotspots,
  useTourFloors,
} from "./queries";
import { publishedScenesForFloor, resolveCurrentFloor, visibleTourFloors } from "./floorData";
import { resolveFloorPlanUrl } from "./floorPlanUrl";
import { hotspotExternalUrl, hotspotUnitTypeId, validateSceneHotspots } from "./hotspotData";
import { useTourNavigation } from "./useTourNavigation";
import { supportsFullscreen } from "./viewer/pannellumAdapter";
import { VirtualTourViewer, type VirtualTourViewerHandle } from "./VirtualTourViewer";
import { TourControls } from "./TourControls";
import { TourError } from "./TourError";
import { TourFloorPlan } from "./TourFloorPlan";
import { TourFloorSelector } from "./TourFloorSelector";
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
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [floorPlanOpen, setFloorPlanOpen] = useState(false);
  const [floorPlanExpanded, setFloorPlanExpanded] = useState(false);
  const { project, tour, scenes } = bundle;
  const routerNavigate = useNavigate();
  const queryClient = useQueryClient();
  const hotspotQuery = useSceneHotspots(scene.id);
  const floorsQuery = useTourFloors(tour.id);
  const projectTourQuery = useFirstPublishedProjectTour(project.id);
  const buildingTourQuery = useFirstPublishedBuildingTour(project.id, tour.building_id);
  const parentTour = useMemo(() => {
    if (tour.unit_id && buildingTourQuery.data && buildingTourQuery.data.id !== tour.id) {
      return { id: buildingTourQuery.data.id, label: "جولة البرج" };
    }
    if (
      (tour.unit_id || tour.building_id) &&
      projectTourQuery.data &&
      projectTourQuery.data.id !== tour.id
    ) {
      return { id: projectTourQuery.data.id, label: "جولة المشروع" };
    }
    return null;
  }, [buildingTourQuery.data, projectTourQuery.data, tour.building_id, tour.id, tour.unit_id]);
  const floors = useMemo(
    () => visibleTourFloors(tour.id, floorsQuery.data ?? [], scenes),
    [floorsQuery.data, scenes, tour.id],
  );
  const currentFloor = useMemo(() => resolveCurrentFloor(scene, floors), [floors, scene]);
  const currentFloorId = currentFloor?.id ?? null;
  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.id === selectedFloorId) ?? null,
    [floors, selectedFloorId],
  );
  const selectedFloorScenes = useMemo(
    () => (selectedFloor ? publishedScenesForFloor(selectedFloor, scenes) : []),
    [scenes, selectedFloor],
  );
  const floorPlanUrlQuery = useQuery({
    queryKey: [
      "virtual-tours",
      "floor",
      selectedFloor?.id,
      "plan-url",
      selectedFloor?.floor_plan_url,
    ],
    queryFn: () => resolveFloorPlanUrl(selectedFloor!.floor_plan_url),
    enabled: floorPlanOpen && Boolean(selectedFloor?.floor_plan_url),
    staleTime: 50 * 60 * 1000,
    retry: 1,
  });
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
    setSelectedFloorId(currentFloorId);
    setFloorPlanOpen(Boolean(currentFloorId));
    setFloorPlanExpanded(false);
  }, [currentFloorId]);
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

  const openHotspotCard = useCallback((hotspot: TourHotspotRow) => {
    hotspotTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFloorPlanOpen(false);
    setActiveHotspot(hotspot);
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

      if (hotspot.type === "unit") {
        const unitTypeId = hotspotUnitTypeId(hotspot.metadata);
        if (unitTypeId) {
          void queryClient
            .fetchQuery({
              queryKey: [
                "virtual-tours",
                "project",
                project.id,
                "unit",
                unitTypeId,
                "first-published",
              ],
              queryFn: () => fetchFirstPublishedUnitTour(project.id, unitTypeId),
              staleTime: 5 * 60 * 1000,
            })
            .then((unitTour) => {
              if (!unitTour) {
                openHotspotCard(hotspot);
                return;
              }
              beforeSceneNavigation();
              track("unit_opened", {
                project_id: project.id,
                tour_id: unitTour.id,
                unit_id: unitTypeId,
              });
              void routerNavigate({
                to: "/projects/$slug/tour/$tourId",
                params: { slug: project.slug, tourId: unitTour.id },
              });
            })
            .catch(() => openHotspotCard(hotspot));
          return;
        }
      }

      openHotspotCard(hotspot);
    },
    [
      beforeSceneNavigation,
      navigateToScene,
      openHotspotCard,
      project.id,
      project.slug,
      queryClient,
      routerNavigate,
      scene.id,
      tour.id,
    ],
  );

  const handleFloorSelect = useCallback(
    (floorId: string) => {
      const floor = floors.find((candidate) => candidate.id === floorId);
      if (!floor || floor.tour_id !== tour.id) return;
      setSelectedFloorId(floor.id);
      setActiveHotspot(null);
      setFloorPlanOpen(true);
      setFloorPlanExpanded(false);
      track("floor_changed", { tour_id: tour.id, floor_id: floor.id });
    },
    [floors, tour.id],
  );

  const handleFloorPlanNavigation = useCallback(
    (sceneId: string) => {
      if (!selectedFloor || !selectedFloorScenes.some((item) => item.id === sceneId)) return;
      track("floor_plan_scene_clicked", {
        tour_id: tour.id,
        floor_id: selectedFloor.id,
        scene_id: sceneId,
      });
      navigateToScene(sceneId);
    },
    [navigateToScene, selectedFloor, selectedFloorScenes, tour.id],
  );

  return (
    <main className="fixed inset-0 z-50 grid bg-[#080a0d] lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section
        className="relative min-h-0 overflow-hidden"
        aria-label={tour.name + " virtual tour"}
      >
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
          contextName={bundle.unitName ?? bundle.buildingName}
          parentTour={parentTour}
          fullscreenSupported={fullscreenSupported}
          onFullscreen={() => viewerRef.current?.toggleFullscreen()}
        />
        {floors.length > 0 && (
          <div className="absolute left-3 top-20 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 lg:left-5">
            <TourFloorSelector
              floors={floors}
              selectedFloorId={selectedFloorId}
              currentFloorId={currentFloorId}
              onSelect={handleFloorSelect}
            />
            {selectedFloor && !floorPlanOpen && (
              <button
                type="button"
                onClick={() => {
                  setActiveHotspot(null);
                  setFloorPlanOpen(true);
                }}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/65 px-3 text-xs font-medium text-cream shadow-xl backdrop-blur-xl hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label={`فتح مخطط ${selectedFloor.name}`}
              >
                <MapIcon className="size-4 text-gold" />
                <span className="hidden sm:inline">Floor Plan</span>
              </button>
            )}
          </div>
        )}
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
            projectId={project.id}
            projectSlug={project.slug}
            onClose={closeHotspotCard}
          />
        )}
        {floorPlanOpen && selectedFloor && (
          <div className="absolute bottom-[calc(30vh+0.75rem)] right-3 z-40 lg:bottom-5 lg:right-5">
            <TourFloorPlan
              key={`${selectedFloor.id}:${selectedFloor.floor_plan_url ?? "none"}`}
              floor={selectedFloor}
              scenes={selectedFloorScenes}
              currentSceneId={scene.id}
              imageUrl={floorPlanUrlQuery.data ?? null}
              imageLoading={floorPlanUrlQuery.isLoading}
              imageError={floorPlanUrlQuery.isError}
              expanded={floorPlanExpanded}
              onNavigate={handleFloorPlanNavigation}
              onToggleExpanded={() => setFloorPlanExpanded((value) => !value)}
              onClose={() => {
                setFloorPlanOpen(false);
                setFloorPlanExpanded(false);
              }}
            />
          </div>
        )}
        {floorsQuery.isError && (
          <div
            role="status"
            className="pointer-events-none absolute left-3 top-36 z-30 rounded-full bg-black/70 px-3 py-1.5 text-xs text-cream/75 lg:left-5"
          >
            تعذر تحميل بيانات الطوابق
          </div>
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
