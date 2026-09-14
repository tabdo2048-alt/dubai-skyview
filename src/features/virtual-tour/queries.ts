import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectRow } from "@/lib/types";
import type { TourHotspotRow, TourSceneRow, VirtualTourRow } from "./types";

export type VirtualTourProject = Pick<ProjectRow, "id" | "slug" | "name" | "tour_360_url">;

export interface VirtualTourBundle {
  project: VirtualTourProject;
  tour: VirtualTourRow;
  scenes: TourSceneRow[];
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

  const { data: scenes, error: scenesError } = await supabase
    .from("tour_scenes")
    .select("*")
    .eq("tour_id", tour.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (scenesError) throw scenesError;

  return { project, tour, scenes: scenes ?? [] };
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

export function selectDefaultTourScene(scenes: TourSceneRow[]): TourSceneRow | null {
  return scenes[0] ?? null;
}

export function findTourScene(scenes: TourSceneRow[], sceneId: string): TourSceneRow | null {
  return scenes.find((scene) => scene.id === sceneId) ?? null;
}

export async function fetchFirstPublishedProjectTour(projectId: string): Promise<VirtualTourRow | null> {
  const { data, error } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useFirstPublishedProjectTour(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["virtual-tours", "project", projectId, "first-published"],
    queryFn: () => fetchFirstPublishedProjectTour(projectId!),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
}
