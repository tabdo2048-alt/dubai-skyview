export const TOUR_HOTSPOT_TYPES = [
  "navigation",
  "information",
  "unit",
  "amenity",
  "external_link",
] as const;

export const PANORAMA_TYPES = ["equirectangular", "multires"] as const;

export const TOUR_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const TOUR_STORAGE_BUCKETS = {
  panoramas: "tour-panoramas",
  thumbnails: "tour-thumbnails",
  floorPlans: "tour-floorplans",
} as const;

export const TOUR_UPLOAD_LIMITS_BYTES = {
  panorama: 50 * 1024 * 1024,
  thumbnail: 5 * 1024 * 1024,
  floorPlan: 10 * 1024 * 1024,
} as const;

export const EQUIRECTANGULAR_ASPECT_RATIO = 2;
export const EQUIRECTANGULAR_ASPECT_RATIO_TOLERANCE = 0.05;
