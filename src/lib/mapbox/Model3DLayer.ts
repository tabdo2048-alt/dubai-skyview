// A Mapbox GL custom layer that renders GLB 3D models (boats, yachts, ships,
// abras, trains, custom objects) over the Dubai map, animating those with a
// `route` along their waypoints with natural heading + a gentle bob, and
// drawing a light fading wake behind moving boats.
//
// Mapbox stays the map engine: every frame Mapbox hands us its view-projection
// matrix and we render our three.js scene into the SAME WebGL context, in
// Mercator coordinate space. Buildings, water, metro, and markers are untouched.
//
// GLB files live in public/models/. When a file is missing, we fall back to a
// low-poly procedural placeholder and log a warning — the map never crashes, so
// you can wire up configs first and drop in real GLBs later.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import mapboxgl from "mapbox-gl";
import {
  acquireSharedRenderer,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "./sharedThreeRenderer";
import { PLACEHOLDER_COLORS, type ModelConfig, type ModelType } from "./modelTypes";

type MercatorRef = { x: number; y: number; z: number; scale: number };

const WAKE_SAMPLES = 24;
const WAKE_RECORD_EVERY = 2; // frames between wake position samples

function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3((m.x - ref.x) / ref.scale, (m.y - ref.y) / ref.scale, (m.z - ref.z) / ref.scale);
}

// --- Procedural placeholder models ----------------------------------------
// Low-poly stand-ins used until a real GLB is dropped in. Deliberately simple.
function makeHull(length: number, beam: number, draft: number, color: number): THREE.Mesh {
  const points: THREE.Vector2[] = [
    new THREE.Vector2(0, length / 2),
    new THREE.Vector2(beam * 0.18, length / 2 - length * 0.08),
    new THREE.Vector2(beam * 0.42, length / 2 - length * 0.22),
    new THREE.Vector2(beam * 0.5, 0),
    new THREE.Vector2(beam * 0.46, -length / 2 + length * 0.18),
    new THREE.Vector2(beam * 0.22, -length / 2 + length * 0.04),
    new THREE.Vector2(0, -length / 2),
  ];
  const geo = new THREE.LatheGeometry(points, 16);
  geo.scale(1, draft / beam, 1);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 });
  return new THREE.Mesh(geo, mat);
}

function makeBox(w: number, d: number, h: number, color: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, d, h),
    new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.8 }),
  );
  mesh.position.z = z;
  return mesh;
}

function makePlaceholder(type: ModelType, color: number): THREE.Group {
  const g = new THREE.Group();
  const deck = 0xf5ead1;
  if (type === "abra" || type === "boat") {
    g.add(makeHull(90, 30, 15, color));
    g.add(makeBox(42, 20, 12, deck, 12));
  } else if (type === "yacht") {
    g.add(makeHull(180, 45, 27, color));
    g.add(makeBox(96, 34, 20, deck, 16));
    g.add(makeBox(52, 28, 14, deck, 34));
  } else if (type === "ship") {
    g.add(makeHull(330, 69, 42, color));
    const tower = makeBox(66, 58, 64, deck, 40);
    tower.position.x = -87;
    g.add(tower);
    for (let i = 0; i < 3; i++) {
      const container = makeBox(30, 22, 30, 0x8b7355, 22);
      container.position.x = -45 + i * 52;
      g.add(container);
    }
  } else if (type === "train") {
    g.add(makeBox(120, 40, 40, color, 20));
  } else {
    g.add(makeBox(40, 40, 40, color, 20));
  }
  // Lathe axis (length) sits along local Z; rotate so +X becomes the bow heading.
  g.rotation.z = -Math.PI / 2;
  return g;
}

// --- Wake trail ------------------------------------------------------------
class WakeTrail {
  mesh: THREE.Mesh;
  private positions: Float32Array;
  private geometry: THREE.BufferGeometry;
  private samples: THREE.Vector3[] = [];

  constructor(private maxWidth: number) {
    this.positions = new Float32Array(WAKE_SAMPLES * 2 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, mat);
  }

  push(pos: THREE.Vector3) {
    this.samples.unshift(pos.clone());
    if (this.samples.length > WAKE_SAMPLES) this.samples.pop();
  }

  update() {
    const n = this.samples.length;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const t = i / (WAKE_SAMPLES - 1);
      const width = this.maxWidth * (1 - t);
      const p = this.samples[i];
      let dir: THREE.Vector3;
      if (i < n - 1) dir = this.samples[i].clone().sub(this.samples[i + 1]);
      else dir = this.samples[i - 1].clone().sub(this.samples[i]);
      dir.z = 0;
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      dir.normalize();
      const side = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(width / 2);
      const left = p.clone().add(side);
      const right = p.clone().sub(side);
      const base = i * 6;
      this.positions[base] = left.x;
      this.positions[base + 1] = left.y;
      this.positions[base + 2] = left.z + 0.3;
      this.positions[base + 3] = right.x;
      this.positions[base + 4] = right.y;
      this.positions[base + 5] = right.z + 0.3;
    }
    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, c, b, d, c);
    }
    this.geometry.setIndex(indices);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, indices.length);
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// Interpolate along a route at fraction t (0..1) → position + heading so the
// model can face its direction of travel.
function routePointAt(path: [number, number][], t: number): { coord: [number, number]; heading: number } {
  if (path.length < 2) return { coord: path[0] ?? [0, 0], heading: 0 };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segLens.push(l);
    total += l;
  }
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const l = segLens[i - 1];
    if (acc + l >= target) {
      const localT = l === 0 ? 0 : (target - acc) / l;
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      const coord: [number, number] = [ax + (bx - ax) * localT, ay + (by - ay) * localT];
      const heading = Math.atan2(bx - ax, by - ay);
      return { coord, heading };
    }
    acc += l;
  }
  return { coord: path[path.length - 1], heading: 0 };
}

function isValidRoute(route: [number, number][] | undefined): route is [number, number][] {
  if (!route || route.length < 2) return false;
  return route.every(
    (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  );
}

type ModelInstance = {
  config: ModelConfig;
  group: THREE.Group;
  wake: WakeTrail | null;
  t: number;
  frame: number;
  bobOffset: number;
};

// Build the Mapbox custom layer from a registry of model configs.
export function createModel3DLayer(registry: ModelConfig[]): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  let ref: MercatorRef;
  let clock: THREE.Clock;
  let disposed = false;
  let renderLogged = false;
  let onResize: (() => void) | null = null;
  const instances: ModelInstance[] = [];

  return {
    id: "dubai-3d-models",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      console.log("[Model3DLayer] onAdd");
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      const origin = mapboxgl.MercatorCoordinate.fromLngLat([55.138, 25.1], 0);
      ref = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };

      scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const sun = new THREE.DirectionalLight(0xfff2d6, 1.7);
      sun.position.set(-1, -1, 2);
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0x87ceeb, 0xf5f3f0, 1.1));

      const loader = new GLTFLoader();

      for (const config of registry) {
        const group = new THREE.Group();
        // Wake only for water craft that move.
        const wakeWidth =
          config.type === "ship" ? 26 : config.type === "yacht" ? 14 : config.type === "boat" || config.type === "abra" ? 8 : 0;
        const wants = config.animate && isValidRoute(config.route) && wakeWidth > 0;
        if (config.animate && !isValidRoute(config.route)) {
          console.warn(`[Model3DLayer] invalid/missing route for: ${config.id} — placing static`);
        }
        const inst: ModelInstance = {
          config,
          group,
          wake: wants ? new WakeTrail(wakeWidth) : null,
          t: Math.random() * 1, // stagger start along route
          frame: 0,
          bobOffset: instances.length * 1.3,
        };
        scene.add(group);
        if (inst.wake) scene.add(inst.wake.mesh);
        instances.push(inst);

        // Try the real GLB; fall back to a low-poly placeholder on any failure.
        const color = PLACEHOLDER_COLORS[config.type] ?? 0xffffff;
        loader.load(
          config.modelUrl,
          (gltf) => {
            if (disposed) return;
            console.log(`[Model3DLayer] loaded model: ${config.id}`);
            const obj = gltf.scene;
            obj.scale.setScalar(config.scale);
            obj.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
            group.add(obj);
          },
          undefined,
          () => {
            if (disposed) return;
            console.warn(`Model file missing, using placeholder for: ${config.id}`);
            console.log(`[Model3DLayer] using placeholder: ${config.id}`);
            const ph = makePlaceholder(config.type, color);
            ph.scale.multiplyScalar(config.scale);
            group.add(ph);
          },
        );
      }

      console.log(`[Model3DLayer] model count: ${instances.length}`);

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer) return;
      if (!renderLogged) {
        console.log("[Model3DLayer] render loop running");
        renderLogged = true;
      }
      const dt = Math.min(clock.getDelta(), 0.1);
      const zoom = map.getZoom();
      const time = clock.elapsedTime;

      for (const inst of instances) {
        const { config } = inst;
        // Zoom-range visibility.
        const visible = zoom >= config.visibleFromZoom && zoom <= config.visibleToZoom;
        inst.group.visible = visible;
        if (inst.wake) inst.wake.mesh.visible = visible;
        if (!visible) continue;

        if (config.animate && isValidRoute(config.route)) {
          inst.t = (inst.t + (config.speed ?? 0.03) * dt) % 1;
          const { coord, heading } = routePointAt(config.route, inst.t);
          const pos = lngLatToLocal(coord[0], coord[1], ref, config.altitude);
          // Gentle bob for water craft.
          pos.z += 1 + Math.sin(time * 1.5 + inst.bobOffset) * 0.4;
          inst.group.position.copy(pos);
          // Rotate model to face direction of travel.
          inst.group.rotation.z = -heading + Math.PI / 2;

          inst.frame++;
          if (inst.wake && inst.frame % WAKE_RECORD_EVERY === 0) {
            inst.wake.push(pos);
            inst.wake.update();
          }
        } else {
          // Static placement.
          const pos = lngLatToLocal(config.lng, config.lat, ref, config.altitude);
          inst.group.position.copy(pos);
          inst.group.rotation.z = config.rotation[2];
        }
      }

      const mArr = Array.isArray(matrix)
        ? (matrix as number[])
        : (matrix as { defaultProjectionData?: { mainMatrix: number[] } } | undefined)?.defaultProjectionData
            ?.mainMatrix;
      if (!mArr) return;

      const l = new THREE.Matrix4()
        .makeTranslation(ref.x, ref.y, ref.z)
        .scale(new THREE.Vector3(ref.scale, -ref.scale, ref.scale));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(mArr).multiply(l);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },

    onRemove() {
      disposed = true;
      if (onResize) map.off("resize", onResize);
      for (const inst of instances) {
        inst.wake?.dispose();
        inst.group.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
          else mat?.dispose();
        });
      }
      instances.length = 0;
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
