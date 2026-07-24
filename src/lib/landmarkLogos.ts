// Optional per-place logo URLs for landmark markers, keyed by the exact place
// name in each POI table. This is the same lightweight static-map pattern as
// landmarkPhotos.ts, extended to all three POI categories.
//
// Resolution order for a marker's icon (see MapboxView POI effect):
//   poi.images[0]  →  LANDMARK_LOGOS[category][name]  →  LANDMARK_PHOTOS[name]
//   (tourism only) →  category fallback glyph (poiIcons.ts)
// So an empty entry here is fine — the fallback glyph renders. Fill a URL in to
// promote a place to a real branded logo without any code change.
//
// Keys must match the table's `name` exactly. OSM-imported names may differ from
// these curated spellings, in which case the logo silently falls through to the
// glyph — acceptable, and the reason this stays a data-only file.
import type { PoiCategory } from "@/hooks/use-pois";

export const LANDMARK_LOGOS: Record<PoiCategory, Record<string, string>> = {
  // Tourism already has photo thumbnails via landmarkPhotos.ts; add branded
  // logos here only when preferred over the photo.
  tourism: {
    // "Burj Khalifa": "https://.../burj-khalifa.png",
  },
  // Universities/schools — drop official logos in as they're sourced.
  schools: {
    // "American University in Dubai": "https://.../aud.png",
    // "Heriot-Watt University Dubai": "https://.../heriot-watt.png",
    // "University of Wollongong in Dubai": "https://.../uowd.png",
  },
  // Hospitals — brand logos as sourced.
  hospitals: {
    // "American Hospital": "https://.../american-hospital.png",
    // "Zulekha Hospital, Dubai": "https://.../zulekha.png",
  },
};
