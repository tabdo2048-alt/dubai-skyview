// Dubai geo constants shared across map surfaces.
export const DUBAI_CENTER = { lat: 25.1972, lng: 55.2744 }; // Downtown Dubai

// Emirate-scoped bounds so users can't pan out to other cities.
export const DUBAI_BOUNDS = {
  south: 24.79,
  west: 54.89,
  north: 25.55,
  east: 55.65,
};

export const DEFAULT_ZOOM = 12;
export const DEFAULT_PITCH = 60;
export const DEFAULT_BEARING = 30;

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
