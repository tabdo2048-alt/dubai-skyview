import { clampToDubai, DUBAI_BOUNDS } from "../src/lib/dubai";
import assert from "node:assert/strict";
import {
  Event,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  type Viewer,
  type Cesium3DTileset,
} from "cesium";
import {
  readPhotorealisticConfig,
  modelDistanceState,
} from "../src/components/map/cesium/photorealisticConfig";
import {
  insertPolygons,
  CesiumBuildingInserts,
} from "../src/components/map/cesium/CesiumBuildingInserts";
import { CesiumPhotorealisticCity } from "../src/components/map/cesium/CesiumPhotorealisticCity";
import {
  pointInPolygon,
  validPlotGeometry,
} from "../src/components/map/cesium/CesiumProjectClipping";
import { detectProjectModelType } from "../src/components/map/cesium/projectModelTransforms";

const plot = {
  type: "Polygon",
  coordinates: [
    [
      [55, 25],
      [55.002, 25],
      [55.002, 25.001],
      [55.001, 25.001],
      [55.001, 25.002],
      [55, 25.002],
      [55, 25],
    ],
  ],
};
assert.equal(
  insertPolygons(
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    },
    2,
  ),
  null,
);
assert.equal(
  validPlotGeometry({
    type: "Polygon",
    coordinates: [
      [
        [NaN, 1],
        [2, 3],
        [4, 5],
        [NaN, 1],
      ],
    ],
  }),
  null,
);
assert.equal(
  validPlotGeometry({
    type: "Polygon",
    coordinates: [
      [
        [181, 1],
        [2, 3],
        [4, 5],
        [181, 1],
      ],
    ],
  }),
  null,
);
assert.equal(
  insertPolygons(
    {
      type: "Polygon",
      coordinates: [
        [
          [55, 25],
          [55.01, 25.01],
          [55, 25.01],
          [55.01, 25],
          [55, 25],
        ],
      ],
    },
    2,
  ),
  null,
  "self-intersections must never clip arbitrary city geometry",
);
const padded = insertPolygons(plot, 2)!;
assert.equal(padded.length, 1);
assert(pointInPolygon(55.0005, 25.0015, padded[0]));
assert(
  !pointInPolygon(55.0018, 25.0018, padded[0]),
  "concave notch must not be clipped like a bounding rectangle",
);
assert(pointInPolygon(54.99999, 25.0005, padded[0]), "padding must extend outside the source edge");
const withHole = {
  type: "Polygon",
  coordinates: [
    [
      [55, 25],
      [55.01, 25],
      [55.01, 25.01],
      [55, 25.01],
      [55, 25],
    ],
    [
      [55.003, 25.003],
      [55.003, 25.006],
      [55.006, 25.006],
      [55.006, 25.003],
      [55.003, 25.003],
    ],
  ],
};
assert.equal(insertPolygons(withHole, 2)![0].length, 2);
assert(
  !pointInPolygon(55.004, 25.004, insertPolygons(withHole, 2)![0]),
  "courtyard holes retained",
);
assert.equal(modelDistanceState(6500, false, false, false).load, false);
assert.equal(modelDistanceState(6500, false, true, false).load, true);
assert.equal(modelDistanceState(9100, false, true, true).load, false);
assert.equal(modelDistanceState(3500, false, true, true).show, true);
assert.equal(modelDistanceState(3500, false, true, false).show, false);
assert.equal(modelDistanceState(12000, true, false, false).show, true);
assert.equal(detectProjectModelType("https://example.com/tileset.json?signature=x"), "3d-tiles");
assert.equal(detectProjectModelType("https://example.com/tower.glb"), "glb");
assert.equal(
  readPhotorealisticConfig({ VITE_ENABLE_GOOGLE_PHOTOREALISTIC: "false" }).enabled,
  false,
);
assert.equal(
  readPhotorealisticConfig({ VITE_PROJECT_INSERT_PADDING_METERS: "NaN" })
    .projectInsertPaddingMeters,
  2,
);
assert.equal(
  readPhotorealisticConfig({ VITE_PROJECT_INSERT_PADDING_METERS: "999" })
    .projectInsertPaddingMeters,
  20,
);

function sceneHarness() {
  const resources = new Set<unknown>();
  const viewer = {
    scene: {
      globe: { show: true },
      primitives: {
        add: (p: unknown) => {
          resources.add(p);
          return p;
        },
        remove: (p: { destroy?: () => void }) => {
          resources.delete(p);
          p.destroy?.();
        },
      },
      requestRender: () => {},
    },
    isDestroyed: () => false,
  } as unknown as Viewer;
  let destroyed = false;
  const tileset = {
    tileVisible: new Event(),
    tileFailed: new Event(),
    destroy: () => {
      destroyed = true;
    },
    isDestroyed: () => destroyed,
    clippingPolygons: undefined,
  } as unknown as Cesium3DTileset;
  return { viewer, tileset, resources, isDestroyed: () => destroyed };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
let requests = 0;
const disabledHarness = sceneHarness();
const disabled = new CesiumPhotorealisticCity(
  disabledHarness.viewer,
  { enabled: false, googleKey: "test", projectInsertPaddingMeters: 2 },
  () => {},
  {
    load: async () => {
      requests++;
      return disabledHarness.tileset;
    },
    clippingSupported: () => true,
  },
);
await disabled.start();
await disabled.start();
assert.equal(requests, 0, "disabled must never call provider loader");
disabled.destroy();
const missing = new CesiumPhotorealisticCity(
  disabledHarness.viewer,
  { enabled: true, projectInsertPaddingMeters: 2 },
  () => {},
  {
    load: async () => {
      requests++;
      return disabledHarness.tileset;
    },
    clippingSupported: () => true,
  },
);
await missing.start();
assert.equal(requests, 0);
missing.destroy();
const unsupportedHarness = sceneHarness();
const unsupportedStates: string[] = [];
const unsupported = new CesiumPhotorealisticCity(
  unsupportedHarness.viewer,
  { enabled: true, googleKey: "test", projectInsertPaddingMeters: 2 },
  (s) => unsupportedStates.push(s),
  {
    load: async () => {
      requests++;
      return unsupportedHarness.tileset;
    },
    clippingSupported: () => false,
  },
);
await unsupported.start();
unsupportedHarness.tileset.tileVisible.raiseEvent();
await tick();
assert.equal(
  unsupportedStates.at(-1),
  "photorealistic",
  "lack of polygon clipping must not replace the Google city with Masterplan",
);
assert.equal(unsupportedHarness.viewer.scene.globe.show, false);
assert.equal(unsupportedHarness.resources.size, 1);
assert.equal(unsupported.activate({ id: "test", plot_geometry: plot }), false);
unsupported.destroy();
assert.equal(unsupportedHarness.resources.size, 0);

const h = sceneHarness();
const states: string[] = [];
const city = new CesiumPhotorealisticCity(
  h.viewer,
  { enabled: true, googleKey: "test", projectInsertPaddingMeters: 2 },
  (s) => states.push(s),
  {
    load: async () => {
      requests++;
      return h.tileset;
    },
    clippingSupported: () => true,
  },
);
await city.start();
await city.start();
assert.equal(requests, 1, "one provider root per viewer");
assert.equal(
  city.activate({ id: "test", plot_geometry: plot }),
  false,
  "no clipping while city is pending",
);
h.tileset.tileVisible.raiseEvent();
await tick();
assert.equal(h.viewer.scene.globe.show, false);
assert.equal(states.at(-1), "photorealistic");
assert.equal(city.activate({ id: "test", plot_geometry: plot }), true);
assert.equal(h.tileset.clippingPolygons.length, 1);
city.activate({ id: "test", plot_geometry: plot });
assert.equal(h.tileset.clippingPolygons.length, 1, "activation idempotent");
city.deactivate("test");
assert.equal(h.tileset.clippingPolygons.length, 0, "restore city on model unload");
assert.equal(city.activate({ id: "broken", plot_geometry: null }), false);
assert.equal(h.tileset.clippingPolygons.length, 0, "invalid plot never cuts a hole");
city.activate({ id: "test", plot_geometry: withHole });
assert.equal(h.tileset.clippingPolygons.get(0).holes.length, 1);
h.tileset.tileFailed.raiseEvent({ message: "403 key=must-not-log" });
await tick();
assert.equal(
  states.at(-1),
  "photorealistic",
  "one failed child tile must not tear down an otherwise visible Google city",
);
assert.equal(h.resources.size, 1);
assert.equal(h.viewer.scene.globe.show, false);
city.destroy();
assert.equal(h.resources.size, 0);
const late = sceneHarness();
let resolveLoad!: (value: Cesium3DTileset) => void;
const pending = new CesiumPhotorealisticCity(
  late.viewer,
  { enabled: true, googleKey: "test", projectInsertPaddingMeters: 2 },
  () => {},
  {
    load: () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    clippingSupported: () => true,
  },
);
const task = pending.start();
pending.destroy();
resolveLoad(late.tileset);
await task;
assert.equal(late.resources.size, 0);
assert(late.isDestroyed(), "late result destroyed rather than mounted after navigation");
console.log(
  "Photorealistic checks passed: zero-request disable, missing credential, concave/hole/padded clipping, model-distance hysteresis, clipping-capability isolation, child-tile resilience, one-root lifetime, late-result cleanup.",
);

// Exercise actual project loading orchestration with engine I/O stubbed. This is
// lifecycle QA, not a substitute for WebGL rendering or Google coverage QA.
const { Model, LabelCollection, Matrix4 } = await import("cesium");
const { CesiumProjectLayer } = await import("../src/components/map/cesium/CesiumProjectLayer");
const { CesiumTilesetManager } = await import("../src/components/map/cesium/CesiumTilesetManager");
const { Cesium3DTileset: TilesetClass } = await import("cesium");
const originalGlb = Model.fromGltfAsync;
const originalLabels = LabelCollection.prototype.add;
const originalTileset = TilesetClass.fromUrl;
const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { value: { hidden: false }, configurable: true });
LabelCollection.prototype.add = (() => ({})) as typeof originalLabels;
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function mockModel() {
  const model = Object.create(Model.prototype) as InstanceType<typeof Model>;
  let destroyed = false;
  for (const [key, value] of Object.entries({
    show: false,
    ready: false,
    readyEvent: new Event(),
    errorEvent: new Event(),
    silhouetteColor: undefined,
    silhouetteSize: 0,
    destroy: () => {
      destroyed = true;
    },
    isDestroyed: () => destroyed,
  }))
    Object.defineProperty(model, key, { value, writable: true, configurable: true });
  return model;
}
const mh = sceneHarness();
Object.assign(mh.viewer, {
  camera: {
    positionWC: Cartesian3.fromDegrees(55, 25, 1500),
    moveEnd: new Event(),
    changed: new Event(),
  },
  canvas: { clientWidth: 1200 },
});
let loadCount = 0;
const modelLoads: Array<ReturnType<typeof deferred<InstanceType<typeof Model>>>> = [];
Model.fromGltfAsync = (() => {
  loadCount++;
  const task = deferred<InstanceType<typeof Model>>();
  modelLoads.push(task);
  return task.promise;
}) as typeof originalGlb;
const active = new Set<string>();
const layer = new CesiumProjectLayer(mh.viewer, {
  activate: (p) => {
    active.add(p.id);
    return true;
  },
  deactivate: (id) => {
    active.delete(id);
  },
});
const project = {
  id: "test-project",
  name: "Test",
  lat: 25,
  lng: 55,
  model_3d_enabled: true,
  model_3d_url: "/test.glb",
  model_3d_scale: 1,
  model_3d_rotation: 0,
  model_3d_altitude: 0,
  plot_geometry: plot,
} as import("../src/lib/types").ProjectWithRelations;
try {
  layer.setProjects([project]);
  layer.updateSelection(null, project.id);
  layer.updateSelection(null, null);
  layer.refreshModels();
  assert.equal(loadCount, 1, "hover and duplicate refresh must not issue duplicate GLB loads");
  assert.equal(active.size, 0, "pending GLB must not clip the city");
  const model = mockModel();
  modelLoads[0].resolve(model);
  await tick();
  await tick();
  assert.equal(active.size, 0, "resolved GLB promise is not the GPU-ready event");
  model.readyEvent.raiseEvent();
  await tick();
  assert(active.has(project.id));
  assert.equal(model.show, true);
  mh.viewer.camera.positionWC = Cartesian3.fromDegrees(55, 25, 7000);
  layer.refreshModels();
  assert.equal(model.show, false);
  assert.equal(active.size, 0);
  assert(!model.isDestroyed(), "hysteresis keeps preloaded model resident");
  mh.viewer.camera.positionWC = Cartesian3.fromDegrees(55, 25, 9500);
  layer.refreshModels();
  assert(model.isDestroyed());
  assert.equal(active.size, 0);
  mh.viewer.camera.positionWC = Cartesian3.fromDegrees(55, 25, 1500);
  layer.refreshModels();
  const lateModel = mockModel();
  layer.setProjects([]);
  modelLoads[1].resolve(lateModel);
  await tick();
  await tick();
  assert(
    lateModel.isDestroyed(),
    "filtered-out project must not be mounted after its promise resolves",
  );
  layer.setProjects([project]);
  const failedModel = mockModel();
  modelLoads[2].resolve(failedModel);
  await tick();
  await tick();
  failedModel.readyEvent.raiseEvent();
  await tick();
  assert(active.has(project.id));
  failedModel.errorEvent.raiseEvent();
  await tick();
  assert.equal(active.size, 0);
  assert(failedModel.isDestroyed());
  layer.refreshModels();
  assert.equal(loadCount, 3, "failed models must have retry backoff");
} finally {
  layer.destroy();
  Model.fromGltfAsync = originalGlb;
  LabelCollection.prototype.add = originalLabels;
  if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument);
  else Reflect.deleteProperty(globalThis, "document");
}
const th = sceneHarness();
Object.assign(th.viewer, { canvas: { clientWidth: 1200 } });
const tileLoad = deferred<Cesium3DTileset>();
let tileCalls = 0;
TilesetClass.fromUrl = (() => {
  tileCalls++;
  return tileLoad.promise;
}) as typeof originalTileset;
const manager = new CesiumTilesetManager(th.viewer);
try {
  const first = manager.load("x", "/tileset.json");
  const second = manager.load("x", "/tileset.json");
  assert.equal(tileCalls, 1);
  manager.destroy();
  tileLoad.resolve(th.tileset);
  const results = await Promise.allSettled([first, second]);
  assert(results.every((r) => r.status === "rejected"));
  assert(th.isDestroyed());
  assert.equal(th.resources.size, 0);
} finally {
  manager.destroy();
  TilesetClass.fromUrl = originalTileset;
}
console.log(
  "Project lifecycle checks passed: no recursive reloads, in-flight dedupe, GPU-readiness gating, clipping rollback, unload hysteresis, late GLB/tileset cleanup, failure backoff.",
);

assert.deepEqual(clampToDubai(56, 26), { lng: DUBAI_BOUNDS.east, lat: DUBAI_BOUNDS.north });
assert.deepEqual(clampToDubai(55.27, 25.19), { lng: 55.27, lat: 25.19 });
assert.equal(readPhotorealisticConfig({ VITE_ENABLE_GOOGLE_PHOTOREALISTIC: " true\n" }).enabled, true);
assert.equal(readPhotorealisticConfig({ VITE_ENABLE_GOOGLE_PHOTOREALISTIC: "false" }, "configured").enabled, false);
