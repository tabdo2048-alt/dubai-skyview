import type { ProjectUnitTypeRow } from "@/lib/types";

export type DisplayUnitType = Pick<
  ProjectUnitTypeRow,
  "id" | "label" | "price_aed" | "area_sqm_min" | "area_sqm_max" | "sort_order"
>;

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
    sort_order: 0,
  }];
}

export function pricedUnitTypes(items: DisplayUnitType[]): DisplayUnitType[] {
  return sortUnitTypes(items).filter((item) => Number.isFinite(item.price_aed) && (item.price_aed ?? 0) > 0);
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
