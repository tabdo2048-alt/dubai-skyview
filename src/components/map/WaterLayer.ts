// Mapbox custom layer for a transparent animated water surface.
// It renders cyan/deep-blue moving water clipped to Dubai's real marine basins.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { WATER_AREAS } from "@/lib/water";
import {
  acquireSharedRenderer,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "@/lib/mapbox/sharedThreeRenderer";

type MercatorRef = {
  x: number;
  y: number;
  z: number;
  scale: number;
};

function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3(
    (m.x - ref.x) / ref.scale,
    (m.y - ref.y) / ref.scale,
    (m.z - ref.z) / ref.scale,
  );
}

// ShapeGeometry triangulates a ring into a flat fan with NO interior vertices,
// so a vertex-shader Z-displacement would only nudge the boundary and leave the
// interior flat. Subdividing every triangle (midpoint split, 4x per level) seeds
// interior vertices so the animated wave surface actually ripples. Two levels
// (16x triangles) is plenty for these basins and stays cheap (few hundred tris).
function subdivide(geometry: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
  const nonIndexed = geometry.toNonIndexed();
  let verts = Array.from((nonIndexed.getAttribute("position") as THREE.BufferAttribute).array);
  nonIndexed.dispose();

  for (let level = 0; level < levels; level++) {
    const out: number[] = [];
    for (let i = 0; i < verts.length; i += 9) {
      const ax = verts[i], ay = verts[i + 1], az = verts[i + 2];
      const bx = verts[i + 3], by = verts[i + 4], bz = verts[i + 5];
      const cx = verts[i + 6], cy = verts[i + 7], cz = verts[i + 8];
      const abx = (ax + bx) / 2, aby = (ay + by) / 2, abz = (az + bz) / 2;
      const bcx = (bx + cx) / 2, bcy = (by + cy) / 2, bcz = (bz + cz) / 2;
      const cax = (cx + ax) / 2, cay = (cy + ay) / 2, caz = (cz + az) / 2;
      out.push(
        ax, ay, az, abx, aby, abz, cax, cay, caz,
        abx, aby, abz, bx, by, bz, bcx, bcy, bcz,
        cax, cay, caz, bcx, bcy, bcz, cx, cy, cz,
        abx, aby, abz, bcx, bcy, bcz, cax, cay, caz,
      );
    }
    verts = out;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  return result;
}

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  uniform float uTime;
  uniform float uWaveHeight;

  float wave(vec2 p, vec2 dir, float freq, float speed) {
    return sin(dot(p, normalize(dir)) * freq + uTime * speed);
  }

  void main() {
    vec3 displaced = position;
    vec2 p = position.xy * 0.0035;
    float h = wave(p, vec2(1.0, 0.35), 7.0, 1.15) * 0.55;
    h += wave(p, vec2(-0.25, 1.0), 10.0, 0.82) * 0.30;
    h += wave(p, vec2(0.75, -0.55), 15.0, 1.45) * 0.15;
    displaced.z += h * uWaveHeight;

    vWorld = displaced;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uWaterColor;
  uniform vec3 uDeepColor;
  uniform vec3 uWhitecap;
  uniform float uDistortion;
  uniform float uOpacity;

  float wave(vec2 p, float speed, float t) {
    return sin((p.x + p.y) + t * speed) * 0.5 + 0.5;
  }

  void main() {
    float t = uTime;
    vec2 p = vWorld.xy * 0.010;

    float w1 = wave(p * 1.0, 1.25, t);
    float w2 = wave(p * 1.7 + 3.7, -0.9, t);
    float w3 = wave(p * vec2(3.8, 1.4) + 1.6, 0.55, t);
    float swell = w1 * 0.6 + w2 * 0.4;

    float lines = wave(p * vec2(2.2, 5.0), 1.05, t);
    float fineLines = wave(p * vec2(-4.2, 2.8) + 1.2, -1.35, t);
    float glint = smoothstep(1.0 - uDistortion, 1.0, lines);
    float fineGlint = smoothstep(0.82, 1.0, fineLines) * 0.18;
    float whitecap = smoothstep(0.76, 1.0, swell) * 0.5;
    float depthMix = clamp(swell * 0.65 + w3 * 0.35, 0.0, 1.0);
    float highlight = glint * 0.2 + fineGlint + whitecap;

    vec3 water = mix(uDeepColor, uWaterColor, depthMix);
    vec3 color = mix(water, uWhitecap, highlight);
    float alpha = uOpacity * (0.72 + swell * 0.18 + glint * 0.10);

    gl_FragColor = vec4(color, alpha);
  }
`;

function makeWaterMaterial(mode: "satellite" | "3d" = "3d"): THREE.ShaderMaterial {
  const satellite = mode === "satellite";
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWaterColor: { value: new THREE.Color(satellite ? 0x8eefff : 0x66d9ff) },
      uDeepColor: { value: new THREE.Color(satellite ? 0x118fbd : 0x0b6f8f) },
      uWhitecap: { value: new THREE.Color(0xffffff) },
      uDistortion: { value: satellite ? 0.2 : 0.26 },
      uOpacity: { value: satellite ? 0.5 : 0.24 },
      uWaveHeight: { value: satellite ? 3.8 : 2.2 },
    },
  });
}

export function createWaterLayer(
  controller?: { shouldRender: () => boolean },
  mode: "satellite" | "3d" = "3d",
): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  const waters: THREE.Mesh[] = [];
  let ref: MercatorRef;
  let clock: THREE.Clock;
  let onResize: (() => void) | null = null;
  let waterMaterial: THREE.ShaderMaterial | null = null;
  let animationLogged = false;
  const localToMercator = new THREE.Matrix4();
  const projectionMatrix = new THREE.Matrix4();
  const mercatorScale = new THREE.Vector3();

  return {
    id: "dubai-water-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      const originLngLat: [number, number] = [55.138, 25.1];
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(originLngLat, 0);
      ref = {
        x: origin.x,
        y: origin.y,
        z: origin.z,
        scale: origin.meterInMercatorCoordinateUnits(),
      };

      console.log("[Water] total areas", WATER_AREAS.length);
      waterMaterial = makeWaterMaterial(mode);
      for (const area of WATER_AREAS) {
        const shape = new THREE.Shape();
        area.polygon.forEach(([lng, lat], i) => {
          const p = lngLatToLocal(lng, lat, ref, 0);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });

        // Subdivide so the vertex-shader wave displacement has interior vertices
        // to ripple (ShapeGeometry alone is a flat, boundary-only fan).
        const geometry = subdivide(new THREE.ShapeGeometry(shape), 2);
        const water = new THREE.Mesh(geometry, waterMaterial);
        water.position.z = 1;
        water.renderOrder = 1;
        waters.push(water);
        scene.add(water);
      }

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
      console.log("[Water] layer added");
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;
      const dt = Math.min(clock.getDelta(), 0.1);

      if (waterMaterial?.uniforms.uTime) waterMaterial.uniforms.uTime.value += dt * 0.8;
      if (!animationLogged) {
        console.log("[Water] animation running");
        animationLogged = true;
      }

      const mArr = Array.isArray(matrix)
        ? (matrix as number[])
        : (matrix as { defaultProjectionData?: { mainMatrix: number[] } } | undefined)
            ?.defaultProjectionData?.mainMatrix;
      if (!mArr) return;

      mercatorScale.set(ref.scale, -ref.scale, ref.scale);
      localToMercator.makeTranslation(ref.x, ref.y, ref.z).scale(mercatorScale);
      camera.projectionMatrix = projectionMatrix.fromArray(mArr).multiply(localToMercator);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },

    onRemove() {
      if (onResize) map.off("resize", onResize);
      for (const w of waters) {
        w.geometry.dispose();
      }
      waters.length = 0;
      waterMaterial?.dispose();
      waterMaterial = null;
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
