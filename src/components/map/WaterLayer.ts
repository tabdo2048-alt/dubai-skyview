// A Mapbox GL custom layer that renders animated three.js water and moving
// procedural boats (yachts, ships, abras), wake trails, and drifting clouds
// over Dubai's marine areas.
//
// The layer shares Mapbox's camera: on each frame Mapbox hands us its
// view-projection matrix and we render our three.js scene into the same WebGL
// context, positioning everything in Mercator coordinate space. Mapbox's own
// buildings, terrain, and controls are untouched — this is purely an overlay.

import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import mapboxgl from "mapbox-gl";
import { WATER_AREAS, BOAT_ROUTES, CLOUDS, boatPointAt, type BoatKind } from "@/lib/water";
import {
  acquireSharedRenderer,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "@/lib/mapbox/sharedThreeRenderer";

type MercatorRef = {
  x: number;
  y: number;
  z: number;
  scale: number; // metres -> mercator units at the reference latitude
};

// Drop real .glb files into public/models/ and fill this in to use them
// instead of the procedural hulls below — no other code changes required.
const MODEL_URLS: Partial<Record<BoatKind, string>> = {};

const WAKE_SAMPLES = 24;
const WAKE_RECORD_EVERY = 2; // frames between wake position samples

// Convert a lng/lat to a position in the layer's local metre space, relative to
// a chosen reference origin. Mapbox MercatorCoordinate gives us the scale.
function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3((m.x - ref.x) / ref.scale, (m.y - ref.y) / ref.scale, (m.z - ref.z) / ref.scale);
}

// Build a hull silhouette (bow -> beam -> stern) and lathe it around the
// centreline for a real curved-hull look instead of a box.
function makeHull(length: number, beam: number, draft: number, color: number): THREE.Mesh {
  const points: THREE.Vector2[] = [
    new THREE.Vector2(0, length / 2), // bow tip, at the lathe axis
    new THREE.Vector2(beam * 0.18, length / 2 - length * 0.08),
    new THREE.Vector2(beam * 0.42, length / 2 - length * 0.22),
    new THREE.Vector2(beam * 0.5, 0),
    new THREE.Vector2(beam * 0.46, -length / 2 + length * 0.18),
    new THREE.Vector2(beam * 0.22, -length / 2 + length * 0.04),
    new THREE.Vector2(0, -length / 2),
  ];
  const geo = new THREE.LatheGeometry(points, 20);
  geo.scale(1, draft / beam, 1);
  geo.rotateX(Math.PI / 2); // lathe's Y axis becomes our Z (up)
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 });
  return new THREE.Mesh(geo, mat);
}

function makeCabin(width: number, depth: number, height: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  const r = Math.min(width, depth) * 0.15;
  shape.moveTo(-width / 2 + r, -depth / 2);
  shape.lineTo(width / 2 - r, -depth / 2);
  shape.quadraticCurveTo(width / 2, -depth / 2, width / 2, -depth / 2 + r);
  shape.lineTo(width / 2, depth / 2 - r);
  shape.quadraticCurveTo(width / 2, depth / 2, width / 2 - r, depth / 2);
  shape.lineTo(-width / 2 + r, depth / 2);
  shape.quadraticCurveTo(-width / 2, depth / 2, -width / 2, depth / 2 - r);
  shape.lineTo(-width / 2, -depth / 2 + r);
  shape.quadraticCurveTo(-width / 2, -depth / 2, -width / 2 + r, -depth / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, height);
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.8 });
  return new THREE.Mesh(geo, mat);
}

// Build a stylized boat mesh from primitives — curved hulls via LatheGeometry
// rather than boxes, for a much more realistic silhouette. No external files.
function makeProceduralBoat(kind: BoatKind, color: number): THREE.Group {
  const g = new THREE.Group();
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e2a33, metalness: 0.3, roughness: 0.5 });
  const deckColor = 0xf5ead1;

  if (kind === "abra") {
    const hull = makeHull(90, 30, 15, color);
    g.add(hull);
    const canopy = makeCabin(45, 21, 15, deckColor);
    canopy.position.z = 12;
    g.add(canopy);
  } else if (kind === "yacht") {
    const hull = makeHull(180, 45, 27, color);
    g.add(hull);
    const deck = makeCabin(96, 36, 21, deckColor);
    deck.position.set(-9, 0, 15);
    g.add(deck);
    const upper = makeCabin(54, 30, 15, deckColor);
    upper.position.set(-24, 0, 36);
    g.add(upper);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(87, 31.5, 2.25), darkMat);
    glass.position.set(-9, 0, 25.5);
    g.add(glass);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 39, 8), darkMat);
    mast.position.set(30, 0, 19.5);
    g.add(mast);
  } else {
    // Large cargo ship
    const hull = makeHull(330, 69, 42, color);
    g.add(hull);
    const tower = makeCabin(69, 60, 66, deckColor);
    tower.position.set(-87, 0, 33);
    g.add(tower);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(12, 15, 45, 12), darkMat);
    funnel.position.set(-102, 0, 105);
    g.add(funnel);
    // Additional cargo containers on deck for visual detail
    const containerMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.1, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const container = new THREE.Mesh(new THREE.BoxGeometry(30, 22.5, 30), containerMat);
      container.position.set(-45 + i * 52.5, 0, 37.5);
      g.add(container);
    }
  }
  // Lathe axis (length) sits along local Z; rotate so +X becomes the bow heading.
  g.rotation.z = -Math.PI / 2;
  return g;
}

// Attempt a real glTF model first (see MODEL_URLS above); silently fall back
// to the procedural hull on any missing file, network error, or parse failure.
async function loadBoat(kind: BoatKind, color: number, loader: GLTFLoader): Promise<THREE.Object3D> {
  const url = MODEL_URLS[kind];
  if (url) {
    try {
      const gltf = await loader.loadAsync(url);
      return gltf.scene;
    } catch (err) {
      console.warn(`Falling back to procedural boat for "${kind}" — glTF load failed`, err);
    }
  }
  return makeProceduralBoat(kind, color);
}

// A tapered ribbon mesh built from a boat's recent trail of positions, used to
// render a fading wake behind it. Geometry is rewritten each frame from a
// small ring buffer rather than rebuilt from scratch.
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
      opacity: 0.35,
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
    const idxs: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (WAKE_SAMPLES - 1); // 0 at the boat, 1 at the tail
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
      idxs.push(base / 3, base / 3 + 1);
    }
    // Build triangle indices for the ribbon strip on the fly (cheap: n is small).
    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2,
        b = i * 2 + 1,
        c = i * 2 + 2,
        d = i * 2 + 3;
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

// Soft radial-gradient sprite texture generated once on a canvas — no network
// fetch required for the cloud puffs.
function makeCloudTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

type Boat = {
  group: THREE.Object3D;
  routeIdx: number;
  t: number;
  wake: WakeTrail;
  frame: number;
};

type Cloud = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector2;
  origin: THREE.Vector3;
  phase: number;
  bounds: number;
};

export function createWaterLayer(): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  const waters: Water[] = [];
  const boats: Boat[] = [];
  const clouds: Cloud[] = [];
  let ref: MercatorRef;
  let clock: THREE.Clock;
  let disposed = false;
  let onResize: (() => void) | null = null;

  return {
    id: "dubai-water-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      // Reference origin at the Marina — everything positioned relative to it.
      const originLngLat: [number, number] = [55.138, 25.1];
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(originLngLat, 0);
      ref = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };

      // Lighting — bright for visibility
      scene.add(new THREE.AmbientLight(0xffffff, 1.5)); // brighter ambient
      const sun = new THREE.DirectionalLight(0xfff2d6, 1.8); // brighter sun
      sun.position.set(-1, -1, 2);
      scene.add(sun);

      // Add hemisphere light for better global illumination
      const hemi = new THREE.HemisphereLight(0x87ceeb, 0xf5f3f0, 1.2);
      scene.add(hemi);

      // Three.js Water — a TRANSPARENT ANIMATED OVERLAY only. The Mapbox
      // Standard base water provides the main sky-blue color; this layer adds
      // subtle movement, shimmer and soft reflection on top — never a solid
      // cartoon sheet. Uses the real waternormals normal-map for realism.
      const waterNormals = new THREE.TextureLoader().load(
        "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg",
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
        },
      );

      for (const area of WATER_AREAS) {
        const shape = new THREE.Shape();
        area.polygon.forEach(([lng, lat], i) => {
          const p = lngLatToLocal(lng, lat, ref, 0);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        const geo = new THREE.ShapeGeometry(shape);
        const water = new Water(geo, {
          textureWidth: 512,
          textureHeight: 512,
          waterNormals,
          sunDirection: new THREE.Vector3(-0.2, -0.6, 1).normalize(),
          sunColor: 0xffffff,
          waterColor: 0x8FEAFF, // soft sky-blue, matches Mapbox base water
          distortionScale: 0.6, // subtle waves — not cartoonish
          alpha: 0.3, // mostly transparent overlay
          fog: false,
        });
        // Slightly above ground; do not occlude terrain/buildings/metro.
        water.position.z = 2;
        (water.material as THREE.Material).transparent = true;
        (water.material as THREE.Material).depthTest = false;
        (water.material as THREE.Material).depthWrite = false;
        water.renderOrder = 1;
        waters.push(water);
        scene.add(water);
      }

      // Boats + wake trails. Procedural now; swaps to real glTF automatically
      // once MODEL_URLS is filled in.
      const gltfLoader = new GLTFLoader();
      BOAT_ROUTES.forEach((route, i) => {
        const wakeWidth = route.kind === "ship" ? 26 : route.kind === "yacht" ? 14 : 7;
        const boat: Boat = {
          group: new THREE.Group(),
          routeIdx: i,
          t: (i * 0.13) % 1,
          wake: new WakeTrail(wakeWidth),
          frame: 0,
        };
        scene.add(boat.group);
        scene.add(boat.wake.mesh);
        boats.push(boat);
        loadBoat(route.kind, route.color, gltfLoader).then((obj) => {
          if (disposed) return;
          boat.group.add(obj);
        });
      });

      // Clouds
      const cloudTexture = makeCloudTexture();
      for (const spec of CLOUDS) {
        const geo = new THREE.PlaneGeometry(spec.scale, spec.scale * 0.55);
        const mat = new THREE.MeshBasicMaterial({
          map: cloudTexture,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const origin = lngLatToLocal(spec.center[0], spec.center[1], ref, spec.altitude);
        mesh.position.copy(origin);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        clouds.push({
          mesh,
          velocity: new THREE.Vector2(spec.speed[0], spec.speed[1]),
          origin,
          phase: spec.phase,
          bounds: 6000,
        });
      }

      // Share a single renderer across all custom three.js layers so they don't
      // fight over Mapbox's WebGL context (which silently breaks rendering).
      renderer = acquireSharedRenderer(map.getCanvas(), gl);

      onResize = () => {
        syncSharedRendererSize(map.getCanvas());
      };
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer) return;
      const dt = Math.min(clock.getDelta(), 0.1); // guard against huge jumps on tab refocus

      // Advance boats along their routes + record wake samples.
      for (const b of boats) {
        const route = BOAT_ROUTES[b.routeIdx];
        b.t = (b.t + route.speed * dt) % 1;
        const { coord, heading } = boatPointAt(route.path, b.t);
        const pos = lngLatToLocal(coord[0], coord[1], ref, 0);
        pos.z += 1 + Math.sin(clock.elapsedTime * 1.5 + b.routeIdx) * 1.2; // gentle bob
        b.group.position.copy(pos);
        b.group.rotation.z = -heading + Math.PI / 2;

        b.frame++;
        if (b.frame % WAKE_RECORD_EVERY === 0) {
          b.wake.push(pos);
          b.wake.update();
        }
      }

      // Animate water — very slow, subtle shimmer (premium calm sea)
      for (const w of waters) {
        const mat = w.material as THREE.ShaderMaterial;
        if (mat.uniforms && mat.uniforms["time"]) {
          mat.uniforms["time"].value += dt * 0.18;
        }
      }

      // Drift clouds slowly, fading in and out, wrapping back around.
      for (const c of clouds) {
        const t = clock.elapsedTime;
        c.mesh.position.x = c.origin.x + ((c.velocity.x * t) % c.bounds);
        c.mesh.position.y = c.origin.y + ((c.velocity.y * t) % c.bounds);
        const mat = c.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.15 + c.phase));
      }

      // Mapbox may pass the matrix directly (v2) or wrapped (v3 globe/mercator).
      const mArr = Array.isArray(matrix)
        ? (matrix as number[])
        : (matrix as { defaultProjectionData?: { mainMatrix: number[] } } | undefined)?.defaultProjectionData
            ?.mainMatrix;
      if (!mArr) return;

      // Build the model matrix that maps our local metre space to Mercator.
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
      for (const w of waters) {
        w.geometry.dispose();
        (w.material as THREE.Material).dispose();
      }
      for (const b of boats) {
        b.wake.dispose();
        b.group.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        });
      }
      for (const c of clouds) {
        c.mesh.geometry.dispose();
        const mat = c.mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
