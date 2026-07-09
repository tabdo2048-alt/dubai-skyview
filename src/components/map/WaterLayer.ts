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

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
    float glint = smoothstep(1.0 - uDistortion, 1.0, lines);
    float whitecap = smoothstep(0.78, 1.0, swell) * 0.45;
    float depthMix = clamp(swell * 0.65 + w3 * 0.35, 0.0, 1.0);
    float highlight = glint * 0.16 + whitecap;

    vec3 water = mix(uDeepColor, uWaterColor, depthMix);
    vec3 color = mix(water, uWhitecap, highlight);
    float alpha = uOpacity * (0.72 + swell * 0.18 + glint * 0.10);

    gl_FragColor = vec4(color, alpha);
  }
`;

function makeWaterMaterial(mode: "satellite" | "3d" = "3d"): THREE.ShaderMaterial {
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
      uWaterColor: { value: new THREE.Color(0x66d9ff) },
      uDeepColor: { value: new THREE.Color(0x0b6f8f) },
      uWhitecap: { value: new THREE.Color(0xffffff) },
      uDistortion: { value: 0.26 },
      uOpacity: { value: mode === "satellite" ? 0.32 : 0.24 },
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

        const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), waterMaterial);
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
