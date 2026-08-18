// Dubai geo constants shared across map surfaces.
export const DUBAI_CENTER = { lat: 25.1972, lng: 55.2744 }; // Downtown Dubai

// Emirate-scoped bounds. Used for framing (fitBounds, the min-zoom fit) so the
// map opens and floors on Dubai proper.
export const DUBAI_BOUNDS = {
  south: 24.79,
  west: 54.89,
  north: 25.55,
  east: 55.65,
};

// Pan limit — held tight to Dubai proper so the user can't drag out to the
// neighbouring emirates (Sharjah to the NE, the Abu Dhabi border / Ghantoot to
// the SW). NOTE: this is no longer Mapbox's native `maxBounds`, because that
// option also clamps how far you can zoom OUT. It is enforced by a custom
// centre clamp in MapboxView (clampCenterToBounds) that only engages once the
// user has zoomed past the wide overview.
export const MAP_MAX_BOUNDS = {
  // Free-pan area: Ghantoot (W) through Ajman / Umm Al Quwain (NE). Held just
  // inside ZOOM_OUT_BOUNDS on every side so the custom pan clamp barely engages
  // (no sticky nudge-back near the edge); the native maxBounds gives the smooth
  // final stop. NOTE: the OPENING view is framed on DUBAI_BOUNDS, not this box —
  // so the map opens on Dubai only, then the user can roam out to these borders.
  south: 24.48,
  west: 54.57, // well past Ghantoot — Abu Dhabi border
  north: 25.89, // past Umm Al Quwain
  east: 55.99,
};

// The rect handed to Mapbox as the native `maxBounds`, and the one the min-zoom
// floor is fitted to. Wider than MAP_MAX_BOUNDS purely so the user can zoom OUT
// further and see more of the coast; panning is still restricted to
// MAP_MAX_BOUNDS by the custom clamp. Kept inside the animated water mesh's
// coverage (SEA_COVER in scripts/generate-water-geometry.ts) so pulling back
// never reveals the edge of the water, and matches the bbox generate-roads.ts
// already fetches, so road data reaches these edges too.
// ~1.7x MAP_MAX_BOUNDS about the same centre. Deliberately NOT the full road /
// SEA_COVER bbox: fitting to that pulled the floor out to the whole UAE and ran
// the viewport past the generated water geometry, which showed as pale seams.
export const ZOOM_OUT_BOUNDS = {
  // Zoom-out extent + native maxBounds. Kept ~0.02° outside MAP_MAX_BOUNDS on
  // every side (so the custom clamp isn't fighting the native one) and inside the
  // water mesh's SEA_COVER limits (west 54.51 / south 24.41 / east 56.03 /
  // north 25.93) so pulling back never reveals the mesh edge.
  south: 24.46,
  west: 54.55,
  north: 25.91,
  east: 56.01,
};

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
