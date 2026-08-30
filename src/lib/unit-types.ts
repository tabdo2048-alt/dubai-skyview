import type { ProjectUnitTypeImageRow, ProjectUnitTypeRow } from "@/lib/types";

export type DisplayUnitType = Pick<
  ProjectUnitTypeRow,
  "id" | "label" | "price_aed" | "area_sqm_min" | "area_sqm_max" | "floor" | "floor_plan_url" | "sort_order"
> & {
  floor_plan_src?: string | null;
  images?: Array<ProjectUnitTypeImageRow & { src?: string; thumb_src?: string }>;
};

export function sortUnitTypes(items: DisplayUnitType[]): DisplayUnitType[] {
  return [...items].sort((a, b) => {
    const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (order) return order;
    const aPrice = a.price_aed ?? Number.MAX_SAFE_INTEGER;
    const bPrice = b.price_aed ?? Number.MAX_SAFE_INTEGER;
    return aPrice - bPrice;
  });
}

/** Use the legacy price only when a project has not got any unit rows yet. */
export function displayUnitTypes(
  unitTypes: DisplayUnitType[] | null | undefined,
  legacyPrice: number | null | undefined,
): DisplayUnitType[] {
  const sorted = sortUnitTypes(unitTypes ?? []);
  if (sorted.length || legacyPrice == null) return sorted;
  return [{
    id: "legacy-starting-price",
    label: "Starting",
    price_aed: legacyPrice,
    area_sqm_min: null,
    area_sqm_max: null,
    floor: null,
    floor_plan_url: null,
    sort_order: 0,
  }];
}

export function pricedUnitTypes(items: DisplayUnitType[]): DisplayUnitType[] {
  return sortUnitTypes(items).filter((item) => Number.isFinite(item.price_aed) && (item.price_aed ?? 0) > 0);
}

/**
 * Build a readable, stable unit URL segment. The UUID remains accepted by the
 * detail loader for backwards compatibility, but new links use project,
 * developer, and unit names instead.
 */
export function unitDetailSlug(parts: {
  projectName?: string | null;
  projectSlug?: string | null;
  developerName?: string | null;
  developerSlug?: string | null;
  unitLabel: string;
}): string {
  const project = slugPart(parts.projectName) || slugPart(parts.projectSlug);
  const developer = slugPart(parts.developerName) || slugPart(parts.developerSlug);
  const unit = slugPart(parts.unitLabel);
  return [project, developer, unit].filter(Boolean).join("-") || "unit";
}

function slugPart(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ?? "";
}

export function lowestUnitPrice(
  unitTypes: DisplayUnitType[] | null | undefined,
  legacyPrice?: number | null,
): number | null {
  const prices = pricedUnitTypes(displayUnitTypes(unitTypes, legacyPrice)).map((item) => item.price_aed!);
  return prices.length ? Math.min(...prices) : null;
}

export function highestUnitPrice(
  unitTypes: DisplayUnitType[] | null | undefined,
  legacyPrice?: number | null,
): number | null {
  const prices = pricedUnitTypes(displayUnitTypes(unitTypes, legacyPrice)).map((item) => item.price_aed!);
  return prices.length ? Math.max(...prices) : null;
}

// Areas are stored in square metres (see
// supabase/migrations/20260818000000_unit_area_square_meters.sql). The unit is
// spelled with the superscript ² rather than "sqm" so the figure reads the same
// way it does on a Dubai listing sheet.
export function areaLabel(item: DisplayUnitType): string | null {
  const min = item.area_sqm_min;
  const max = item.area_sqm_max;
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? `${min.toLocaleString()} m²` : `${min.toLocaleString()}–${max.toLocaleString()} m²`;
  return min != null ? `From ${min.toLocaleString()} m²` : `Up to ${max!.toLocaleString()} m²`;
}
