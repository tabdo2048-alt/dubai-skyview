// Signed-URL resolution for the private `project-media` bucket.
//
// The bucket used to be public, which meant every object was fetchable — and,
// because the storage read policy matched the whole bucket, listable — by anyone.
// It is now private, so `/object/public/...` no longer serves anything and each
// image has to be signed before it can be rendered.
//
// Stored values are NOT rewritten. project_images.url and projects.main_image_url
// still hold the original `/object/public/project-media/<path>` strings (and, for
// hand-entered rows, arbitrary external URLs). Resolution happens on read: a
// value that points at our bucket is exchanged for a signed URL, anything else is
// passed through untouched. That keeps the DB stable and means a value typed into
// the "Main image URL" field on an external host keeps working.
//
// Signing is permission-checked by Postgres: createSignedUrls only returns a URL
// for objects the caller may SELECT, so the storage policy is what decides who
// can see an unpublished project's media. Anonymous visitors can sign media for
// published projects only.
import { supabase } from "@/integrations/supabase/client";
import { safeHttpUrl } from "@/lib/utils";
import { thumbnailPathFromStoragePath } from "@/lib/image-optimization";

export const PROJECT_MEDIA_BUCKET = "project-media";

// How long a signed URL stays valid. One hour is short enough that a leaked link
// to a private project's media expires quickly, and long enough that a browsing
// session never sees an image break. See the caveat in resolveMediaUrls about
// what this means for og:image.
export const SIGNED_URL_TTL_SECONDS = 3600;

const PUBLIC_MARKER = `/object/public/${PROJECT_MEDIA_BUCKET}/`;
const SIGN_MARKER = `/object/sign/${PROJECT_MEDIA_BUCKET}/`;

/**
 * The object path inside `project-media` for a stored value, or null when the
 * value is not one of our objects (external URL, empty, already signed).
 */
export function storagePathFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  // Already a signed URL — leave it alone rather than signing a signature.
  if (value.includes(SIGN_MARKER)) return null;
  const index = value.indexOf(PUBLIC_MARKER);
  if (index === -1) return null;
  const path = value.slice(index + PUBLIC_MARKER.length).split("?")[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    // A malformed stored URL must not be able to crash the whole projects
    // query while media paths are being resolved.
    return null;
  }
}

/** Return the generated thumbnail path for one of our stored object URLs. */
export function storageThumbnailPathFromUrl(value: string | null | undefined): string | null {
  const path = storagePathFromUrl(value);
  return path ? thumbnailPathFromStoragePath(path) : null;
}

/**
 * Map each input value to something renderable: a signed URL for objects in our
 * bucket, the original string for anything else. Values the caller is not allowed
 * to read simply keep their original (dead) URL rather than throwing, so one
 * forbidden image cannot blank out a whole gallery.
 *
 * Caveat worth knowing: signed URLs expire, so a project page's og:image link
 * preview stops resolving after SIGNED_URL_TTL_SECONDS. Crawlers that fetch the
 * page at share time still get a working image; a much later re-crawl will not.
 */
export async function resolveMediaUrls(values: Array<string | null | undefined>): Promise<Map<string, string>> {
  return resolveStorageUrls(values, (value) => storagePathFromUrl(value));
}

/**
 * Resolve small generated thumbnails. Older objects do not have a thumbnail,
 * so those values fall back to their normal signed URL instead of breaking.
 */
export async function resolveMediaThumbnailUrls(values: Array<string | null | undefined>): Promise<Map<string, string>> {
  const out = await resolveStorageUrls(values, (value) => storageThumbnailPathFromUrl(value));
  const missing = values.filter((value) => {
    const path = storagePathFromUrl(value);
    return Boolean(value && path && out.get(value) === undefined);
  });
  if (missing.length) {
    const full = await resolveMediaUrls(missing);
    for (const value of missing) {
      if (value) out.set(value, full.get(value) ?? value);
    }
  }
  return out;
}

async function resolveStorageUrls(
  values: Array<string | null | undefined>,
  pathForValue: (value: string) => string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pathByValue = new Map<string, string>();

  for (const value of values) {
    if (!value || out.has(value) || pathByValue.has(value)) continue;
    const path = pathForValue(value);
    if (path) pathByValue.set(value, path);
    else out.set(value, value);
  }
  if (pathByValue.size === 0) return out;

  const values_ = [...pathByValue.keys()];
  const paths = values_.map((v) => pathByValue.get(v)!);

  const { data, error } = await supabase.storage
    .from(PROJECT_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    // Signing failed wholesale (offline, bucket missing). Leave storage values
    // unresolved so thumbnail callers can retry with the full object URL.
    return out;
  }

  data.forEach((row, i) => {
    const original = values_[i];
    if (row.signedUrl) out.set(original, row.signedUrl);
  });
  return out;
}

/**
 * Attach renderable signed URLs to a project's media.
 *
 * The stored values (`main_image_url`, `images[].url`) are deliberately left
 * UNTOUCHED and the signed variants are added alongside as `main_image_src` and
 * `images[].src`. Overwriting the originals would be actively harmful: the admin
 * form seeds its state from these fields and writes them back on save, so it
 * would persist an expiring signed URL into the database, and image deletion
 * (which recovers the object path from the stored URL) would stop finding the
 * file and leave orphans in the bucket.
 *
 * Render with `mediaSrc(...)`; persist and delete using the original field.
 */
export async function withSignedProjectMedia<
  T extends { main_image_url?: string | null; images?: Array<{ url: string }> | null },
>(
  projects: T[],
  options: { includeGallery?: boolean; thumbnailsOnly?: boolean } = {},
): Promise<Array<T & SignedMedia>> {
  const includeGallery = options.includeGallery ?? true;
  const thumbnailsOnly = options.thumbnailsOnly ?? false;
  const mainValues: Array<string | null | undefined> = projects.map((project) => project.main_image_url);
  const galleryValues: Array<string | null | undefined> = includeGallery
    ? projects.flatMap((project) => (project.images ?? []).map((image) => image.url))
    : [];
  const fullValues = thumbnailsOnly ? [] : [...mainValues, ...galleryValues];
  const thumbValues = thumbnailsOnly ? mainValues : [...mainValues, ...galleryValues];

  const [resolved, thumbnails] = await Promise.all([
    fullValues.some(Boolean) ? resolveMediaUrls(fullValues) : Promise.resolve(new Map<string, string>()),
    thumbValues.some(Boolean) ? resolveMediaThumbnailUrls(thumbValues) : Promise.resolve(new Map<string, string>()),
  ]);
  const pick = (map: Map<string, string>, value: string | null | undefined) =>
    value ? (map.get(value) ?? value) : null;

  return projects.map((p) => ({
    ...p,
    main_image_src: thumbnailsOnly ? null : pick(resolved, p.main_image_url),
    main_image_thumb_src: pick(thumbnails, p.main_image_url),
    images: includeGallery
      ? (p.images ?? []).map((img) => ({
          ...img,
          src: pick(resolved, img.url) ?? img.url,
          thumb_src: pick(thumbnails, img.url) ?? img.url,
        }))
      : [],
  })) as Array<T & SignedMedia>;
}

export type SignedMedia = {
  main_image_src: string | null;
  main_image_thumb_src: string | null;
  images: Array<{ url: string; src: string; thumb_src: string } & Record<string, unknown>>;
};

/** Prefer the signed URL, fall back to whatever was stored. */
export const mediaSrc = (
  signed: string | null | undefined,
  original: string | null | undefined,
): string => safeHttpUrl(signed) ?? safeHttpUrl(original) ?? "";
