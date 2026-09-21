// Dubai geo constants shared across map surfaces.
export const DUBAI_CENTER = { lat: 25.1972, lng: 55.2744 }; // Downtown Dubai

// Named camera targets used by the emirate switcher. Keep Dubai as the first
// entry so it remains the default opening/recenter destination.
export const EMIRATE_VIEWS = {
  dubai: {
    key: "dubai",
    label: "Dubai",
    center: DUBAI_CENTER,
    zoom: 11.2,
  },
  sharjah: {
    key: "sharjah",
    label: "Sharjah",
    center: { lat: 25.3463, lng: 55.4209 },
    zoom: 11.2,
  },
  rasAlKhaimah: {
    key: "rasAlKhaimah",
    label: "Ras Al Khaimah",
    center: { lat: 25.8007, lng: 55.9762 },
    zoom: 11.2,
  },
} as const;

export type EmirateKey = keyof typeof EMIRATE_VIEWS;
export type EmirateView = (typeof EMIRATE_VIEWS)[EmirateKey];

// Opening frame. Used for framing (fitBounds, the min-zoom fit) so the map
// opens on Dubai proper even though the user can roam across the wider region.
export const DUBAI_BOUNDS = {
  south: 24.79,
  west: 54.89,
  north: 25.55,
  east: 55.65,
};

// Regional navigation extent. Keep this wider than the Dubai opening frame so
// Mapbox can zoom out naturally instead of treating the Dubai rectangle as a
// hard minimum-zoom constraint.
export const MAP_MAX_BOUNDS = {
  south: 24.48,
  west: 54.57,
  north: 26.15,
  east: 56.35,
};

// Native Mapbox bounds and zoom-out extent. This restores the working zoom
// range used before the Dubai-only Cesium experiment narrowed both rectangles.
export const ZOOM_OUT_BOUNDS = {
  south: 24.46,
  west: 54.55,
  north: 26.20,
  east: 56.40,
};

// Shared navigation/zoom rules for both Mapbox Satellite and Cesium 3D.
export const MAP_MAX_ZOOM = 18;
export const MAP_MIN_ZOOM_OFFSET = 1;
export const MAP_PAN_CLAMP_EPSILON = 0.05;

export function clampToDubai(lng: number, lat: number) {
  return {
    lng: Math.max(DUBAI_BOUNDS.west, Math.min(DUBAI_BOUNDS.east, lng)),
    lat: Math.max(DUBAI_BOUNDS.south, Math.min(DUBAI_BOUNDS.north, lat)),
  };
}

// Opening view: wide over Dubai, flat (pitch/bearing 0). After the map is idle
// the cinematic fly-in (see MapboxView) eases up to DEFAULT_PITCH/BEARING and
// a closer zoom — so we deliberately start zoomed OUT, not in the city.
// Optimized: Slightly closer zoom for better initial detail perception.
export const DEFAULT_ZOOM = 11.2; // Increased from 10.4 for better detail visibility
export const DEFAULT_PITCH = 55;
export const DEFAULT_BEARING = -28;

// Zoom levels for progressive detail loading
export const DETAIL_ZOOM_THRESHOLDS = {
  MIN_PROJECTS: 10, // Show projects at this zoom and above
  MIN_METRO_STATIONS: 12, // Show metro stations at this zoom
  MIN_DETAIL_LABELS: 13, // Show detailed info at this zoom
} as const;

// The single source of truth for `projects.category`. The column is plain TEXT
// with no CHECK constraint, so adding a value here needs no migration — but the
// sidebar filter chips and the admin project form both read this list, so a
// value added anywhere else would filter to nothing.
export const CATEGORIES = [
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" },
  { value: "townhouse", label: "Townhouse" },
  { value: "penthouse", label: "Penthouse" },
  { value: "studio", label: "Studio" },
  { value: "offices", label: "Offices" },
  { value: "retail", label: "Retail" },
] as const;

export const STATUSES = [
  { value: "ready", label: "Ready" },
  { value: "off_plan", label: "Off Plan" },
] as const;

export const TAG_FILTERS = [
  "waterfront",
  "beachfront",
  "golf-view",
  "marina",
  "downtown",
  "palm",
  "burj-view",
  "creek",
  "branded",
] as const;

export function formatAed(value: number | null | undefined): string {
  if (!value) return "Price on request";
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)}M`;
  if (value >= 1_000) return `AED ${(value / 1_000).toFixed(0)}K`;
  return `AED ${value.toLocaleString()}`;
}

// A count of 0 means "this project has none of these" — offices and retail have
// no bedrooms or bathrooms — and an unset column means "nobody filled it in".
// Neither is worth a row on a listing, so both collapse to null and every caller
// omits the field entirely instead of printing "0" or a "—" placeholder that
// reads like real data.
export function positiveCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

// "3", "1–4", or null when the project records no bedrooms at all.
export function bedroomsLabel(p: { bedrooms_min?: number | null; bedrooms_max?: number | null }): string | null {
  const min = positiveCount(p.bedrooms_min);
  const max = positiveCount(p.bedrooms_max);
  if (min == null && max == null) return null;
  if (min == null) return String(max);
  if (max == null || max === min) return String(min);
  return `${min}–${max}`;
}
