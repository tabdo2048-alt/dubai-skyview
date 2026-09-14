import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { PANORAMA_TYPES, TOUR_HOTSPOT_TYPES } from "./constants";

export type TourHotspotType = (typeof TOUR_HOTSPOT_TYPES)[number];
export type PanoramaType = (typeof PANORAMA_TYPES)[number];

export type VirtualTourRow = Tables<"virtual_tours">;
export type VirtualTourInsert = TablesInsert<"virtual_tours">;
export type VirtualTourUpdate = TablesUpdate<"virtual_tours">;
export type TourFloorRow = Tables<"tour_floors">;
export type TourFloorInsert = TablesInsert<"tour_floors">;
export type TourFloorUpdate = TablesUpdate<"tour_floors">;
export type TourSceneRow = Tables<"tour_scenes">;
export type TourSceneInsert = TablesInsert<"tour_scenes">;
export type TourSceneUpdate = TablesUpdate<"tour_scenes">;
export type TourHotspotRow = Tables<"tour_hotspots">;
export type TourHotspotInsert = TablesInsert<"tour_hotspots">;
export type TourHotspotUpdate = TablesUpdate<"tour_hotspots">;

export interface VirtualTour {
  id: VirtualTourRow["id"];
  tenantId: VirtualTourRow["tenant_id"];
  projectId: VirtualTourRow["project_id"];
  unitId: VirtualTourRow["unit_id"];
  name: VirtualTourRow["name"];
  description: VirtualTourRow["description"];
  thumbnailUrl: VirtualTourRow["thumbnail_url"];
  isPublished: VirtualTourRow["is_published"];
  createdBy: VirtualTourRow["created_by"];
  createdAt: VirtualTourRow["created_at"];
  updatedAt: VirtualTourRow["updated_at"];
}

export interface TourFloor {
  id: TourFloorRow["id"];
  tourId: TourFloorRow["tour_id"];
  name: TourFloorRow["name"];
  floorNumber: TourFloorRow["floor_number"];
  floorPlanUrl: TourFloorRow["floor_plan_url"];
  width: TourFloorRow["width"];
  height: TourFloorRow["height"];
  sortOrder: TourFloorRow["sort_order"];
  createdAt: TourFloorRow["created_at"];
  updatedAt: TourFloorRow["updated_at"];
}

export interface TourScene {
  id: TourSceneRow["id"];
  tourId: TourSceneRow["tour_id"];
  floorId: TourSceneRow["floor_id"];
  name: TourSceneRow["name"];
  description: TourSceneRow["description"];
  panoramaUrl: TourSceneRow["panorama_url"];
  thumbnailUrl: TourSceneRow["thumbnail_url"];
  initialYaw: TourSceneRow["initial_yaw"];
  initialPitch: TourSceneRow["initial_pitch"];
  initialHfov: TourSceneRow["initial_hfov"];
  floorPlanX: TourSceneRow["floor_plan_x"];
  floorPlanY: TourSceneRow["floor_plan_y"];
  panoramaType: PanoramaType;
  multiresConfig: Json | null;
  sortOrder: TourSceneRow["sort_order"];
  isPublished: TourSceneRow["is_published"];
  createdAt: TourSceneRow["created_at"];
  updatedAt: TourSceneRow["updated_at"];
}

export interface TourHotspot {
  id: TourHotspotRow["id"];
  sceneId: TourHotspotRow["scene_id"];
  targetSceneId: TourHotspotRow["target_scene_id"];
  type: TourHotspotType;
  label: TourHotspotRow["label"];
  yaw: TourHotspotRow["yaw"];
  pitch: TourHotspotRow["pitch"];
  icon: TourHotspotRow["icon"];
  metadata: Json;
  sortOrder: TourHotspotRow["sort_order"];
  createdAt: TourHotspotRow["created_at"];
  updatedAt: TourHotspotRow["updated_at"];
}

export interface TourCameraState {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
  timestamp: number;
  version: number;
}

export interface PanoramaMetadata {
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  panoramaType: PanoramaType;
}
