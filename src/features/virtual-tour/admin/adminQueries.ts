import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type {
  TourFloorRow,
  TourHotspotInsert,
  TourHotspotRow,
  TourHotspotUpdate,
  TourSceneInsert,
  TourSceneRow,
  TourSceneUpdate,
  ProjectBuildingInsert,
  ProjectBuildingRow,
  ProjectBuildingUpdate,
  VirtualTourInsert,
  VirtualTourRow,
  VirtualTourUpdate,
} from "../types";

export type AdminTourUnit = Pick<
  Tables<"project_unit_types">,
  "id" | "label" | "project_id" | "tenant_id" | "building_id"
>;

export interface AdminTourSummary {
  tour: VirtualTourRow;
  floorCount: number;
  sceneCount: number;
}

export interface AdminTourBundle {
  tour: VirtualTourRow;
  floors: TourFloorRow[];
  scenes: TourSceneRow[];
  hotspots: TourHotspotRow[];
  units: AdminTourUnit[];
  buildings: ProjectBuildingRow[];
}

export interface AdminFloorEditorBundle {
  tour: VirtualTourRow;
  floor: TourFloorRow;
  scenes: TourSceneRow[];
}

export async function canManageTourProject(tenantId: string): Promise<boolean> {
  const [{ data: isOwner, error: ownerError }, membership] = await Promise.all([
    supabase.rpc("current_user_is_platform_owner"),
    supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"])
      .maybeSingle(),
  ]);
  if (ownerError) throw ownerError;
  if (isOwner) return true;
  if (membership.error) throw membership.error;
  return membership.data?.role === "owner" || membership.data?.role === "admin";
}

export function useCanManageTourProject(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["virtual-tour-admin", "can-manage", tenantId],
    queryFn: () => canManageTourProject(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
}

export async function fetchAdminTours(projectId: string): Promise<AdminTourSummary[]> {
  const { data: tours, error } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  if (!tours?.length) return [];

  const tourIds = tours.map((tour) => tour.id);
  const [floorsResult, scenesResult] = await Promise.all([
    supabase.from("tour_floors").select("id,tour_id").in("tour_id", tourIds),
    supabase.from("tour_scenes").select("id,tour_id").in("tour_id", tourIds),
  ]);
  if (floorsResult.error) throw floorsResult.error;
  if (scenesResult.error) throw scenesResult.error;

  const floorCounts = new Map<string, number>();
  const sceneCounts = new Map<string, number>();
  for (const floor of floorsResult.data ?? []) {
    floorCounts.set(floor.tour_id, (floorCounts.get(floor.tour_id) ?? 0) + 1);
  }
  for (const scene of scenesResult.data ?? []) {
    sceneCounts.set(scene.tour_id, (sceneCounts.get(scene.tour_id) ?? 0) + 1);
  }
  return tours.map((tour) => ({
    tour,
    floorCount: floorCounts.get(tour.id) ?? 0,
    sceneCount: sceneCounts.get(tour.id) ?? 0,
  }));
}

export function useAdminTours(projectId: string) {
  return useQuery({
    queryKey: ["virtual-tour-admin", "projects", projectId, "tours"],
    queryFn: () => fetchAdminTours(projectId),
    staleTime: 30_000,
  });
}

export async function fetchProjectBuildings(projectId: string): Promise<ProjectBuildingRow[]> {
  const { data, error } = await supabase
    .from("project_buildings")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function useProjectBuildings(projectId: string) {
  return useQuery({
    queryKey: ["virtual-tour-admin", "projects", projectId, "buildings"],
    queryFn: () => fetchProjectBuildings(projectId),
    staleTime: 30_000,
  });
}

export async function createProjectBuilding(
  input: ProjectBuildingInsert,
): Promise<ProjectBuildingRow> {
  const { data, error } = await supabase
    .from("project_buildings")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProjectBuilding(
  buildingId: string,
  input: ProjectBuildingUpdate,
): Promise<ProjectBuildingRow> {
  const { data, error } = await supabase
    .from("project_buildings")
    .update(input)
    .eq("id", buildingId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProjectBuilding(buildingId: string): Promise<void> {
  const { error } = await supabase.from("project_buildings").delete().eq("id", buildingId);
  if (error) throw error;
}

export async function assignUnitToBuilding(
  unitId: string,
  buildingId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("project_unit_types")
    .update({ building_id: buildingId })
    .eq("id", unitId);
  if (error) throw error;
}

export async function fetchAdminTour(
  projectId: string,
  tourId: string,
): Promise<AdminTourBundle | null> {
  const { data: tour, error } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("id", tourId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!tour) return null;

  const [floorsResult, scenesResult, unitsResult, buildingsResult] = await Promise.all([
    supabase
      .from("tour_floors")
      .select("*")
      .eq("tour_id", tour.id)
      .order("sort_order", { ascending: true })
      .order("floor_number", { ascending: true, nullsFirst: false }),
    supabase
      .from("tour_scenes")
      .select("*")
      .eq("tour_id", tour.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("project_unit_types")
      .select("id,label,project_id,tenant_id,building_id")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("project_buildings")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (floorsResult.error) throw floorsResult.error;
  if (scenesResult.error) throw scenesResult.error;
  if (unitsResult.error) throw unitsResult.error;
  if (buildingsResult.error) throw buildingsResult.error;

  const scenes = scenesResult.data ?? [];
  let hotspots: TourHotspotRow[] = [];
  if (scenes.length > 0) {
    const hotspotsResult = await supabase
      .from("tour_hotspots")
      .select("*")
      .in(
        "scene_id",
        scenes.map((scene) => scene.id),
      )
      .order("sort_order", { ascending: true });
    if (hotspotsResult.error) throw hotspotsResult.error;
    hotspots = hotspotsResult.data ?? [];
  }

  return {
    tour,
    floors: floorsResult.data ?? [],
    scenes,
    hotspots,
    units: unitsResult.data ?? [],
    buildings: buildingsResult.data ?? [],
  };
}

export function adminTourQueryOptions(projectId: string, tourId: string) {
  return queryOptions({
    queryKey: ["virtual-tour-admin", "projects", projectId, "tours", tourId],
    queryFn: () => fetchAdminTour(projectId, tourId),
    staleTime: 15_000,
  });
}

export function useAdminTour(projectId: string, tourId: string) {
  return useQuery(adminTourQueryOptions(projectId, tourId));
}

export async function fetchAdminFloorEditor(
  projectId: string,
  tourId: string,
  floorId: string,
): Promise<AdminFloorEditorBundle | null> {
  const { data: tour, error: tourError } = await supabase
    .from("virtual_tours")
    .select("*")
    .eq("id", tourId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (tourError) throw tourError;
  if (!tour) return null;

  const [floorResult, scenesResult] = await Promise.all([
    supabase.from("tour_floors").select("*").eq("id", floorId).eq("tour_id", tour.id).maybeSingle(),
    supabase
      .from("tour_scenes")
      .select("*")
      .eq("tour_id", tour.id)
      .eq("floor_id", floorId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (floorResult.error) throw floorResult.error;
  if (scenesResult.error) throw scenesResult.error;
  if (!floorResult.data) return null;
  return { tour, floor: floorResult.data, scenes: scenesResult.data ?? [] };
}

export function useAdminFloorEditor(projectId: string, tourId: string, floorId: string) {
  return useQuery({
    queryKey: ["virtual-tour-admin", "projects", projectId, "tours", tourId, "floors", floorId],
    queryFn: () => fetchAdminFloorEditor(projectId, tourId, floorId),
    staleTime: 15_000,
  });
}

export async function createTour(
  input: Pick<
    VirtualTourInsert,
    | "project_id"
    | "tenant_id"
    | "building_id"
    | "unit_id"
    | "name"
    | "description"
    | "thumbnail_url"
    | "is_published"
  >,
): Promise<VirtualTourRow> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("virtual_tours")
    .insert({ ...input, created_by: auth.user?.id ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTour(
  tourId: string,
  input: Pick<
    VirtualTourUpdate,
    "name" | "description" | "thumbnail_url" | "building_id" | "unit_id" | "is_published"
  >,
): Promise<VirtualTourRow> {
  const { data, error } = await supabase
    .from("virtual_tours")
    .update(input)
    .eq("id", tourId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTour(tourId: string): Promise<void> {
  const { error } = await supabase.from("virtual_tours").delete().eq("id", tourId);
  if (error) throw error;
}

export async function createFloor(input: TablesInsert<"tour_floors">): Promise<TourFloorRow> {
  const { data, error } = await supabase.from("tour_floors").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateFloor(
  floorId: string,
  input: TablesUpdate<"tour_floors">,
): Promise<TourFloorRow> {
  const { data, error } = await supabase
    .from("tour_floors")
    .update(input)
    .eq("id", floorId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateFloorPlan(
  tourId: string,
  floorId: string,
  input: Pick<TablesUpdate<"tour_floors">, "floor_plan_url" | "width" | "height">,
): Promise<TourFloorRow> {
  const { data, error } = await supabase
    .from("tour_floors")
    .update(input)
    .eq("id", floorId)
    .eq("tour_id", tourId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Floor not found or update is not permitted.");
  return data;
}

export async function deleteFloor(floorId: string): Promise<void> {
  const { error } = await supabase.from("tour_floors").delete().eq("id", floorId);
  if (error) throw error;
}

export async function createScene(input: TourSceneInsert): Promise<TourSceneRow> {
  const { data, error } = await supabase.from("tour_scenes").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateScene(sceneId: string, input: TourSceneUpdate): Promise<TourSceneRow> {
  const { data, error } = await supabase
    .from("tour_scenes")
    .update(input)
    .eq("id", sceneId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSceneFloorPosition(
  tourId: string,
  floorId: string,
  sceneId: string,
  point: { x: number; y: number } | null,
): Promise<TourSceneRow> {
  const { data, error } = await supabase
    .from("tour_scenes")
    .update({
      floor_plan_x: point?.x ?? null,
      floor_plan_y: point?.y ?? null,
    })
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .eq("floor_id", floorId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Scene not found on this floor or update is not permitted.");
  return data;
}

export async function clearFloorScenePositions(tourId: string, floorId: string): Promise<void> {
  const { error } = await supabase
    .from("tour_scenes")
    .update({ floor_plan_x: null, floor_plan_y: null })
    .eq("tour_id", tourId)
    .eq("floor_id", floorId);
  if (error) throw error;
}

export async function deleteScene(sceneId: string): Promise<void> {
  const { error } = await supabase.from("tour_scenes").delete().eq("id", sceneId);
  if (error) throw error;
}

export async function createHotspot(input: TourHotspotInsert): Promise<TourHotspotRow> {
  const { data, error } = await supabase.from("tour_hotspots").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateHotspot(
  hotspotId: string,
  input: TourHotspotUpdate,
): Promise<TourHotspotRow> {
  const { data, error } = await supabase
    .from("tour_hotspots")
    .update(input)
    .eq("id", hotspotId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHotspot(hotspotId: string): Promise<void> {
  const { error } = await supabase.from("tour_hotspots").delete().eq("id", hotspotId);
  if (error) throw error;
}
