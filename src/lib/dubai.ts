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

// Pan/zoom limit for the map (maxBounds). Wider than DUBAI_BOUNDS so the whole
// emirate can be framed at min zoom without the viewport being clamped against
// the bounds, yet held inside the water coverage rectangle (see SEA_COVER in
// scripts/generate-water-geometry.ts) so no black sea shows at the edges.
export const MAP_MAX_BOUNDS = {
  south: 24.45,
  west: 54.53,
  north: 25.92,
  east: 56.02,
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
