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
  south: 24.82,
  west: 54.88,
  north: 25.32, // Al Nahda (Dubai–Sharjah border) is the NE-most point
  east: 55.58,
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
  south: 24.645,
  west: 54.635,
  north: 25.495,
  east: 55.825,
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

export const CATEGORIES = [
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" },
  { value: "townhouse", label: "Townhouse" },
  { value: "penthouse", label: "Penthouse" },
  { value: "studio", label: "Studio" },
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
