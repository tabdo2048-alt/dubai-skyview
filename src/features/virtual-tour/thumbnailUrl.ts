import { TOUR_STORAGE_BUCKETS } from "./constants";
import { resolveTourAssetUrl } from "./tourAssetUrl";

export function resolveTourThumbnailUrl(value: string | null | undefined): Promise<string> {
  return resolveTourAssetUrl(value, TOUR_STORAGE_BUCKETS.thumbnails, "thumbnail");
}
