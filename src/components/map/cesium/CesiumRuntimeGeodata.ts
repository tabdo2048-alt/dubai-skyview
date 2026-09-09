import type { Viewer } from "cesium";
import type { ProjectWithRelations } from "@/lib/types";
import { createCesiumCityBuildings } from "./CesiumCityBuildings";
import { createCesiumCommunitiesLayer } from "./CesiumCommunitiesLayer";
import { createCesiumRoadsLayer } from "./CesiumRoadsLayer";
import { createCesiumWaterLayer } from "./CesiumWaterLayer";
import type {
  RuntimeGeoJson,
  RuntimeGeodataChunk,
  RuntimeGeodataManifest,
  RuntimeLayerName,
} from "./types";

type ScenePrimitive = Parameters<Viewer["scene"]["primitives"]["add"]>[0];

type LoadedChunk = {
  definition: RuntimeGeodataChunk;
  primitives: Array<{ layer: RuntimeLayerName; value: ScenePrimitive }>;
};

function nearChunk(
  chunk: RuntimeGeodataChunk,
  longitude: number,
  latitude: number,
  cameraHeight: number,
) {
  const padding = Math.min(1.2, 0.08 + cameraHeight / 250_000);
  const [west, south, east, north] = chunk.bounds;
  return (
    longitude >= west - padding &&
    longitude <= east + padding &&
    latitude >= south - padding &&
    latitude <= north + padding
  );
}

async function fetchGeoJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json() as Promise<RuntimeGeoJson>;
}

/**
 * Loads deterministic geographic chunks around the camera and releases their GPU
 * resources when they are no longer relevant. The same manifest can later point
 * at externally hosted citywide chunks without changing the renderer.
 */
export class CesiumRuntimeGeodata {
  private manifest: RuntimeGeodataManifest | null = null;
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly pending = new Map<string, Promise<void>>();
  private destroyed = false;
  private roadsVisible = true;

  constructor(
    private readonly viewer: Viewer,
    private readonly getProjects: () => ProjectWithRelations[],
    private readonly onStatus?: (message: string | null) => void,
    private readonly manifestUrl = "/geodata/dubai-pilot/manifest.json",
  ) {}

  async start() {
    try {
      const response = await fetch(this.manifestUrl);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      this.manifest = (await response.json()) as RuntimeGeodataManifest;
      this.viewer.camera.moveEnd.addEventListener(this.refresh);
      await this.refresh();
      this.onStatus?.(null);
    } catch (error) {
      console.warn("[Cesium] Runtime Dubai geodata is unavailable", error);
      this.onStatus?.("Dubai pilot data is not generated yet. Run npm run geodata:pilot.");
    }
  }

  setRoadsVisible(visible: boolean) {
    this.roadsVisible = visible;
    for (const chunk of this.loaded.values()) {
      for (const primitive of chunk.primitives) {
        if (primitive.layer === "roads" && "show" in primitive.value) primitive.value.show = visible;
      }
    }
    this.viewer.scene.requestRender();
  }

  async reloadBuildings() {
    for (const [chunkId, loaded] of this.loaded) {
      for (const item of loaded.primitives.filter((primitive) => primitive.layer === "buildings")) {
        this.viewer.scene.primitives.remove(item.value);
      }
      loaded.primitives = loaded.primitives.filter((primitive) => primitive.layer !== "buildings");
      const url = loaded.definition.files.buildings;
      if (url) await this.addLayer(loaded, "buildings", url);
      this.loaded.set(chunkId, loaded);
    }
  }

  private refresh = async () => {
    if (!this.manifest || this.destroyed) return;
    const position = this.viewer.camera.positionCartographic;
    const longitude = (position.longitude * 180) / Math.PI;
    const latitude = (position.latitude * 180) / Math.PI;
    const desired = new Set(
      this.manifest.chunks
        .filter((chunk) => nearChunk(chunk, longitude, latitude, position.height))
        .map((chunk) => chunk.id),
    );

    for (const chunk of this.manifest.chunks) {
      if (desired.has(chunk.id) && !this.loaded.has(chunk.id) && !this.pending.has(chunk.id)) {
        const task = this.loadChunk(chunk).finally(() => this.pending.delete(chunk.id));
        this.pending.set(chunk.id, task);
      }
    }
    await Promise.all(this.pending.values());
    if (this.destroyed) return;
    for (const chunkId of [...this.loaded.keys()]) {
      if (!desired.has(chunkId)) this.unloadChunk(chunkId);
    }
  };

  private async loadChunk(definition: RuntimeGeodataChunk) {
    const loaded: LoadedChunk = { definition, primitives: [] };
    const entries = Object.entries(definition.files) as Array<[RuntimeLayerName, string]>;
    await Promise.all(entries.map(([layer, url]) => this.addLayer(loaded, layer, url)));
    if (this.destroyed) {
      for (const item of loaded.primitives) this.viewer.scene.primitives.remove(item.value);
      return;
    }
    this.loaded.set(definition.id, loaded);
    this.viewer.scene.requestRender();
  }

  private async addLayer(loaded: LoadedChunk, layer: RuntimeLayerName, url: string) {
    const data = await fetchGeoJson(url);
    if (this.destroyed) return;
    if (layer === "buildings") {
      const primitive = createCesiumCityBuildings(data, this.getProjects());
      if (primitive) this.addPrimitive(loaded, layer, primitive);
    } else if (layer === "water") {
      const primitive = createCesiumWaterLayer(data);
      if (primitive) this.addPrimitive(loaded, layer, primitive);
    } else if (layer === "communities") {
      const { fill, outline } = createCesiumCommunitiesLayer(data);
      if (fill) this.addPrimitive(loaded, layer, fill);
      if (outline) this.addPrimitive(loaded, layer, outline);
    } else if (layer === "roads") {
      const { ground, elevated } = createCesiumRoadsLayer(data);
      for (const primitive of [...ground, ...elevated]) {
        primitive.show = this.roadsVisible;
        this.addPrimitive(loaded, layer, primitive);
      }
    }
  }

  private addPrimitive(loaded: LoadedChunk, layer: RuntimeLayerName, value: ScenePrimitive) {
    this.viewer.scene.primitives.add(value);
    loaded.primitives.push({ layer, value });
  }

  private unloadChunk(chunkId: string) {
    const loaded = this.loaded.get(chunkId);
    if (!loaded) return;
    for (const primitive of loaded.primitives) this.viewer.scene.primitives.remove(primitive.value);
    this.loaded.delete(chunkId);
  }

  destroy() {
    this.destroyed = true;
    this.viewer.camera.moveEnd.removeEventListener(this.refresh);
    for (const chunkId of [...this.loaded.keys()]) this.unloadChunk(chunkId);
    this.pending.clear();
  }
}

