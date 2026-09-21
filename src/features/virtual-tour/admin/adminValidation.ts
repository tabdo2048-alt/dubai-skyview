import { safeHttpUrl } from "@/lib/utils";
import {
  EQUIRECTANGULAR_ASPECT_RATIO,
  EQUIRECTANGULAR_ASPECT_RATIO_TOLERANCE,
  TOUR_HOTSPOT_TYPES,
  TOUR_IMAGE_MIME_TYPES,
  TOUR_UPLOAD_LIMITS_BYTES,
} from "../constants";
import type { TourHotspotRow, TourHotspotType, TourSceneRow } from "../types";

export type AdminUploadKind = "panorama" | "thumbnail" | "floorPlan";

export interface AdminImageValidation {
  valid: boolean;
  width: number;
  height: number;
  errors: string[];
  warnings: string[];
}

const limits: Record<AdminUploadKind, number> = {
  panorama: TOUR_UPLOAD_LIMITS_BYTES.panorama,
  thumbnail: TOUR_UPLOAD_LIMITS_BYTES.thumbnail,
  floorPlan: TOUR_UPLOAD_LIMITS_BYTES.floorPlan,
};

export function validateAdminImageBasics(
  file: Pick<File, "type" | "size">,
  kind: AdminUploadKind,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  if (!TOUR_IMAGE_MIME_TYPES.some((mime) => mime === file.type)) {
    errors.push("الملف يجب أن يكون JPEG أو PNG أو WebP.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) errors.push("حجم الملف غير صالح.");
  if (file.size > limits[kind]) {
    const sizeMb = Math.round(limits[kind] / 1024 / 1024);
    errors.push(`حجم الملف يتجاوز الحد المسموح (${sizeMb} MB).`);
  }
  return { errors, warnings: [] };
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("تعذر قراءة أبعاد الصورة."));
    };
    image.src = objectUrl;
  });
}

export async function validateAdminImageFile(
  file: File,
  kind: AdminUploadKind,
): Promise<AdminImageValidation> {
  const basics = validateAdminImageBasics(file, kind);
  if (basics.errors.length > 0) {
    return { valid: false, width: 0, height: 0, ...basics };
  }

  try {
    const dimensions = await imageDimensions(file);
    const warnings = [...basics.warnings];
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      basics.errors.push("أبعاد الصورة غير صالحة.");
    }
    if (kind === "panorama" && dimensions.height > 0) {
      const ratio = dimensions.width / dimensions.height;
      if (Math.abs(ratio - EQUIRECTANGULAR_ASPECT_RATIO) > EQUIRECTANGULAR_ASPECT_RATIO_TOLERANCE) {
        warnings.push("صورة 360 يفضل أن تكون بنسبة 2:1. سيتم السماح بالرفع للمعاينة.");
      }
    }
    return {
      valid: basics.errors.length === 0,
      width: dimensions.width,
      height: dimensions.height,
      errors: basics.errors,
      warnings,
    };
  } catch (error) {
    return {
      valid: false,
      width: 0,
      height: 0,
      errors: [error instanceof Error ? error.message : "تعذر قراءة الصورة."],
      warnings: [],
    };
  }
}

export function validateCameraValues(yaw: number, pitch: number, hfov: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(yaw) || yaw < -360 || yaw > 360)
    errors.push("Yaw يجب أن يكون بين -360 و360.");
  if (!Number.isFinite(pitch) || pitch < -90 || pitch > 90)
    errors.push("Pitch يجب أن يكون بين -90 و90.");
  if (!Number.isFinite(hfov) || hfov < 30 || hfov > 120)
    errors.push("HFOV يجب أن يكون بين 30 و120.");
  return errors;
}

export interface HotspotDraft {
  type: TourHotspotType;
  label: string;
  targetSceneId: string | null;
  yaw: number;
  pitch: number;
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  unitTypeId?: string;
  navigationDirection?: "auto" | "forward" | "backward" | "up" | "down";
}

export function validateHotspotDraft(
  draft: HotspotDraft,
  scenes: TourSceneRow[],
  currentSceneId: string,
): string[] {
  const errors: string[] = [];
  if (!TOUR_HOTSPOT_TYPES.some((type) => type === draft.type)) errors.push("نوع Hotspot غير صالح.");
  if (!Number.isFinite(draft.yaw) || draft.yaw < -360 || draft.yaw > 360)
    errors.push("Yaw غير صالح.");
  if (!Number.isFinite(draft.pitch) || draft.pitch < -90 || draft.pitch > 90)
    errors.push("Pitch غير صالح.");
  if (draft.type === "navigation") {
    const target = scenes.find((scene) => scene.id === draft.targetSceneId);
    const source = scenes.find((scene) => scene.id === currentSceneId);
    if (!target || !source || target.tour_id !== source.tour_id || target.id === source.id) {
      errors.push("اختر مشهدًا صالحًا من نفس الجولة.");
    }
  }
  if (draft.type === "external_link" && (!draft.url || !safeHttpsUrl(draft.url))) {
    errors.push("الرابط الخارجي يجب أن يبدأ بـ https://.");
  }
  if (
    (draft.type === "information" || draft.type === "amenity") &&
    !draft.label.trim() &&
    !draft.description?.trim()
  ) {
    errors.push("أدخل اسمًا أو وصفًا للنقطة.");
  }
  if (draft.type === "unit" && !draft.unitTypeId) errors.push("اختر الوحدة المرتبطة.");
  if (draft.image && !safeHttpUrl(draft.image)) errors.push("رابط الصورة غير صالح.");
  return errors;
}

export function safeHttpsUrl(value: string | null | undefined): string | null {
  const safe = safeHttpUrl(value);
  return safe?.startsWith("https://") ? safe : null;
}

export function hotspotMetadataFromDraft(draft: HotspotDraft): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (draft.title?.trim()) metadata.title = draft.title.trim();
  if (draft.description?.trim()) metadata.description = draft.description.trim();
  if (draft.image?.trim()) metadata.image = draft.image.trim();
  if (draft.url?.trim()) metadata.url = draft.url.trim();
  if (draft.unitTypeId) metadata.unitTypeId = draft.unitTypeId;
  if (
    draft.type === "navigation" &&
    draft.navigationDirection &&
    draft.navigationDirection !== "auto"
  ) {
    metadata.direction = draft.navigationDirection;
  }
  return metadata;
}

export function validateTourForPublish(
  scenes: TourSceneRow[],
  hotspots: TourHotspotRow[],
): string[] {
  const errors: string[] = [];
  const publishedScenes = scenes.filter((scene) => scene.is_published && scene.panorama_url.trim());
  if (publishedScenes.length === 0)
    errors.push("أضف مشهدًا منشورًا يحتوي Panorama قبل نشر الجولة.");
  const validSceneIds = new Set(publishedScenes.map((scene) => scene.id));
  if (
    hotspots.some(
      (hotspot) =>
        hotspot.type === "navigation" &&
        (!hotspot.target_scene_id || !validSceneIds.has(hotspot.target_scene_id)),
    )
  ) {
    errors.push("الجولة تحتوي Navigation Hotspot مكسورة.");
  }
  return errors;
}
