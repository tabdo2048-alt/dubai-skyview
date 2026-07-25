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
  // Brand logos for tourism landmarks, hosted locally in public/landmarks/ so
  // they always load (official sites block hotlinking). A place without a logo
  // here falls back to its Wikipedia photo (landmarkPhotos.ts) then the glyph —
  // e.g. Burj Khalifa, the Dubai Fountain, and the pure areas (Palm Jumeirah,
  // JBR Beach, Dubai Creek, Gold Souk, Jumeirah Mosque) stay on their photo.
  tourism: {
    "Museum of the Future": "/landmarks/museum-of-future.png",
    "Dubai Marina": "/landmarks/dubai-marina.png",
    "Dubai Frame": "/landmarks/dubai-frame.jpg",
    "Dubai Opera": "/landmarks/dubai-opera.png",
    "IMG Worlds of Adventure": "/landmarks/img-worlds.png",
    "The Dubai Mall": "/landmarks/dubai-mall.png",
    "Burj Al Arab": "/landmarks/burj-al-arab.png",
    "Atlantis The Palm": "/landmarks/atlantis-palm.png",
    "Ain Dubai": "/landmarks/ain-dubai.png",
    "Global Village": "/landmarks/global-village.png",
    "Dubai Miracle Garden": "/landmarks/miracle-garden.png",
    "Ski Dubai": "/landmarks/ski-dubai.png",
    "La Mer": "/landmarks/la-mer.png",
    "Wild Wadi Waterpark": "/landmarks/wild-wadi.ico",
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
