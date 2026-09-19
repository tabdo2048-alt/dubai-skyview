import { safeHttpUrl } from "@/lib/utils";
import {
  EQUIRECTANGULAR_ASPECT_RATIO,
  EQUIRECTANGULAR_ASPECT_RATIO_TOLERANCE,
  PANORAMA_TYPES,
  TOUR_HOTSPOT_TYPES,
  TOUR_IMAGE_MIME_TYPES,
  TOUR_UPLOAD_LIMITS_BYTES,
} from "./constants";
import type { PanoramaMetadata, PanoramaType, TourHotspotType } from "./types";

export interface PanoramaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function isNormalizedCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function areFloorPlanCoordinatesValid(
  x: number | null | undefined,
  y: number | null | undefined,
): boolean {
  const bothMissing = x == null && y == null;
  return bothMissing || (isNormalizedCoordinate(x) && isNormalizedCoordinate(y));
}

export function isTourHotspotType(value: unknown): value is TourHotspotType {
  return typeof value === "string" && TOUR_HOTSPOT_TYPES.some((type) => type === value);
}

export function isPanoramaType(value: unknown): value is PanoramaType {
  return typeof value === "string" && PANORAMA_TYPES.some((type) => type === value);
}

export function isSafeTourExternalUrl(value: string | null | undefined): boolean {
  return safeHttpUrl(value) !== null;
}

export function validatePanoramaMetadata(
  metadata: PanoramaMetadata,
): PanoramaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPanoramaType(metadata.panoramaType)) {
    errors.push("Unsupported panorama type.");
  }
  if (!TOUR_IMAGE_MIME_TYPES.some((mimeType) => mimeType === metadata.mimeType)) {
    errors.push("Panorama must be JPEG, PNG, or WebP.");
  }
  if (!Number.isInteger(metadata.width) || metadata.width <= 0) {
    errors.push("Panorama width must be a positive integer.");
  }
  if (!Number.isInteger(metadata.height) || metadata.height <= 0) {
    errors.push("Panorama height must be a positive integer.");
  }
  if (
    !Number.isFinite(metadata.fileSizeBytes) ||
    metadata.fileSizeBytes <= 0 ||
    metadata.fileSizeBytes > TOUR_UPLOAD_LIMITS_BYTES.panorama
  ) {
    errors.push("Panorama exceeds the 50 MB upload limit or has an invalid size.");
  }

  if (
    metadata.panoramaType === "equirectangular" &&
    metadata.width > 0 &&
    metadata.height > 0
  ) {
    const ratio = metadata.width / metadata.height;
    if (
      Math.abs(ratio - EQUIRECTANGULAR_ASPECT_RATIO) >
      EQUIRECTANGULAR_ASPECT_RATIO_TOLERANCE
    ) {
      warnings.push("Equirectangular panoramas should be close to a 2:1 aspect ratio.");
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}
