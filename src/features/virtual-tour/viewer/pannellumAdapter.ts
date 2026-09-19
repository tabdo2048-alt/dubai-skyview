export interface PannellumViewer {
  destroy(): void;
  getYaw(): number;
  getPitch(): number;
  getHfov(): number;
  mouseEventToCoords(event: MouseEvent): [number, number];
  loadScene(sceneId: string, pitch?: number, yaw?: number, hfov?: number): PannellumViewer;
  toggleFullscreen(): PannellumViewer;
  addHotSpot(config: Record<string, unknown>, sceneId?: string): PannellumViewer;
  removeHotSpot(hotspotId: string, sceneId?: string): boolean;
  on(event: "load", handler: () => void): PannellumViewer;
  on(event: "error", handler: (message: string) => void): PannellumViewer;
  off(event?: string, handler?: (...args: never[]) => void): PannellumViewer;
}

interface PannellumApi {
  viewer(container: HTMLElement, config: Record<string, unknown>): PannellumViewer;
}

declare global {
  interface Window {
    pannellum?: PannellumApi;
  }
}

let corePromise: Promise<PannellumApi> | null = null;
const renderedHotspotIds = new WeakMap<PannellumViewer, Set<string>>();

async function loadPannellumCore(): Promise<PannellumApi> {
  if (typeof window === "undefined") throw new Error("Pannellum is client-only.");
  if (!corePromise) {
    corePromise = Promise.all([
      import("pannellum/build/pannellum.css"),
      import("./hotspots.css"),
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

export interface PannellumHotspot {
  id: string;
  pitch: number;
  yaw: number;
  type: string;
  label: string;
  ariaLabel: string;
  onActivate: () => void;
}

export interface PannellumCameraState {
  yaw: number;
  pitch: number;
  hfov: number;
}

interface AccessibleHotspotArgs {
  label: string;
  ariaLabel: string;
}

function createAccessibleHotspot(element: HTMLDivElement, args: AccessibleHotspotArgs): void {
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", args.ariaLabel);

  const label = document.createElement("span");
  label.className = "tour-hotspot__label";
  label.textContent = args.label;
  element.appendChild(label);

  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    element.click();
  });
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
  renderedHotspotIds.set(viewer, new Set());
  return viewer;
}

export function setPannellumHotspots(viewer: PannellumViewer, hotspots: PannellumHotspot[]): void {
  const previousIds = renderedHotspotIds.get(viewer) ?? new Set<string>();
  for (const id of previousIds) viewer.removeHotSpot(id);

  const nextIds = new Set<string>();
  for (const hotspot of hotspots) {
    viewer.addHotSpot({
      id: hotspot.id,
      pitch: hotspot.pitch,
      yaw: hotspot.yaw,
      cssClass: "tour-hotspot tour-hotspot--" + hotspot.type,
      createTooltipFunc: createAccessibleHotspot,
      createTooltipArgs: {
        label: hotspot.label,
        ariaLabel: hotspot.ariaLabel,
      },
      clickHandlerFunc: hotspot.onActivate,
    });
    nextIds.add(hotspot.id);
  }
  renderedHotspotIds.set(viewer, nextIds);
}

export function clearPannellumHotspots(viewer: PannellumViewer): void {
  const ids = renderedHotspotIds.get(viewer);
  if (!ids) return;
  for (const id of ids) viewer.removeHotSpot(id);
  ids.clear();
}

export function getPannellumCamera(viewer: PannellumViewer): PannellumCameraState {
  return { yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov() };
}

export function pannellumCoordinatesFromMouseEvent(
  viewer: PannellumViewer,
  event: MouseEvent,
): { pitch: number; yaw: number } {
  const [pitch, yaw] = viewer.mouseEventToCoords(event);
  if (!Number.isFinite(pitch) || !Number.isFinite(yaw)) {
    throw new Error("تعذر تحديد موضع Hotspot.");
  }
  return { pitch, yaw };
}

export function destroyPannellumViewer(viewer: PannellumViewer | null): void {
  if (!viewer) return;
  clearPannellumHotspots(viewer);
  renderedHotspotIds.delete(viewer);
  viewer.off();
  viewer.destroy();
}

export function supportsFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  return Boolean(
    document.fullscreenEnabled || element.requestFullscreen || element.webkitRequestFullscreen,
  );
}
