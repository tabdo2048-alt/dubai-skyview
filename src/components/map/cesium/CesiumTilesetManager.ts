import { Cesium3DTileset, type Viewer } from "cesium";

/** Owns GPU resources and invalidates pending requests on unload/disposal. */
export class CesiumTilesetManager {
  private readonly tilesets = new Map<string, Cesium3DTileset>();
  private readonly pending = new Map<string, Promise<Cesium3DTileset>>();
  private readonly epochs = new Map<string, number>();
  private destroyed = false;
  constructor(private readonly viewer: Viewer) {}

  async load(key: string, url: string) {
    const existing = this.tilesets.get(key);
    if (existing) return existing;
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const epoch = this.epochs.get(key) ?? 0;
    const mobile = this.viewer.canvas.clientWidth < 768;
    const task = Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: mobile ? 24 : 12,
      cacheBytes: (mobile ? 32 : 64) * 1024 * 1024,
      maximumCacheOverflowBytes: 16 * 1024 * 1024,
      cullWithChildrenBounds: true,
      show: false,
      preloadWhenHidden: true,
      preloadFlightDestinations: false,
      skipLevelOfDetail: true,
    })
      .then((tileset) => {
        if (this.destroyed || this.viewer.isDestroyed() || (this.epochs.get(key) ?? 0) !== epoch) {
          tileset.destroy();
          throw new Error("Project tileset load cancelled");
        }
        this.tilesets.set(key, tileset);
        this.viewer.scene.primitives.add(tileset);
        this.viewer.scene.requestRender();
        return tileset;
      })
      .finally(() => {
        if (this.pending.get(key) === task) this.pending.delete(key);
      });
    this.pending.set(key, task);
    return task;
  }
  get(key: string) {
    return this.tilesets.get(key);
  }
  unload(key: string) {
    this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
    this.pending.delete(key);
    const tileset = this.tilesets.get(key);
    if (tileset && !this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(tileset);
    this.tilesets.delete(key);
  }
  destroy() {
    this.destroyed = true;
    for (const key of new Set([...this.tilesets.keys(), ...this.pending.keys()])) this.unload(key);
  }
}
