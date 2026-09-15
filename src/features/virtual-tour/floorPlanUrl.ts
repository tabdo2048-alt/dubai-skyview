import { TOUR_STORAGE_BUCKETS } from "./constants";
import {
  resolveTourAssetUrl,
  TOUR_ASSET_SIGNED_URL_TTL_SECONDS,
  tourAssetStoragePathFromValue,
} from "./tourAssetUrl";

const BUCKET = TOUR_STORAGE_BUCKETS.floorPlans;
export const FLOOR_PLAN_SIGNED_URL_TTL_SECONDS = TOUR_ASSET_SIGNED_URL_TTL_SECONDS;

export function floorPlanStoragePathFromValue(value: string): string | null {
  return tourAssetStoragePathFromValue(value, BUCKET);
}

export async function resolveFloorPlanUrl(value: string | null | undefined): Promise<string> {
  return resolveTourAssetUrl(value, BUCKET, "floor plan");
}
