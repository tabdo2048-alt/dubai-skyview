// A Mapbox GL custom layer that renders a subtle animated water shimmer and
// drifting clouds over Dubai's marine areas.
//
// The layer shares Mapbox's camera: on each frame Mapbox hands us its
// view-projection matrix and we render our three.js scene into the same WebGL
// context, positioning everything in Mercator coordinate space. Mapbox's own
// buildings, terrain, water, metro, and markers are untouched — this is purely
// a light overlay.
//
// Boats/yachts/ships live in the separate 3D model system
// (src/lib/mapbox/Model3DLayer.ts), NOT here — this file is water + clouds only.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { WATER_AREAS, CLOUDS } from "@/lib/water";
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

// Convert a lng/lat to a position in the layer's local metre space, relative to
// a chosen reference origin. Mapbox MercatorCoordinate gives us the scale.
function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3((m.x - ref.x) / ref.scale, (m.y - ref.y) / ref.scale, (m.z - ref.z) / ref.scale);
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

// --- Water shimmer overlay -------------------------------------------------
// This is deliberately NOT a visible ocean surface. The real, visible sea is
// Mapbox's OWN native water (satellite imagery / Standard water layer). This
// mesh renders ALMOST NOTHING: a nearly-transparent additive layer that only
// adds faint moving light — soft wave bands, thin shimmer lines, and a very
// light reflection sheen — so the user mostly sees Mapbox water that gently
// moves, never a separate cartoon Three.js ocean.
//
// We do NOT use three's stock `Water` object: it runs an internal reflection
// render pass that reads `camera.matrixWorld` and rewrites the projection
// matrix. In a Mapbox custom layer the camera is a bare THREE.Camera whose
// projectionMatrix we overwrite by hand each frame and whose matrixWorld stays
// identity, so the reflector renders an empty mirror and the water collapses to
// a flat static tint. This shimmer shader has no reflection pass and no camera
// dependency — its faint motion is driven entirely by `uTime`.
const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Additive shimmer with white wave crests: the fragment output includes both
// colored shimmer (sky blue) and white whitecaps on wave peaks. With additive
// blending, the white crests create a realistic foam effect over the water.
const WATER_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uShimmer;
  uniform vec3 uWhitecap; // white color for wave crests
  uniform float uDistortion; // wave sharpness/steepness (0.15 .. 0.35)
  uniform float uOpacity;    // overall strength (0.12 .. 0.22)

  float wave(vec2 p, float speed, float t) {
    return sin((p.x + p.y) + t * speed) * 0.5 + 0.5;
  }

  void main() {
    float t = uTime;
    // World XY in metres → stable pattern scale independent of zoom.
    vec2 p = vWorld.xy * 0.010;

    // Two slow, broad wave bands drifting in opposite directions.
    float w1 = wave(p * 1.0, 1.3, t);
    float w2 = wave(p * 1.6 + 3.7, -1.0, t);
    float swell = w1 * 0.6 + w2 * 0.4;

    // Thin bright shimmer lines — the main thing the eye notices moving.
    float lines = wave(p * vec2(2.2, 5.0), 1.1, t);
    float glint = smoothstep(1.0 - uDistortion, 1.0, lines);

    // White wave crests (whitecaps) on the peaks of the waves
    float whitecap = smoothstep(0.65, 1.0, swell) * 0.8;

    // A very light broad sheen so the whole basin isn't dead flat.
    float sheen = smoothstep(0.55, 1.0, swell) * 0.25;

    // Combine blue shimmer + white whitecaps
    float intensity = (glint * 0.9 + sheen) * uOpacity;
    float whitecapIntensity = whitecap * uOpacity * 0.7;

    // Mix sky blue shimmer with white wave crests
    vec3 color = uShimmer * intensity + uWhitecap * whitecapIntensity;
    float alpha = intensity + whitecapIntensity;

    gl_FragColor = vec4(color, alpha);
  }
`;

// Build the shimmer overlay material — additive, very low opacity, no solid
// fill. `uTime` is advanced slowly each frame in render() (dt * 0.08).
// Keep opacity subtle in both modes (0.12-0.22 range) so Mapbox water is the base.
function makeWaterMaterial(mode: "satellite" | "3d" = "3d"): THREE.ShaderMaterial {
  const opacityValue = mode === "satellite" ? 0.28 : 0.18; // Enhanced for wave visibility
  // Sky blue shimmer for satellite, pale blue for 3D
  const shimmerColor = mode === "satellite" ? 0x87ceeb : 0xbeefff; // Sky blue
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // only ADD faint light over Mapbox water
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      // Sky blue shimmer in satellite, pale blue in 3D
      uShimmer: { value: new THREE.Color(shimmerColor) },
      // White for wave crests (whitecaps)
      uWhitecap: { value: new THREE.Color(0xffffff) },
      uDistortion: { value: 0.3 }, // 0.15 .. 0.35 (increased for more dramatic waves)
      // Higher opacity in satellite mode for visibility over photo tiles
      uOpacity: { value: opacityValue },
    },
  });
}

type Cloud = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector2;
  origin: THREE.Vector3;
  phase: number;
  bounds: number;
};

export function createWaterLayer(controller?: { shouldRender: () => boolean }, mode: "satellite" | "3d" = "3d"): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  const waters: THREE.Mesh[] = [];
  const clouds: Cloud[] = [];
  let ref: MercatorRef;
  let clock: THREE.Clock;
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
      scene.add(new THREE.AmbientLight(0xffffff, 1.5));
      const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
      sun.position.set(-1, -1, 2);
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0x87ceeb, 0xf5f3f0, 1.2));

      // Shimmer overlay — a nearly-invisible additive layer clipped to each
      // Dubai water basin. The real, visible sea is Mapbox's own native water;
      // this only adds faint moving light on top (see makeWaterMaterial). One
      // flat mesh per basin so it never covers land/buildings.
      for (const area of WATER_AREAS) {
        const shape = new THREE.Shape();
        area.polygon.forEach(([lng, lat], i) => {
          const p = lngLatToLocal(lng, lat, ref, 0);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        const geo = new THREE.ShapeGeometry(shape);
        const water = new THREE.Mesh(geo, makeWaterMaterial(mode));
        // Sit right at the water surface; do not occlude terrain/buildings/metro.
        water.position.z = 1;
        water.renderOrder = 1;
        waters.push(water);
        scene.add(water);
      }

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
        const cloudOrigin = lngLatToLocal(spec.center[0], spec.center[1], ref, spec.altitude);
        mesh.position.copy(cloudOrigin);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        clouds.push({
          mesh,
          velocity: new THREE.Vector2(spec.speed[0], spec.speed[1]),
          origin: cloudOrigin,
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
      if (!renderer || (controller && !controller.shouldRender())) {
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.1); // guard against huge jumps on tab refocus

      // Advance the shimmer clock very slowly — the sea should look like real
      // Mapbox water that only gently moves, not an animated ocean.
      for (const w of waters) {
        const mat = w.material as THREE.ShaderMaterial;
        if (mat.uniforms && mat.uniforms.uTime) {
          mat.uniforms.uTime.value += dt * 0.08;
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
      if (onResize) map.off("resize", onResize);
      for (const w of waters) {
        w.geometry.dispose();
        (w.material as THREE.Material).dispose();
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
