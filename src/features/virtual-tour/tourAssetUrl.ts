import { supabase } from "@/integrations/supabase/client";
import { safeHttpUrl } from "@/lib/utils";

export const TOUR_ASSET_SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000;
const signedAssetCache = new Map<string, { url: string; expiresAt: number }>();

function bucketMarkers(bucket: string) {
  return {
    publicMarker: `/object/public/${bucket}/`,
    signedMarker: `/object/sign/${bucket}/`,
  };
}

export function tourAssetStoragePathFromValue(value: string, bucket: string): string | null {
  const { publicMarker, signedMarker } = bucketMarkers(bucket);
  const marker = value.includes(publicMarker)
    ? publicMarker
    : value.includes(signedMarker)
      ? signedMarker
      : null;
  const encoded = marker ? value.slice(value.indexOf(marker) + marker.length).split("?")[0] : value;

  try {
    const path = decodeURIComponent(encoded).replace(new RegExp(`^${bucket}/`), "");
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export async function resolveTourAssetUrl(
  value: string | null | undefined,
  bucket: string,
  assetName: string,
): Promise<string> {
  if (!value?.trim()) throw new Error(`${assetName} URL is missing.`);
  const normalized = value.trim();
  const { publicMarker, signedMarker } = bucketMarkers(bucket);
  const belongsToBucket = normalized.includes(publicMarker) || normalized.includes(signedMarker);
  const external = safeHttpUrl(normalized);

  // External CDN assets remain supported. URLs that belong to our private
  // buckets are always re-signed instead of trusting a stored signature.
  if (external && !belongsToBucket) return external;

  const path = tourAssetStoragePathFromValue(normalized, bucket);
  if (!path) throw new Error(`${assetName} storage path is invalid.`);
  const cacheKey = `${bucket}:${path}`;
  const cached = signedAssetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) signedAssetCache.delete(cacheKey);

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, TOUR_ASSET_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`Could not create a signed ${assetName} URL.`);

  signedAssetCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
  });
  return data.signedUrl;
}
