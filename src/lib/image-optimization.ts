const FULL_MAX_DIMENSION = 1920;
const THUMB_MAX_DIMENSION = 480;
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.72;

export type OptimizedProjectImage = {
  full: File;
  thumbnail: File | null;
};

/**
 * Convert an uploaded raster image to a reasonably sized WebP (or JPEG when
 * WebP encoding is unavailable), plus a small WebP thumbnail for lists/maps.
 * The original File is retained as a safe fallback if the browser cannot
 * decode or encode the image.
 */
export async function optimizeProjectImage(file: File): Promise<OptimizedProjectImage> {
  try {
    const source = await loadImage(file);
    const full = await renderImage(source, FULL_MAX_DIMENSION, FULL_QUALITY, file.name);
    const thumbnail = await renderImage(source, THUMB_MAX_DIMENSION, THUMB_QUALITY, file.name, true);
    source.cleanup();

    return {
      full: full ?? file,
      thumbnail,
    };
  } catch {
    // Uploading the original is preferable to making an otherwise valid admin
    // upload fail because a particular browser lacks an image API.
    return { full: file, thumbnail: null };
  }
}

/** Derive the generated thumbnail object name from its original object path. */
export function thumbnailPathFromStoragePath(path: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}-thumb.webp`;
}

type LoadedImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  cleanup: () => void;
};

async function loadImage(file: File): Promise<LoadedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to decode image"));
      element.src = objectUrl;
    });

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function renderImage(
  source: LoadedImage,
  maxDimension: number,
  quality: number,
  originalName: string,
  thumbnail = false,
): Promise<File | null> {
  if (!source.width || !source.height) return null;

  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  source.draw(context, width, height);

  const blob = await canvasToBlob(canvas, quality);
  if (!blob) return null;
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const base = originalName.replace(/\.[^/.]+$/, "") || "project-image";
  const suffix = thumbnail ? "-thumb" : "";
  return new File([blob], `${base}${suffix}.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (webp) return webp;
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
