import type { VirtualTourRow } from "./types";
import type { TourScope } from "./types";

export function resolveTourScope(tour: Pick<VirtualTourRow, "building_id" | "unit_id">): TourScope {
  if (tour.unit_id) return "unit";
  if (tour.building_id) return "building";
  return "project";
}

export function tourScopeLabel(scope: TourScope): string {
  if (scope === "building") return "جولة البرج";
  if (scope === "unit") return "جولة الوحدة";
  return "جولة المشروع";
}

export function tourScopeIds(
  scope: TourScope,
  values: { buildingId?: string | null; unitId?: string | null },
): { building_id: string | null; unit_id: string | null } {
  if (scope === "unit") {
    return {
      building_id: values.buildingId || null,
      unit_id: values.unitId || null,
    };
  }
  if (scope === "building") {
    return { building_id: values.buildingId || null, unit_id: null };
  }
  return { building_id: null, unit_id: null };
}
