import { supabase } from "@/integrations/supabase/client";
import { safeHttpUrl } from "@/lib/utils";
import { TOUR_STORAGE_BUCKETS } from "./constants";

export const TOUR_SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_CACHE_MS = 50 * 60 * 1000;
const signedPanoramaCache = new Map<string, { url: string; expiresAt: number }>();
const BUCKET = TOUR_STORAGE_BUCKETS.panoramas;
const PUBLIC_MARKER = `/object/public/${BUCKET}/`;
const SIGNED_MARKER = `/object/sign/${BUCKET}/`;

export function panoramaStoragePathFromValue(value: string): string | null {
  const marker = value.includes(PUBLIC_MARKER)
    ? PUBLIC_MARKER
    : value.includes(SIGNED_MARKER)
      ? SIGNED_MARKER
      : null;
  const encoded = marker ? value.slice(value.indexOf(marker) + marker.length).split("?")[0] : value;
  try {
    const path = decodeURIComponent(encoded).replace(/^tour-panoramas\//, "");
    if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export async function resolvePanoramaUrl(value: string | null | undefined): Promise<string> {
  if (!value?.trim()) throw new Error("Panorama URL is missing.");
  const normalized = value.trim();

  // External CDN panoramas remain supported, but unsafe schemes never reach
  // Pannellum. Our own bucket URLs are always re-signed instead of trusting a
  // stored, expiring signature.
  const external = safeHttpUrl(normalized);
  const belongsToTourBucket = normalized.includes(PUBLIC_MARKER) || normalized.includes(SIGNED_MARKER);
  if (external && !belongsToTourBucket) return external;

  const path = panoramaStoragePathFromValue(normalized);
  if (!path) throw new Error("Panorama storage path is invalid.");
  const cached = signedPanoramaCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) signedPanoramaCache.delete(path);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TOUR_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("Could not create a signed panorama URL.");
  signedPanoramaCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
  });
  return data.signedUrl;
}
