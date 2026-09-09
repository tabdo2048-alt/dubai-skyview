import { Cesium3DTileset, type Viewer } from "cesium";

/** Keeps 3D Tiles loading lifecycle out of React and destroys GPU resources on unload. */
export class CesiumTilesetManager {
  private readonly tilesets = new Map<string, Cesium3DTileset>();
  private readonly pending = new Map<string, Promise<Cesium3DTileset>>();

  constructor(private readonly viewer: Viewer) {}

  async load(key: string, url: string) {
    const existing = this.tilesets.get(key);
    if (existing) return existing;
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const task = Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: this.viewer.canvas.clientWidth < 768 ? 24 : 12,
      cacheBytes: this.viewer.canvas.clientWidth < 768 ? 48 * 1024 * 1024 : 128 * 1024 * 1024,
      maximumCacheOverflowBytes: 32 * 1024 * 1024,
      cullWithChildrenBounds: true,
      preloadWhenHidden: false,
      preloadFlightDestinations: false,
      skipLevelOfDetail: true,
    }).then((tileset) => {
      this.pending.delete(key);
      this.tilesets.set(key, tileset);
      this.viewer.scene.primitives.add(tileset);
      this.viewer.scene.requestRender();
      return tileset;
    });
    this.pending.set(key, task);
    return task;
  }

  get(key: string) {
    return this.tilesets.get(key);
  }

  unload(key: string) {
    const tileset = this.tilesets.get(key);
    if (!tileset) return;
    this.viewer.scene.primitives.remove(tileset);
    this.tilesets.delete(key);
    this.viewer.scene.requestRender();
  }

  destroy() {
    for (const key of [...this.tilesets.keys()]) this.unload(key);
    this.pending.clear();
  }
}

