import type { ProjectWithRelations } from "@/lib/types";
import type { DisplayUnitType } from "@/lib/unit-types";
import { mediaSrc } from "@/lib/media";
import { safeHttpUrl } from "@/lib/utils";

/** Select the project's original/main image, with a gallery fallback. */
export function projectMainImage(project: ProjectWithRelations): string {
  const galleryImage = mediaSrc(project.images?.[0]?.src, project.images?.[0]?.url);
  return (
    mediaSrc(project.main_image_src, null) ||
    mediaSrc(project.main_image_thumb_src, null) ||
    mediaSrc(null, project.main_image_url) ||
    galleryImage
  );
}

/** Select the configured PDF header image, falling back to the project main image. */
export function projectOfferImage(project: ProjectWithRelations): string {
  return mediaSrc(project.offer_header_image_src, project.offer_header_image_url) || projectMainImage(project);
}

/** Select the unit-specific image marked as the floor plan. */
export function unitFloorPlanImage(unit: DisplayUnitType): string {
  const selectedImage = (unit.images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((image) => image.is_floor_plan);

  return mediaSrc(
    selectedImage?.src ?? unit.floor_plan_src,
    selectedImage?.url ?? unit.floor_plan_url,
  );
}

/** Select a normal unit photo, never the image marked as the floor plan. */
export function unitPhotoImage(unit: DisplayUnitType): string {
  const photo = (unit.images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((image) => !image.is_floor_plan);

  return mediaSrc(photo?.src, photo?.url);
}

/** @deprecated Use unitFloorPlanImage for clarity. */
export function unitOfferImage(unit: DisplayUnitType): string {
  return unitFloorPlanImage(unit);
}

/**
 * React PDF's browser image parser supports JPEG and PNG, not WebP. Uploaded
 * project media is optimized to WebP, so rasterize it to a local JPEG data URI
 * before passing it to the PDF renderer. The original stored URL remains
 * untouched. If a browser cannot fetch/convert an external image, return its
 * URL so the renderer still gets a chance to handle it directly.
 */
export async function preparePdfImage(value: string | null | undefined): Promise<string> {
  const source = value?.trim() ?? "";
  if (!source || source.startsWith("data:image/jpeg") || source.startsWith("data:image/png") || source.startsWith("data:image/svg+xml")) {
    return source;
  }

  if (!safeHttpUrl(source)) return source.startsWith("data:image/") ? source : "";

  try {
    const response = await fetch(source);
    if (!response.ok) return source;
    const blob = await response.blob();
    if (blob.type === "image/svg+xml") return source;

    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadImage(objectUrl);
      if (!image.naturalWidth || !image.naturalHeight) return source;

      const maxDimension = 2048;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return source;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.88);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return source;
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode PDF image"));
    image.src = source;
  });
}
