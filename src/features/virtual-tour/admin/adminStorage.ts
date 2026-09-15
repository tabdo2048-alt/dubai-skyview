import { supabase } from "@/integrations/supabase/client";
import { TOUR_STORAGE_BUCKETS } from "../constants";
import {
  floorPlanStoragePath,
  panoramaStoragePath,
  sceneThumbnailStoragePath,
  type TourImageExtension,
} from "../storage";
import { tourAssetStoragePathFromValue } from "../tourAssetUrl";

export type UploadState = "idle" | "validating" | "uploading" | "processing" | "ready" | "failed";

export function imageExtension(file: Pick<File, "type">): TourImageExtension {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

interface StorageIds {
  tenantId: string;
  projectId: string;
  tourId: string;
}

export function newPanoramaPath(
  ids: StorageIds & { sceneId: string },
  file: Pick<File, "type">,
): string {
  const base = panoramaStoragePath(ids, imageExtension(file));
  const extension = base.split(".").pop() as TourImageExtension;
  return base.replace(`panorama.${extension}`, `panorama-${crypto.randomUUID()}.${extension}`);
}

export function newThumbnailPath(
  ids: StorageIds & { sceneId: string },
  file: Pick<File, "type">,
): string {
  const base = sceneThumbnailStoragePath(ids, imageExtension(file));
  const extension = base.split(".").pop() as TourImageExtension;
  return base.replace(`thumbnail.${extension}`, `thumbnail-${crypto.randomUUID()}.${extension}`);
}

export function newFloorPlanPath(
  ids: StorageIds & { floorId: string },
  file: Pick<File, "type">,
): string {
  const base = floorPlanStoragePath(ids, imageExtension(file));
  const extension = base.split(".").pop() as TourImageExtension;
  return base.replace(`floor-plan.${extension}`, `floor-plan-${crypto.randomUUID()}.${extension}`);
}

export async function uploadTourImage(
  bucket: keyof typeof TOUR_STORAGE_BUCKETS,
  path: string,
  file: File,
): Promise<string> {
  const bucketName = TOUR_STORAGE_BUCKETS[bucket];
  const { data, error } = await supabase.storage.from(bucketName).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error || !data?.path) throw new Error("تعذر رفع الملف. تحقق من الصلاحيات والاتصال.");
  return data.path;
}

export async function removeReplacedTourImage(
  bucket: keyof typeof TOUR_STORAGE_BUCKETS,
  previousValue: string | null | undefined,
): Promise<void> {
  if (!previousValue) return;
  const bucketName = TOUR_STORAGE_BUCKETS[bucket];
  const path = tourAssetStoragePathFromValue(previousValue, bucketName);
  if (!path) return;
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  if (error && import.meta.env.DEV) console.warn(`[VirtualTour] old ${bucket} cleanup failed`);
}
