/** Browser configuration only. No server credentials belong here. */
export type PhotorealisticConfig = {
  enabled: boolean;
  googleKey?: string;
  ionToken?: string;
  projectInsertPaddingMeters: number;
};

export function readPhotorealisticConfig(
  env: Record<string, unknown>,
  ionToken?: string,
): PhotorealisticConfig {
  const padding = Number(env.VITE_PROJECT_INSERT_PADDING_METERS ?? 2);
  return {
    enabled: String(env.VITE_ENABLE_GOOGLE_PHOTOREALISTIC ?? "false").trim().toLowerCase() === "true",
    googleKey:
      typeof env.VITE_GOOGLE_MAP_TILES_API_KEY === "string"
        ? env.VITE_GOOGLE_MAP_TILES_API_KEY.trim() || undefined
        : undefined,
    ionToken: ionToken?.trim() || undefined,
    projectInsertPaddingMeters: Number.isFinite(padding) ? Math.max(0, Math.min(20, padding)) : 2,
  };
}

export const PROJECT_STREAMING = {
  preloadMeters: 6_000,
  unloadMeters: 9_000,
  visibleMeters: 3_000,
  hideMeters: 4_000,
  desktopModels: 6,
  mobileModels: 3,
  concurrentLoads: 2,
  retryDelayMs: 60_000,
  loadTimeoutMs: 60_000,
} as const;

export function modelDistanceState(
  distance: number,
  selected: boolean,
  resident: boolean,
  visible: boolean,
) {
  return {
    load:
      selected ||
      distance <= (resident ? PROJECT_STREAMING.unloadMeters : PROJECT_STREAMING.preloadMeters),
    show:
      selected ||
      distance <= (visible ? PROJECT_STREAMING.hideMeters : PROJECT_STREAMING.visibleMeters),
  };
}
