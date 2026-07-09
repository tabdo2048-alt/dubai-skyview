// Mapbox custom layer for a very subtle white wave-crest overlay.
// The real water remains Mapbox satellite/standard water; this only adds
// transparent moving white crests clipped to Dubai's water basins.

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
  uniform vec3 uWhitecap;
  uniform float uDistortion;
  uniform float uOpacity;

  float wave(vec2 p, float speed, float t) {
    return sin((p.x + p.y) + t * speed) * 0.5 + 0.5;
  }

  void main() {
    float t = uTime;
    vec2 p = vWorld.xy * 0.010;

    float w1 = wave(p * 1.0, 1.3, t);
    float w2 = wave(p * 1.6 + 3.7, -1.0, t);
    float swell = w1 * 0.6 + w2 * 0.4;

    float lines = wave(p * vec2(2.2, 5.0), 1.1, t);
    float glint = smoothstep(1.0 - uDistortion, 1.0, lines);
    float whitecap = smoothstep(0.74, 1.0, swell) * 0.55;
    float crest = max(glint * 0.55, whitecap) * uOpacity;

    gl_FragColor = vec4(uWhitecap * crest, crest);
  }
`;

function makeWaterMaterial(mode: "satellite" | "3d" = "3d"): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWhitecap: { value: new THREE.Color(0xffffff) },
      uDistortion: { value: 0.24 },
      uOpacity: { value: mode === "satellite" ? 0.13 : 0.1 },
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

      for (const area of WATER_AREAS.filter((waterArea) => waterArea.id !== "palm")) {
        const shape = new THREE.Shape();
        area.polygon.forEach(([lng, lat], i) => {
          const p = lngLatToLocal(lng, lat, ref, 0);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });

        const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeWaterMaterial(mode));
        water.position.z = 1;
        water.renderOrder = 1;
        waters.push(water);
        scene.add(water);
      }

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;
      const dt = Math.min(clock.getDelta(), 0.1);

      for (const w of waters) {
        const mat = w.material as THREE.ShaderMaterial;
        if (mat.uniforms.uTime) mat.uniforms.uTime.value += dt * 0.16;
      }

      const mArr = Array.isArray(matrix)
        ? (matrix as number[])
        : (matrix as { defaultProjectionData?: { mainMatrix: number[] } } | undefined)
            ?.defaultProjectionData?.mainMatrix;
      if (!mArr) return;

      const localToMercator = new THREE.Matrix4()
        .makeTranslation(ref.x, ref.y, ref.z)
        .scale(new THREE.Vector3(ref.scale, -ref.scale, ref.scale));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(mArr).multiply(localToMercator);

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
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
