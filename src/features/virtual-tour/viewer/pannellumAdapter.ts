export interface PannellumViewer {
  destroy(): void;
  getYaw(): number;
  getPitch(): number;
  getHfov(): number;
  loadScene(sceneId: string, pitch?: number, yaw?: number, hfov?: number): PannellumViewer;
  toggleFullscreen(): PannellumViewer;
  on(event: "load", handler: () => void): PannellumViewer;
  on(event: "error", handler: (message: string) => void): PannellumViewer;
  off(event?: string, handler?: (...args: never[]) => void): PannellumViewer;
}
interface PannellumApi {
  viewer(
    container: HTMLElement,
    config: Record<string, unknown>,
  ): PannellumViewer;
}

declare global {
  interface Window {
    pannellum?: PannellumApi;
  }
}

let corePromise: Promise<PannellumApi> | null = null;

async function loadPannellumCore(): Promise<PannellumApi> {
  if (typeof window === "undefined") throw new Error("Pannellum is client-only.");
  if (!corePromise) {
    corePromise = Promise.all([
      import("pannellum/build/pannellum.css"),
      import("pannellum"),
    ]).then(() => {
      if (!window.pannellum) throw new Error("Pannellum failed to initialize.");
      return window.pannellum;
    });
  }
  return corePromise;
}

export interface CreatePannellumViewerOptions {
  panoramaUrl: string;
  yaw?: number | null;
  pitch?: number | null;
  hfov?: number | null;
  onLoad: () => void;
  onError: (message: string) => void;
}

export async function createPannellumViewer(
  container: HTMLElement,
  options: CreatePannellumViewerOptions,
): Promise<PannellumViewer> {
  const pannellum = await loadPannellumCore();
  const viewer = pannellum.viewer(container, {
    type: "equirectangular",
    panorama: options.panoramaUrl,
    autoLoad: true,
    yaw: options.yaw ?? 0,
    pitch: options.pitch ?? 0,
    hfov: options.hfov ?? 100,
    draggable: true,
    mouseZoom: true,
    showControls: true,
    showFullscreenCtrl: false,
    sceneFadeDuration: 250,
    escapeHTML: true,
    crossOrigin: "anonymous",
  });
  viewer.on("load", options.onLoad);
  viewer.on("error", options.onError);
  return viewer;
}

export function destroyPannellumViewer(viewer: PannellumViewer | null): void {
  if (!viewer) return;
  viewer.off();
  viewer.destroy();
}

export function supportsFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  return Boolean(document.fullscreenEnabled || element.requestFullscreen || element.webkitRequestFullscreen);
}
