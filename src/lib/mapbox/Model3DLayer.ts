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
  extractProjectionMatrix,
} from "./sharedThreeRenderer";
import {
  PLACEHOLDER_COLORS,
  type ModelConfig,
  type ModelForwardAxis,
  type ModelType,
} from "./modelTypes";
import { isWatercraft, modelHasWaterRoute, waterRouteForDisplay } from "./waterRouteGuards";

type MercatorRef = { x: number; y: number; z: number; scale: number };

const WAKE_SAMPLES = 24;
const WAKE_RECORD_EVERY = 2; // frames between wake position samples
const LOOK_AHEAD_T = 0.002;
const BOAT_ORIENTATION_DEBUG = false;
const WATERCRAFT_SPEED_FACTOR = 0.9;
const WATERCRAFT_DISPLAY_LENGTH_METERS: Partial<Record<ModelType, number>> = {
  ship: 64,
  yacht: 92,
  boat: 84,
  abra: 74,
};
const WATERCRAFT_WAKE_MULTIPLIER = 0.45;

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(current: number, target: number, amount: number) {
  return current + normalizeAngle(target - current) * amount;
}

function forwardAxisVector(axis: ModelForwardAxis) {
  switch (axis) {
    case "-x":
      return new THREE.Vector3(-1, 0, 0);
    case "+y":
      return new THREE.Vector3(0, 1, 0);
    case "-y":
      return new THREE.Vector3(0, -1, 0);
    case "+z":
      return new THREE.Vector3(0, 0, 1);
    case "-z":
      return new THREE.Vector3(0, 0, -1);
    case "+x":
    default:
      return new THREE.Vector3(1, 0, 0);
  }
}

// Converts a GLB's native bow axis into the child model's horizontal heading
// after its one-time pitch/roll correction has been applied.
function forwardAxisHeading(axis: ModelForwardAxis, rotation: ModelConfig["rotation"]) {
  const forward = forwardAxisVector(axis).applyEuler(new THREE.Euler(...rotation));
  return forward.lengthSq() > 0 && Math.hypot(forward.x, forward.y) > 1e-6
    ? Math.atan2(forward.y, forward.x)
    : 0;
}

function fitModelToDisplaySize(object: THREE.Object3D, config: ModelConfig) {
  if (!isWatercraft(config.type)) {
    object.scale.setScalar(config.scale);
    return;
  }

  object.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const sourceLength = Math.max(size.x, size.y, size.z);
  const targetLength = WATERCRAFT_DISPLAY_LENGTH_METERS[config.type] ?? 70;
  const scale = Number.isFinite(sourceLength) && sourceLength > 0
    ? targetLength / sourceLength
    : config.scale;
  object.scale.setScalar(scale);
}

function polishWatercraftMaterials(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.roughness = Math.min(material.roughness, 0.55);
      material.metalness = Math.min(material.metalness, 0.2);
      material.needsUpdate = true;
    }
  });
}

function setLocalPositionFromLngLat(
  target: THREE.Vector3,
  lng: number,
  lat: number,
  ref: MercatorRef,
  altitude = 0,
) {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return target.set(
    (m.x - ref.x) / ref.scale,
    (m.y - ref.y) / ref.scale,
    (m.z - ref.z) / ref.scale,
  );
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

// A tapered deck/superstructure block — a box whose front (bow, +X) face is
// narrowed and slightly shortened so decks look sleek instead of brick-like.
function makeTaperedDeck(
  len: number,
  beam: number,
  h: number,
  color: number,
  z: number,
  taper = 0.55,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(len, beam, h);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x > 0) {
      // Front half: pull the Y (beam) in and the top (Z) down toward the bow.
      pos.setY(i, pos.getY(i) * taper);
      if (pos.getZ(i) > 0) pos.setZ(i, pos.getZ(i) * 0.82);
    }
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.65 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(len * 0.04, 0, z);
  return mesh;
}

// A band of tinted-glass windows — a thin dark, slightly reflective strip that
// wraps a deck's side, giving the superstructure that layered-glass look.
function makeGlassBand(len: number, beam: number, h: number, z: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a2733,
    metalness: 0.85,
    roughness: 0.15,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, beam, h), mat);
  mesh.position.set(len * 0.03, 0, z);
  return mesh;
}

// A slim raked radar/comms mast for the top deck.
function makeMast(height: number, color: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, height, 8),
    new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 }),
  );
  pole.rotation.x = Math.PI / 2;
  pole.position.z = z + height / 2;
  pole.rotation.y = -0.18; // slight aft rake
  g.add(pole);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.2, roughness: 0.6 }),
  );
  dome.position.z = z + height * 0.55;
  g.add(dome);
  return g;
}

// A sleek multi-deck luxury yacht (white hull, teak deck, tinted glass, radar
// mast, aft swim platform) — matches the classic Mediterranean superyacht look.
function makeLuxuryYacht(hullColor: number): THREE.Group {
  const g = new THREE.Group();
  const white = 0xf7f5f0;
  const teak = 0xcaa26a;
  const glass = 0x101a24;

  // Hull — long and lean.
  g.add(makeHull(200, 42, 26, hullColor));

  // Main deck (widest, longest), then a shorter upper deck, then a compact
  // sun/flybridge deck — each stepped up and tapered toward the bow.
  const mainDeck = makeTaperedDeck(150, 34, 18, white, 15, 0.5);
  mainDeck.position.x = -8;
  g.add(mainDeck);
  g.add(makeGlassBand(120, 35.2, 6, 16));

  const upperDeck = makeTaperedDeck(104, 27, 15, white, 31, 0.55);
  upperDeck.position.x = -16;
  g.add(upperDeck);
  g.add(makeGlassBand(80, 27.6, 5, 31.5));

  const flyDeck = makeTaperedDeck(60, 20, 10, white, 44, 0.6);
  flyDeck.position.x = -30;
  g.add(flyDeck);

  // Teak aft swim platform + cockpit sole (low, at the stern, +teak color).
  const platform = makeBox(30, 30, 3, teak, 6);
  platform.position.x = -78;
  g.add(platform);
  const cockpit = makeBox(34, 28, 2, teak, 15.5);
  cockpit.position.x = -52;
  g.add(cockpit);

  // Dark windshield wrap at the front of the upper deck.
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(10, 24, 12),
    new THREE.MeshStandardMaterial({
      color: glass,
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85,
    }),
  );
  windshield.position.set(30, 0, 33);
  g.add(windshield);

  // Radar mast on the flybridge.
  const mast = makeMast(26, white, 49);
  mast.position.x = -34;
  g.add(mast);

  return g;
}

function makePlaceholder(type: ModelType, color: number): THREE.Group {
  const g = new THREE.Group();
  const deck = 0xf5ead1;
  if (type === "abra" || type === "boat") {
    g.add(makeHull(90, 30, 15, color));
    g.add(makeBox(42, 20, 12, deck, 12));
  } else if (type === "yacht") {
    g.add(makeLuxuryYacht(color));
    return g;
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
  // Procedural decks are authored with their bow on +X. The cargo hull's bow
  // points -X, matching the native ship GLB configuration.
  if (type === "ship") g.rotation.z = Math.PI;
  return g;
}

// --- Wake trail ------------------------------------------------------------
class WakeTrail {
  mesh: THREE.Mesh;
  private positions: Float32Array;
  private geometry: THREE.BufferGeometry;
  private samples = Array.from({ length: WAKE_SAMPLES }, () => new THREE.Vector3());
  private sampleCount = 0;
  private readonly direction = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(private maxWidth: number) {
    this.positions = new Float32Array(WAKE_SAMPLES * 2 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    const indices = new Uint16Array((WAKE_SAMPLES - 1) * 6);
    for (let i = 0; i < WAKE_SAMPLES - 1; i++) {
      const base = i * 6;
      const a = i * 2;
      indices[base] = a;
      indices[base + 1] = a + 1;
      indices[base + 2] = a + 2;
      indices[base + 3] = a + 1;
      indices[base + 4] = a + 3;
      indices[base + 5] = a + 2;
    }
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
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
    const nextCount = Math.min(this.sampleCount + 1, WAKE_SAMPLES);
    for (let i = nextCount - 1; i > 0; i--) this.samples[i].copy(this.samples[i - 1]);
    this.samples[0].copy(pos);
    this.sampleCount = nextCount;
  }

  update() {
    const n = this.sampleCount;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const t = i / (WAKE_SAMPLES - 1);
      const width = this.maxWidth * (1 - t);
      const p = this.samples[i];
      if (i < n - 1) this.direction.subVectors(this.samples[i], this.samples[i + 1]);
      else this.direction.subVectors(this.samples[i - 1], this.samples[i]);
      this.direction.z = 0;
      if (this.direction.lengthSq() < 1e-6) this.direction.set(1, 0, 0);
      this.direction.normalize();
      this.side.set(-this.direction.y, this.direction.x, 0).multiplyScalar(width / 2);
      const base = i * 6;
      this.positions[base] = p.x + this.side.x;
      this.positions[base + 1] = p.y + this.side.y;
      this.positions[base + 2] = p.z + 0.3;
      this.positions[base + 3] = p.x - this.side.x;
      this.positions[base + 4] = p.y - this.side.y;
      this.positions[base + 5] = p.z + 0.3;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, (n - 1) * 6);
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// Interpolate along a route at fraction t (0..1) → position + heading so the
// model can face its direction of travel.
type RouteMetrics = { segmentLengths: number[]; totalLength: number };

function createRouteMetrics(path: [number, number][]): RouteMetrics {
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segmentLengths.push(l);
    totalLength += l;
  }
  return { segmentLengths, totalLength };
}

function routePointAt(
  path: [number, number][],
  metrics: RouteMetrics,
  t: number,
  targetCoord: [number, number],
) {
  if (path.length < 2 || metrics.totalLength === 0) {
    targetCoord[0] = path[0]?.[0] ?? 0;
    targetCoord[1] = path[0]?.[1] ?? 0;
    return;
  }
  const target = Math.max(0, Math.min(1, t)) * metrics.totalLength;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const l = metrics.segmentLengths[i - 1];
    if (acc + l >= target) {
      const localT = l === 0 ? 0 : (target - acc) / l;
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      targetCoord[0] = ax + (bx - ax) * localT;
      targetCoord[1] = ay + (by - ay) * localT;
      return;
    }
    acc += l;
  }
  targetCoord[0] = path[path.length - 1][0];
  targetCoord[1] = path[path.length - 1][1];
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
  routeMetrics: RouteMetrics | null;
  routeCoord: [number, number];
  aheadRouteCoord: [number, number];
  position: THREE.Vector3;
  aheadPosition: THREE.Vector3;
  sternPosition: THREE.Vector3;
  routeDirection: THREE.Vector3;
  bowDirection: THREE.Vector3;
  headingCorrection: number;
  yaw: number;
  orientationInitialized: boolean;
  routeYaw: number;
  orientationLogged: boolean;
  routeArrow: THREE.ArrowHelper | null;
  bowArrow: THREE.ArrowHelper | null;
  t: number;
  frame: number;
  bobOffset: number;
};

// Build the Mapbox custom layer from a registry of model configs.
export function createModel3DLayer(
  registry: ModelConfig[],
  controller?: { shouldRender: () => boolean },
): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  let ref: MercatorRef;
  let clock: THREE.Clock;
  let disposed = false;
  let onResize: (() => void) | null = null;
  const instances: ModelInstance[] = [];
  // Reused every frame to avoid per-frame allocations (60 FPS target).
  const localToMercator = new THREE.Matrix4();
  const projectionMatrix = new THREE.Matrix4();
  const mercatorScale = new THREE.Vector3();

  return {
    id: "dubai-3d-models",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      const origin = mapboxgl.MercatorCoordinate.fromLngLat([55.138, 25.1], 0);
      ref = {
        x: origin.x,
        y: origin.y,
        z: origin.z,
        scale: origin.meterInMercatorCoordinateUnits(),
      };

      scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const sun = new THREE.DirectionalLight(0xfff2d6, 1.7);
      sun.position.set(-1, -1, 2);
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0x87ceeb, 0xf5f3f0, 1.1));

      const safeRegistry = registry.flatMap((config) => {
        const route = waterRouteForDisplay(config);
        const allowed = modelHasWaterRoute(config);
        if (!allowed) console.warn(`[Boats] skipped land-crossing route: ${config.id}`);
        if (!allowed) return [];
        return route && route !== config.route ? [{ ...config, route }] : [config];
      });

      console.log(`[Boats] ${safeRegistry.length} water-bound boat configs loaded`);
      const loader = new GLTFLoader();
      let wakeCount = 0;

      for (const config of safeRegistry) {
        const group = new THREE.Group();
        // Wake only for water craft that move.
        const baseWakeWidth =
          config.type === "ship"
            ? 26
            : config.type === "yacht"
              ? 14
              : config.type === "boat" || config.type === "abra"
                ? 8
                : 0;
        const wakeWidth = isWatercraft(config.type)
          ? baseWakeWidth * WATERCRAFT_WAKE_MULTIPLIER
          : baseWakeWidth;
        const wants = config.animate && isValidRoute(config.route) && wakeWidth > 0;
        if (config.animate && !isValidRoute(config.route)) {
          console.warn(`[Model3DLayer] invalid/missing route for: ${config.id} — placing static`);
        }
        const inst: ModelInstance = {
          config,
          group,
          wake: wants ? new WakeTrail(wakeWidth) : null,
          routeMetrics: isValidRoute(config.route) ? createRouteMetrics(config.route) : null,
          routeCoord: [0, 0],
          aheadRouteCoord: [0, 0],
          position: new THREE.Vector3(),
          aheadPosition: new THREE.Vector3(),
          sternPosition: new THREE.Vector3(),
          routeDirection: new THREE.Vector3(),
          bowDirection: new THREE.Vector3(),
          headingCorrection: forwardAxisHeading(config.forwardAxis ?? "+x", config.rotation),
          yaw: 0,
          orientationInitialized: false,
          routeYaw: 0,
          orientationLogged: false,
          routeArrow: null,
          bowArrow: null,
          t: Math.random() * 1, // stagger start along route
          frame: 0,
          bobOffset: instances.length * 1.3,
        };
        scene.add(group);
        if (inst.wake) {
          scene.add(inst.wake.mesh);
          wakeCount++;
        }
        if (BOAT_ORIENTATION_DEBUG && isWatercraft(config.type)) {
          inst.routeArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 36, 0xff3344);
          inst.bowArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 30, 0x32d583);
          scene.add(inst.routeArrow, inst.bowArrow);
        }
        instances.push(inst);

        // Try the real GLB; fall back to a low-poly placeholder on any failure.
        // A per-model `color` overrides the type's default hull color.
        const color = config.color ?? PLACEHOLDER_COLORS[config.type] ?? 0xffffff;
        loader.load(
          config.modelUrl,
          (gltf) => {
            if (disposed) return;
            console.log("[Boats] model loaded");
            const obj = gltf.scene;
            fitModelToDisplaySize(obj, config);
            if (isWatercraft(config.type)) polishWatercraftMaterials(obj);
            obj.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
            group.add(obj);
          },
          undefined,
          () => {
            if (disposed) return;
            console.log("[Boats] placeholder used");
            const ph = makePlaceholder(config.type, color);
            fitModelToDisplaySize(ph, config);
            group.add(ph);
          },
        );
      }

      if (wakeCount > 0) console.log("[Boats] wake trails active");

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;
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

        if (config.animate && isValidRoute(config.route) && inst.routeMetrics) {
          inst.t = (inst.t + (config.speed ?? 0.03) * WATERCRAFT_SPEED_FACTOR * dt) % 1;
          routePointAt(config.route, inst.routeMetrics, inst.t, inst.routeCoord);
          routePointAt(
            config.route,
            inst.routeMetrics,
            (inst.t + LOOK_AHEAD_T) % 1,
            inst.aheadRouteCoord,
          );
          const pos = setLocalPositionFromLngLat(
            inst.position,
            inst.routeCoord[0],
            inst.routeCoord[1],
            ref,
            config.altitude,
          );
          const ahead = setLocalPositionFromLngLat(
            inst.aheadPosition,
            inst.aheadRouteCoord[0],
            inst.aheadRouteCoord[1],
            ref,
            config.altitude,
          );
          // Gentle bob for water craft.
          pos.z += 1 + Math.sin(time * 1.5 + inst.bobOffset) * 0.4;
          inst.group.position.copy(pos);
          const dx = ahead.x - pos.x;
          const dy = ahead.y - pos.y;
          inst.routeYaw = Math.atan2(dy, dx);
          const targetYaw =
            inst.routeYaw - inst.headingCorrection + (config.headingOffset ?? 0);

          if (!inst.orientationInitialized) {
            inst.yaw = targetYaw;
            inst.group.rotation.z = targetYaw;
            inst.orientationInitialized = true;
          } else {
            const turnSpeed = config.turnSpeed ?? 3.5;
            const turnAmount = 1 - Math.exp(-turnSpeed * dt);
            inst.yaw = lerpAngle(inst.yaw, targetYaw, turnAmount);
            inst.group.rotation.z = inst.yaw;
          }

          if (BOAT_ORIENTATION_DEBUG) {
            const bowYaw = inst.yaw + inst.headingCorrection;
            inst.routeArrow?.position.copy(pos);
            inst.routeDirection.set(Math.cos(inst.routeYaw), Math.sin(inst.routeYaw), 0);
            inst.routeArrow?.setDirection(inst.routeDirection);
            inst.bowArrow?.position.copy(pos);
            inst.bowDirection.set(Math.cos(bowYaw), Math.sin(bowYaw), 0);
            inst.bowArrow?.setDirection(inst.bowDirection);
            if (!inst.orientationLogged) {
              console.log("[BoatOrientation]", config.id, {
                targetYaw,
                currentYaw: inst.yaw,
                forwardAxis: config.forwardAxis ?? "+x",
                headingOffset: config.headingOffset ?? 0,
              });
              inst.orientationLogged = true;
            }
          }

          inst.frame++;
          if (inst.wake && inst.frame % WAKE_RECORD_EVERY === 0) {
            const bowYaw = inst.yaw + inst.headingCorrection;
            const sternOffset = config.sternOffset ?? 16;
            inst.sternPosition.copy(pos);
            inst.sternPosition.x -= Math.cos(bowYaw) * sternOffset;
            inst.sternPosition.y -= Math.sin(bowYaw) * sternOffset;
            inst.wake.push(inst.sternPosition);
            inst.wake.update();
          }
        } else {
          // Static placement.
          const pos = setLocalPositionFromLngLat(
            inst.position,
            config.lng,
            config.lat,
            ref,
            config.altitude,
          );
          inst.group.position.copy(pos);
          inst.group.rotation.z = config.headingOffset ?? 0;
        }
      }

      const mArr = extractProjectionMatrix(matrix);
      if (!mArr) return;

      mercatorScale.set(ref.scale, -ref.scale, ref.scale);
      localToMercator.makeTranslation(ref.x, ref.y, ref.z).scale(mercatorScale);
      camera.projectionMatrix = projectionMatrix.fromArray(mArr).multiply(localToMercator);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },

    onRemove() {
      disposed = true;
      if (onResize) map.off("resize", onResize);
      for (const inst of instances) {
        inst.wake?.dispose();
        inst.routeArrow?.dispose();
        inst.bowArrow?.dispose();
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
