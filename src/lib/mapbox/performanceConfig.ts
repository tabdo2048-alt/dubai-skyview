/**
 * Performance tuning for map rendering and detail loading.
 * Optimized for smooth interactions at various zoom levels.
 */

// Zoom-based layer visibility and detail thresholds
export const ZOOM_THRESHOLDS = {
  // Projects and markers
  PROJECTS_MIN_ZOOM: 10,
  PROJECTS_SHOW_LABELS: 11.5,

  // Metro/Train stations
  STATIONS_MIN_ZOOM: 11.5,
  STATIONS_DETAILED_MIN_ZOOM: 13,

  // Detail visibility
  DETAIL_LABELS_MIN_ZOOM: 12.5,
  POI_MIN_ZOOM: 13,
} as const;

// Layer opacity curves (zoom → opacity) for smooth detail fading
export const OPACITY_CURVES = {
  projects: (zoom: number) => {
    // Fade in projects at zoom 10-11
    if (zoom < 10) return 0;
    if (zoom > 11) return 1;
    return (zoom - 10) / 1;
  },

  stations: (zoom: number) => {
    // Fade in stations at zoom 11.5-12.5
    if (zoom < 11.5) return 0;
    if (zoom > 12.5) return 1;
    return (zoom - 11.5);
  },

  labels: (zoom: number) => {
    // Fade in labels at zoom 12.5-13.5
    if (zoom < 12.5) return 0;
    if (zoom > 13.5) return 1;
    return (zoom - 12.5);
  },
} as const;

// Render optimization settings
export const RENDER_CONFIG = {
  // Time before attempting to render custom layers (ms)
  CUSTOM_LAYER_INIT_DELAY: 320,

  // Chunk size for processing water polygons (lower = more responsive but slower overall)
  WATER_CHUNK_PROCESS_MS: 4, // ms per chunk

  // Whether to enable render loop throttling on mobile
  MOBILE_THROTTLE_ENABLED: true,

  // Target FPS for throttled rendering (mobile)
  MOBILE_TARGET_FPS: 30,

  // Desktop FPS limit (0 = unlimited, use browser requestAnimationFrame)
  DESKTOP_MAX_FPS: 60,

  // Whether to pause render loops when tab is hidden
  PAUSE_WHEN_HIDDEN: true,
} as const;

// Asset loading priorities (lower = higher priority)
export const LOAD_PRIORITIES = {
  STYLE: 0,
  METRO_LAYERS: 1,
  ROADS_LAYERS: 2,
  WATER_LAYER: 3,
  VESSELS_LAYER: 4,
} as const;

// Determines if a zoom level should trigger detail loading
export function shouldShowDetail(zoom: number, detailType: keyof typeof ZOOM_THRESHOLDS): boolean {
  const threshold = ZOOM_THRESHOLDS[detailType];
  return zoom >= threshold;
}

// Calculate opacity for a layer based on current zoom
export function getLayerOpacity(
  zoom: number,
  layerType: keyof typeof OPACITY_CURVES,
  baseOpacity: number = 1,
): number {
  const curve = OPACITY_CURVES[layerType];
  return Math.min(1, Math.max(0, curve(zoom) * baseOpacity));
}

// Mobile-optimized render interval (ms)
export function getRenderInterval(): number {
  if (!RENDER_CONFIG.MOBILE_THROTTLE_ENABLED) return 0;
  if (window.innerWidth >= 768) return 0; // Desktop: unlimited
  return 1000 / RENDER_CONFIG.MOBILE_TARGET_FPS;
}
