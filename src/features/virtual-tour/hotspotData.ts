import type { Json } from "@/integrations/supabase/types";
import { safeHttpUrl } from "@/lib/utils";
import { isTourHotspotType } from "./validation";
import type { TourHotspotRow, TourSceneRow } from "./types";

type HotspotMetadataRecord = Record<string, Json | undefined>;

export type HotspotNavigationDirection = "forward" | "backward" | "up" | "down" | "auto";

export function hotspotMetadataRecord(metadata: Json): HotspotMetadataRecord {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as HotspotMetadataRecord)
    : {};
}

export function hotspotMetadataText(metadata: Json, key: string): string | null {
  const value = hotspotMetadataRecord(metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function hotspotImageUrl(metadata: Json): string | null {
  return safeHttpUrl(hotspotMetadataText(metadata, "image"));
}

export function hotspotExternalUrl(metadata: Json): string | null {
  const value = hotspotMetadataText(metadata, "url");
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  try {
    return new URL(safe).protocol === "https:" ? safe : null;
  } catch {
    return null;
  }
}

export function hotspotUnitTypeId(metadata: Json): string | null {
  return (
    hotspotMetadataText(metadata, "unitTypeId") ?? hotspotMetadataText(metadata, "unit_type_id")
  );
}

export function hotspotNavigationDirection(metadata: Json): HotspotNavigationDirection {
  const value = hotspotMetadataText(metadata, "direction");
  return value === "forward" || value === "backward" || value === "up" || value === "down"
    ? value
    : "auto";
}

export function validateSceneHotspots(
  rows: TourHotspotRow[],
  currentSceneId: string,
  publishedScenes: TourSceneRow[],
): TourHotspotRow[] {
  const publishedSceneIds = new Set(publishedScenes.map((scene) => scene.id));

  return rows.filter((hotspot) => {
    const validCoordinates =
      Number.isFinite(hotspot.yaw) &&
      hotspot.yaw >= -180 &&
      hotspot.yaw <= 180 &&
      Number.isFinite(hotspot.pitch) &&
      hotspot.pitch >= -90 &&
      hotspot.pitch <= 90;

    if (
      !hotspot.id ||
      hotspot.scene_id !== currentSceneId ||
      !isTourHotspotType(hotspot.type) ||
      !validCoordinates
    ) {
      return false;
    }

    if (hotspot.type === "navigation") {
      return Boolean(
        hotspot.target_scene_id &&
        hotspot.target_scene_id !== currentSceneId &&
        publishedSceneIds.has(hotspot.target_scene_id),
      );
    }

    if (hotspot.type === "external_link") {
      return hotspotExternalUrl(hotspot.metadata) !== null;
    }

    return true;
  });
}
