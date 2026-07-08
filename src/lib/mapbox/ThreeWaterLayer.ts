// Mapbox GL custom layer that renders premium, light sky-blue/cyan animated
// water over Dubai's marine areas using Three.js.
//
// This is a pure visual overlay: it shares Mapbox's own WebGL context and
// camera matrix every frame, so it never replaces Mapbox, never removes the
// existing 3D buildings, and does not touch markers/metro layers/controls.
// Multiple small water polygons are used (one per basin) instead of one giant
// plane, so land and buildings are never covered.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";

// ---- Palette (exact, per spec) -------------------------------------------
const WATER_MAIN_COLOR = "#5EDFFF";
const WATER_SECONDARY_COLOR = "#9EEBFF";
const WATER_HIGHLIGHT_COLOR = "#E6FBFF";
const WATER_OPACITY = 0.65; // within the requested 0.55–0.75 range

// ---- Dubai water areas (hand-traced polygons, [lng, lat] rings) ----------
// Approximate, not survey-grade — close enough to hug each basin's coastline
// so the water plane doesn't spill onto land.
type WaterPolygon = { id: string; ring: [number, number][] };

const DUBAI_WATER_POLYGONS: WaterPolygon[] = [
  {
    id: "dubai-marina",
    ring: [
      [55.142, 25.069],
      [55.1395, 25.07],
      [55.13, 25.066],
      [55.118, 25.064],
      [55.108, 25.07],
      [55.103, 25.08],
      [55.101, 25.092],
      [55.105, 25.1],
      [55.114, 25.098],
      [55.122, 25.092],
      [55.129, 25.087],
      [55.1345, 25.081],
      [55.139, 25.0745],
      [55.142, 25.069],
    ],
  },
  {
    id: "palm-jumeirah",
    ring: [
      [55.096, 25.126],
      [55.1, 25.136],
      [55.112, 25.142],
      [55.13, 25.144],
      [55.148, 25.142],
      [55.162, 25.134],
      [55.17, 25.122],
      [55.166, 25.11],
      [55.155, 25.102],
      [55.14, 25.098],
      [55.124, 25.099],
      [55.11, 25.105],
      [55.1, 25.115],
      [55.096, 25.126],
    ],
  },
  {
    id: "dubai-creek",
    ring: [
      [55.296, 25.266],
      [55.299, 25.26],
      [55.305, 25.256],
      [55.311, 25.25],
      [55.317, 25.243],
      [55.323, 25.236],
      [55.329, 25.229],
      [55.335, 25.222],
      [55.339, 25.219],
      [55.341, 25.223],
      [55.336, 25.228],
      [55.33, 25.235],
      [55.324, 25.242],
      [55.318, 25.249],
      [55.312, 25.2555],
      [55.306, 25.262],
      [55.301, 25.269],
      [55.296, 25.266],
    ],
  },
  {
    id: "business-bay-canal",
    ring: [
      [55.2705, 25.1875],
      [55.2685, 25.186],
      [55.267, 25.1815],
      [55.2665, 25.176],
      [55.268, 25.171],
      [55.2715, 25.1665],
      [55.276, 25.1645],
      [55.278, 25.1665],
      [55.2745, 25.1685],
      [55.2715, 25.172],
      [55.27, 25.1765],
      [55.2705, 25.182],
      [55.2725, 25.1865],
      [55.2705, 25.1875],
    ],
  },
  {
    id: "dubai-harbour",
    ring: [
      [55.128, 25.089],
      [55.126, 25.0955],
      [55.1235, 25.1005],
      [55.119, 25.1015],
      [55.1155, 25.0975],
      [55.117, 25.0915],
      [55.1215, 25.0875],
      [55.1255, 25.086],
      [55.128, 25.089],
    ],
  },
  {
    id: "arabian-gulf-coastline",
    ring: [
      [55.05, 25.03],
      [55.09, 25.06],
      [55.115, 25.075],
      [55.13, 25.085],
      [55.15, 25.1],
      [55.17, 25.115],
      [55.2, 25.14],
      [55.22, 25.16],
      [55.19, 25.17],
      [55.16, 25.145],
      [55.135, 25.125],
      [55.11, 25.105],
      [55.09, 25.09],
      [55.06, 25.06],
      [55.03, 25.035],
      [55.05, 25.03],
    ],
  },
];

// ---- Shader -----------------------------------------------------------
// A lightweight custom ShaderMaterial (not three's stock Water.js) so the
// exact sky-blue/cyan palette and transparency are precisely controllable.
const waterVertexShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;

  // Small vertex ripple for a soft "moving waves" silhouette.
  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.z += sin(pos.x * 0.02 + uTime * 0.6) * 0.6
            + sin(pos.y * 0.017 - uTime * 0.5) * 0.6;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uMainColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uHighlightColor;
  uniform float uOpacity;

  // Cheap pseudo-noise for shimmer/normal-movement without a texture fetch.
  float wave(vec2 uv, float freq, float speed, float t) {
    return sin((uv.x + uv.y) * freq + t * speed) * 0.5 + 0.5;
  }

  void main() {
    float t = uTime;
    float w1 = wave(vUv * 8.0, 6.0, 1.1, t);
    float w2 = wave(vUv * 5.0 + 3.7, 4.0, -0.8, t);
    float shimmer = wave(vUv * 30.0, 12.0, 2.4, t) * 0.15;

    vec3 base = mix(uMainColor, uSecondaryColor, w1 * 0.6 + w2 * 0.4);
    vec3 color = mix(base, uHighlightColor, shimmer);

    // Soft highlight streaks (subtle reflections) drifting across the surface.
    float streak = smoothstep(0.85, 1.0, wave(vUv * vec2(2.0, 14.0), 3.0, 0.9, t));
    color = mix(color, uHighlightColor, streak * 0.35);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

type MercatorRef = { x: number; y: number; z: number; scale: number };

function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3((m.x - ref.x) / ref.scale, (m.y - ref.y) / ref.scale, (m.z - ref.z) / ref.scale);
}

/**
 * Creates the "three-water-layer" Mapbox custom layer: premium, animated,
 * semi-transparent sky-blue/cyan water over Dubai's marine areas.
 *
 * Usage: call once after the Mapbox style has loaded and the 3D buildings
 * layer has been added, e.g.:
 *
 *   map.addLayer(createThreeWaterLayer());
 *
 * Add it after markers/metro layers are registered in your layer stack if you
 * want it to sit visually beneath them; Mapbox custom layers render in the
 * order they were added relative to other layers passed a `beforeId`.
 */
export function createThreeWaterLayer(): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let map: mapboxgl.Map | null = null;
  let ref: MercatorRef | null = null;
  let clock: THREE.Clock | null = null;

  const meshes: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];

  let onResize: (() => void) | null = null;

  return {
    id: "three-water-layer",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      // Reference origin near the Marina — every polygon is positioned
      // relative to this point in local metre space.
      const origin = mapboxgl.MercatorCoordinate.fromLngLat([55.14, 25.1], 0);
      ref = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };

      for (const area of DUBAI_WATER_POLYGONS) {
        const shape = new THREE.Shape();
        area.ring.forEach(([lng, lat], i) => {
          const p = lngLatToLocal(lng, lat, ref!, 0);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        // Low-poly: a handful of interior subdivisions is enough for the
        // vertex ripple to read as gentle waves without a heavy mesh.
        const geometry = new THREE.ShapeGeometry(shape, 8);
        const material = new THREE.ShaderMaterial({
          vertexShader: waterVertexShader,
          fragmentShader: waterFragmentShader,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: {
            uTime: { value: 0 },
            uMainColor: { value: new THREE.Color(WATER_MAIN_COLOR) },
            uSecondaryColor: { value: new THREE.Color(WATER_SECONDARY_COLOR) },
            uHighlightColor: { value: new THREE.Color(WATER_HIGHLIGHT_COLOR) },
            uOpacity: { value: WATER_OPACITY },
          },
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = 0.4; // sit just above ground/water basemap, below markers/metro (rendered as DOM/separate layers)
        mesh.renderOrder = 0;
        scene.add(mesh);
        meshes.push(mesh);
        geometries.push(geometry);
        materials.push(material);
      }

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      // Keep the renderer's internal size synced — three.js doesn't observe
      // Mapbox's own canvas resizing since we share its context/canvas.
      onResize = () => {
        if (!renderer || !map) return;
        const canvas = map.getCanvas();
        renderer.setSize(canvas.width, canvas.height, false);
      };
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || !scene || !camera || !ref || !clock) return;
      const dt = Math.min(clock.getDelta(), 0.1);

      for (const mat of materials) {
        mat.uniforms.uTime.value += dt;
      }

      // Mapbox may pass the matrix directly (v2) or wrapped (v3 mercator/globe).
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

      // Animate continuously — ask Mapbox to schedule the next frame's render.
      map?.triggerRepaint();
    },

    onRemove() {
      if (onResize && map) map.off("resize", onResize);
      onResize = null;

      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
      meshes.length = 0;
      geometries.length = 0;
      materials.length = 0;

      renderer?.dispose();
      renderer = null;
      scene = null;
      camera = null;
      map = null;
      ref = null;
      clock = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
