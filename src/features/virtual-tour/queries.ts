import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectRow } from "@/lib/types";
import { sortTourFloors } from "./floorData";
import type {
  ProjectBuildingRow,
  TourFloorRow,
  TourHotspotRow,
  TourSceneRow,
  VirtualTourRow,
} from "./types";

export type VirtualTourProject = Pick<ProjectRow, "id" | "slug" | "name" | "tour_360_url">;

export interface VirtualTourBundle {
  project: VirtualTourProject;
  tour: VirtualTourRow;
  scenes: TourSceneRow[];
  buildingName: string | null;
  unitName: string | null;
}

export async function fetchPublishedVirtualTour(
  slug: string,
  tourId: string,
): Promise<VirtualTourBundle | null> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,slug,name,tour_360_url")
    .eq("slug", slug)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) return null;

  const { data: tour, error: tourError } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("id", tourId)
    .eq("project_id", project.id)
    .eq("is_published", true)
    .maybeSingle();
  if (tourError) throw tourError;
  if (!tour) return null;

  const [scenesResult, buildingResult, unitResult] = await Promise.all([
    supabase
      .from("tour_scenes")
      .select("*")
      .eq("tour_id", tour.id)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    tour.building_id
      ? supabase.from("project_buildings").select("name").eq("id", tour.building_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tour.unit_id
      ? supabase.from("project_unit_types").select("label").eq("id", tour.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data: scenes, error: scenesError } = scenesResult;
  if (scenesError) throw scenesError;
  if (buildingResult.error) throw buildingResult.error;
  if (unitResult.error) throw unitResult.error;

  return {
    project,
    tour,
    scenes: scenes ?? [],
    buildingName: buildingResult.data?.name ?? null,
    unitName: unitResult.data?.label ?? null,
  };
}

export function virtualTourQueryOptions(slug: string, tourId: string) {
  return queryOptions({
    queryKey: ["virtual-tours", "published", slug, tourId],
    queryFn: () => fetchPublishedVirtualTour(slug, tourId),
    staleTime: 60_000,
  });
}

export async function fetchSceneHotspots(sceneId: string): Promise<TourHotspotRow[]> {
  const { data, error } = await supabase
    .from("tour_hotspots")
    .select("*")
    .eq("scene_id", sceneId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function sceneHotspotsQueryOptions(sceneId: string) {
  return queryOptions({
    queryKey: ["virtual-tours", "scene", sceneId, "hotspots"],
    queryFn: () => fetchSceneHotspots(sceneId),
    staleTime: 60_000,
  });
}

export function useSceneHotspots(sceneId: string) {
  return useQuery(sceneHotspotsQueryOptions(sceneId));
}

export async function fetchTourFloors(tourId: string): Promise<TourFloorRow[]> {
  const { data, error } = await supabase
    .from("tour_floors")
    .select("*")
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: true })
    .order("floor_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return sortTourFloors(data ?? []);
}

export function tourFloorsQueryOptions(tourId: string) {
  return queryOptions({
    queryKey: ["virtual-tours", "tour", tourId, "floors"],
    queryFn: () => fetchTourFloors(tourId),
    staleTime: 60_000,
  });
}

export function useTourFloors(tourId: string) {
  return useQuery(tourFloorsQueryOptions(tourId));
}

export function selectDefaultTourScene(scenes: TourSceneRow[]): TourSceneRow | null {
  return scenes[0] ?? null;
}

export function findTourScene(scenes: TourSceneRow[], sceneId: string): TourSceneRow | null {
  return scenes.find((scene) => scene.id === sceneId) ?? null;
}

export async function fetchFirstPublishedProjectTour(
  projectId: string,
): Promise<VirtualTourRow | null> {
  const { data, error } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_published", true)
    .is("building_id", null)
    .is("unit_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchFirstPublishedUnitTour(
  projectId: string,
  unitId: string,
): Promise<VirtualTourRow | null> {
  const { data, error } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("project_id", projectId)
    .eq("unit_id", unitId)
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useFirstPublishedUnitTour(
  projectId: string | null | undefined,
  unitId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["virtual-tours", "project", projectId, "unit", unitId, "first-published"],
    queryFn: () => fetchFirstPublishedUnitTour(projectId!, unitId!),
    enabled: Boolean(projectId && unitId),
    staleTime: 60_000,
  });
}

export async function fetchFirstPublishedBuildingTour(
  projectId: string,
  buildingId: string,
): Promise<VirtualTourRow | null> {
  const { data, error } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("project_id", projectId)
    .eq("building_id", buildingId)
    .is("unit_id", null)
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useFirstPublishedBuildingTour(
  projectId: string | null | undefined,
  buildingId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["virtual-tours", "project", projectId, "building", buildingId, "first-published"],
    queryFn: () => fetchFirstPublishedBuildingTour(projectId!, buildingId!),
    enabled: Boolean(projectId && buildingId),
    staleTime: 60_000,
  });
}

export interface PublishedBuildingTour {
  building: Pick<ProjectBuildingRow, "id" | "name" | "sort_order">;
  tour: VirtualTourRow;
}

export async function fetchPublishedBuildingTours(
  projectId: string,
): Promise<PublishedBuildingTour[]> {
  const [buildingsResult, toursResult] = await Promise.all([
    supabase
      .from("project_buildings")
      .select("id,name,sort_order")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("virtual_tours")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_published", true)
      .not("building_id", "is", null)
      .is("unit_id", null)
      .order("created_at", { ascending: true }),
  ]);
  if (buildingsResult.error) throw buildingsResult.error;
  if (toursResult.error) throw toursResult.error;

  const buildings = new Map(
    (buildingsResult.data ?? []).map((building) => [building.id, building]),
  );
  const seenBuildings = new Set<string>();
  const result = (toursResult.data ?? []).flatMap((tour) => {
    const building = tour.building_id ? buildings.get(tour.building_id) : null;
    if (!building || seenBuildings.has(building.id)) return [];
    seenBuildings.add(building.id);
    return [{ building, tour }];
  });
  return result.sort((left, right) => left.building.sort_order - right.building.sort_order);
}

export function usePublishedBuildingTours(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["virtual-tours", "project", projectId, "building-tours"],
    queryFn: () => fetchPublishedBuildingTours(projectId!),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
}

export function useFirstPublishedProjectTour(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["virtual-tours", "project", projectId, "first-published"],
    queryFn: () => fetchFirstPublishedProjectTour(projectId!),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
}
