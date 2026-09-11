import {
  ClippingPolygonCollection,
  createGooglePhotorealistic3DTileset,
  IonResource,
  Cesium3DTileset,
  type Viewer,
} from "cesium";
import { isConstrainedCesiumDevice } from "./CesiumSceneController";
import { CesiumBuildingInserts } from "./CesiumBuildingInserts";
import type { PhotorealisticConfig } from "./photorealisticConfig";
import type { ProjectWithRelations } from "@/lib/types";

type CityLoader = (
  config: PhotorealisticConfig,
  options: Cesium3DTileset.ConstructorOptions,
) => Promise<Cesium3DTileset>;
// Prefer the configured ion account, matching the official Building Insert flow.
// A stale direct Google key must not override an authorized ion asset.
const loadCity: CityLoader = async (config, options) =>
  config.ionToken
    ? Cesium3DTileset.fromUrl(
        await IonResource.fromAssetId(2275207, { accessToken: config.ionToken }),
        options,
      )
    : createGooglePhotorealistic3DTileset(
        { key: config.googleKey, onlyUsingWithGoogleGeocoder: true },
        options,
      );

export type CityState = "loading" | "photorealistic" | "masterplan";

/** One streaming city per Viewer lifetime, no React filter dependencies or automatic retry loop. */
export class CesiumPhotorealisticCity {
  private tileset: Cesium3DTileset | null = null;
  private inserts: CesiumBuildingInserts | null = null;
  private destroyed = false;
  private state: CityState = "loading";
  private removers: Array<() => void> = [];
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private failureQueued = false;
  private tileFailureWarned = false;
  private started = false;
  private readonly invalidPlots = new Set<string>();
  constructor(
    private readonly viewer: Viewer,
    private readonly config: PhotorealisticConfig,
    private readonly onState: (state: CityState, message: string | null) => void,
    private readonly dependencies = {
      load: loadCity,
      clippingSupported: ClippingPolygonCollection.isSupported,
    },
  ) {}

  async start() {
    if (this.started || this.destroyed) return;
    this.started = true;
    if (!this.config.enabled) return this.fallback(null);
    if (!this.config.googleKey && !this.config.ionToken)
      return this.fallback("Photorealistic credentials are missing. Showing Masterplan.");
    if (!this.dependencies.clippingSupported(this.viewer.scene))
      return this.fallback("This device cannot support building inserts. Showing Masterplan.");
    this.onState("loading", "Loading photorealistic city…");
    this.timeout = setTimeout(
      () => this.queueFallback("Photorealistic tiles did not arrive in time. Showing Masterplan."),
      30_000,
    );
    try {
      const mobile = isConstrainedCesiumDevice();
      const options = {
        maximumScreenSpaceError: mobile ? 24 : 12,
        cacheBytes: (mobile ? 128 : 384) * 1024 * 1024,
        maximumCacheOverflowBytes: (mobile ? 32 : 96) * 1024 * 1024,
        dynamicScreenSpaceError: true,
        showCreditsOnScreen: true,
        preloadFlightDestinations: false,
        preloadWhenHidden: false,
        enableCollision: true,
      };
      // Direct Google browser key uses the official factory. With ion, use the
      // factory's documented asset 2275207 with an explicit per-request token;
      // this avoids global default-token / cached-resource cross-viewer leakage.
      const tileset = await this.dependencies.load(this.config, options);
      if (this.destroyed || this.state === "masterplan" || this.viewer.isDestroyed()) {
        tileset.destroy();
        return;
      }
      this.tileset = this.viewer.scene.primitives.add(tileset);
      this.inserts = new CesiumBuildingInserts(
        this.viewer,
        tileset,
        this.config.projectInsertPaddingMeters,
      );
      this.removers.push(
        tileset.tileVisible.addEventListener(() => {
          if (this.state !== "loading") return;
          // Events during traversal must not mutate the scene primitive collection.
          queueMicrotask(() => {
            if (this.destroyed || this.state !== "loading" || this.failureQueued) return;
            clearTimeout(this.timeout);
            this.state = "photorealistic";
            this.viewer.scene.globe.show = false;
            this.onState(this.state, null);
            this.viewer.scene.requestRender();
          });
        }),
      );
      this.removers.push(
        tileset.tileFailed.addEventListener(() => {
          // A streamed city contains many independent child tiles. One missing or
          // transiently failed child must not tear down an otherwise healthy city.
          // If no tile ever becomes visible, the startup timeout below still
          // switches to Masterplan after 30 seconds.
          if (this.destroyed || this.state === "masterplan" || this.tileFailureWarned) return;
          this.tileFailureWarned = true;
          console.warn(
            "[Cesium] A photorealistic child tile failed; keeping the available Google city.",
          );
        }),
      );
      this.viewer.scene.requestRender();
    } catch {
      // Do not print provider errors: their request URLs may contain API keys.
      if (!this.destroyed)
        this.fallback(
          "Photorealistic access failed. Check credentials, quota and network. Showing Masterplan.",
        );
    }
  }
  activate(project: { id: string; plot_geometry: unknown }) {
    if (this.state === "masterplan") return true;
    if (this.state !== "photorealistic") return false;
    const activated = Boolean(this.inserts?.activate(project));
    if (!activated && !this.invalidPlots.has(project.id)) {
      this.invalidPlots.add(project.id);
      this.onState(
        this.state,
        "A developer model needs a valid project plot before it can replace the city. Original city retained.",
      );
    }
    return activated;
  }
  deactivate(projectId: string) {
    this.inserts?.deactivate(projectId);
  }
  private queueFallback(message: string) {
    if (this.destroyed || this.state === "masterplan" || this.failureQueued) return;
    this.failureQueued = true;
    queueMicrotask(() => {
      if (!this.destroyed) this.fallback(message);
    });
  }
  private fallback(message: string | null) {
    if (this.destroyed || this.viewer.isDestroyed()) return;
    this.state = "masterplan";
    this.release();
    this.viewer.scene.globe.show = true;
    if (message) console.warn(`[Cesium] ${message}`);
    this.onState(this.state, message);
    this.viewer.scene.requestRender();
  }
  private release() {
    clearTimeout(this.timeout);
    this.removers.splice(0).forEach((remove) => remove());
    this.inserts?.clear();
    this.inserts = null;
    if (this.tileset && !this.viewer.isDestroyed())
      this.viewer.scene.primitives.remove(this.tileset);
    this.tileset = null;
  }
  destroy() {
    this.destroyed = true;
    this.release();
  }
}
