// Mapbox custom layer for transparent animated water surfaces and shoreline foam.
// It uses the shared Three.js renderer owned by Mapbox's WebGL context.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { OPEN_SEA_WAVE_PATHS, type OpenSeaWavePath } from "@/lib/openSeaWaves";
import { WATER_AREAS } from "@/lib/water";
import { SHORELINE_PATHS, type ShorelinePath } from "@/lib/shorelines";
import {
  acquireSharedRenderer,
  extractProjectionMatrix,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "@/lib/mapbox/sharedThreeRenderer";

const SHORE_WAVES_ENABLED = true;
const OPEN_SEA_WAVES_ENABLED = true;
const SHORE_WAVE_CYCLE_SECONDS = 4.5;
const SHORE_RIBBON_OFFSETS = [42, 28, 14] as const;
const BASE_SHORE_HALF_WIDTH_M = 13;
const SHORE_SAMPLE_STEP_M = 7;
const SHORE_Z = 0.62;
const OPEN_SEA_WAVE_Z = 0.74;

type MercatorRef = {
  x: number;
  y: number;
  z: number;
  scale: number;
};

type ShorelineGeometryBundle = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
};

type OpenSeaWaveGeometryBundle = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
};

function getShoreWaveWidthMeters(zoom: number): number {
  if (zoom <= 10) return 18;
  if (zoom <= 12) return 14;
  if (zoom <= 14) return 10;
  return 7;
}

function hash01(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h;
}

function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3(
    (m.x - ref.x) / ref.scale,
    (m.y - ref.y) / ref.scale,
    (m.z - ref.z) / ref.scale,
  );
}

function subdivide(geometry: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
  const nonIndexed = geometry.toNonIndexed();
  let verts = Array.from((nonIndexed.getAttribute("position") as THREE.BufferAttribute).array);
  nonIndexed.dispose();

  for (let level = 0; level < levels; level++) {
    const out: number[] = [];
    for (let i = 0; i < verts.length; i += 9) {
      const ax = verts[i],
        ay = verts[i + 1],
        az = verts[i + 2];
      const bx = verts[i + 3],
        by = verts[i + 4],
        bz = verts[i + 5];
      const cx = verts[i + 6],
        cy = verts[i + 7],
        cz = verts[i + 8];
      const abx = (ax + bx) / 2,
        aby = (ay + by) / 2,
        abz = (az + bz) / 2;
      const bcx = (bx + cx) / 2,
        bcy = (by + cy) / 2,
        bcz = (bz + cz) / 2;
      const cax = (cx + ax) / 2,
        cay = (cy + ay) / 2,
        caz = (cz + az) / 2;
      out.push(
        ax,
        ay,
        az,
        abx,
        aby,
        abz,
        cax,
        cay,
        caz,
        abx,
        aby,
        abz,
        bx,
        by,
        bz,
        bcx,
        bcy,
        bcz,
        cax,
        cay,
        caz,
        bcx,
        bcy,
        bcz,
        cx,
        cy,
        cz,
        abx,
        aby,
        abz,
        bcx,
        bcy,
        bcz,
        cax,
        cay,
        caz,
      );
    }
    verts = out;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  return result;
}

const SHORE_VERTEX = /* glsl */ `
  attribute float aAlong;
  attribute float aAcross;
  attribute float aRibbon;
  attribute float aPhase;
  attribute float aIntensity;
  attribute float aSegmentMask;
  attribute float aWidthX;
  attribute float aWidthY;
  varying float vAlong;
  varying float vAcross;
  varying float vRibbon;
  varying float vPhase;
  varying float vIntensity;
  varying float vSegmentMask;
  uniform float uWidthScale;

  void main() {
    vec3 p = position;
    p.xy += vec2(aWidthX, aWidthY) * (uWidthScale - 1.0);
    vAlong = aAlong;
    vAcross = aAcross;
    vRibbon = aRibbon;
    vPhase = aPhase;
    vIntensity = aIntensity;
    vSegmentMask = aSegmentMask;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SHORE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vAlong;
  varying float vAcross;
  varying float vRibbon;
  varying float vPhase;
  varying float vIntensity;
  varying float vSegmentMask;
  uniform float uTime;
  uniform float uGeneration;
  uniform float uOpacity;
  uniform vec3 uColor;

  float hash01(float value) {
    float x = sin(value * 12.9898) * 43758.5453;
    return x - floor(x);
  }

  void main() {
    float cycle = mod(uTime, 3.2) / 3.2;
    float ribbonPhase = vRibbon / 3.0;
    float localPhase = fract(cycle - ribbonPhase + 0.18);
    float arrival =
      smoothstep(0.04, 0.16, localPhase) *
      (1.0 - smoothstep(0.42, 0.7, localPhase));

    float generationJitter = hash01(vPhase * 97.0 + uGeneration * 13.0);
    float generationMask = smoothstep(0.1, 0.42, generationJitter);
    float alongVariation =
      0.95 + 0.25 * sin(vAlong * 0.045 + vPhase * 6.2831 + uGeneration * 0.42);
    float edgeFade = pow(1.0 - vAcross, 2.2);
    float pulse = 0.75 + 0.35 * sin(uTime * 2.1 + vPhase * 9.0);
    float alpha =
      uOpacity *
      1.18 *
      vIntensity *
      vSegmentMask *
      generationMask *
      arrival *
      alongVariation *
      edgeFade *
      pulse;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeShoreMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHORE_VERTEX,
    fragmentShader: SHORE_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uGeneration: { value: 0 },
      uOpacity: { value: 1.12 },
      uWidthScale: { value: 1 },
      uColor: { value: new THREE.Color(0xffffff) },
    },
  });
}

const OPEN_SEA_VERTEX = /* glsl */ `
  attribute float aAlong;
  attribute float aAcross;
  attribute float aPhase;
  attribute float aIntensity;
  varying float vAlong;
  varying float vAcross;
  varying float vPhase;
  varying float vIntensity;

  void main() {
    vAlong = aAlong;
    vAcross = aAcross;
    vPhase = aPhase;
    vIntensity = aIntensity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const OPEN_SEA_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vAlong;
  varying float vAcross;
  varying float vPhase;
  varying float vIntensity;
  uniform float uTime;
  uniform float uOpacity;

  float hash01(float value) {
    float x = sin(value * 12.9898) * 43758.5453;
    return x - floor(x);
  }

  void main() {
    float distanceFade = 1.0 - smoothstep(0.18, 1.0, abs(vAcross));
    float wavePulse = sin(vAlong * 0.028 - uTime * 1.45 + vPhase * 6.2831) * 0.5 + 0.5;
    float crest = smoothstep(0.5, 0.95, wavePulse);
    float segmentNoise = hash01(floor(vAlong * 0.028) + vPhase * 311.0);
    float broken = smoothstep(0.16, 0.54, segmentNoise);
    float shimmer = 0.7 + 0.3 * sin(vAlong * 0.01 + uTime * 0.58 + vPhase * 9.0);
    float alpha = uOpacity * 1.25 * vIntensity * distanceFade * crest * broken * shimmer;
    gl_FragColor = vec4(vec3(1.0), alpha);
  }
`;

function makeOpenSeaWaveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: OPEN_SEA_VERTEX,
    fragmentShader: OPEN_SEA_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.72 },
    },
  });
}

function buildOpenSeaWaveGeometry(ref: MercatorRef): THREE.BufferGeometry {
  const positions: number[] = [];
  const alongs: number[] = [];
  const acrosses: number[] = [];
  const phases: number[] = [];
  const intensities: number[] = [];

  const pushVertex = (
    x: number,
    y: number,
    along: number,
    across: number,
    phase: number,
    intensity: number,
  ) => {
    positions.push(x, y, OPEN_SEA_WAVE_Z);
    alongs.push(along);
    acrosses.push(across);
    phases.push(phase);
    intensities.push(intensity);
  };

  for (const wavePath of OPEN_SEA_WAVE_PATHS) {
    addOpenSeaWavePath(wavePath, ref, pushVertex);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(alongs), 1));
  geometry.setAttribute("aAcross", new THREE.BufferAttribute(new Float32Array(acrosses), 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(phases), 1));
  geometry.setAttribute("aIntensity", new THREE.BufferAttribute(new Float32Array(intensities), 1));
  return geometry;
}

function addOpenSeaWavePath(
  wavePath: OpenSeaWavePath,
  ref: MercatorRef,
  pushVertex: (
    x: number,
    y: number,
    along: number,
    across: number,
    phase: number,
    intensity: number,
  ) => void,
) {
  const points = wavePath.points.map(([lng, lat]) => lngLatToLocal(lng, lat, ref));
  const phase = hash01(idHash(wavePath.id));
  let accumulated = 0;

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;

    const nx = (-dy / length) * (wavePath.widthMeters / 2);
    const ny = (dx / length) * (wavePath.widthMeters / 2);
    const startAlong = accumulated;
    const endAlong = accumulated + length;
    pushVertex(start.x - nx, start.y - ny, startAlong, -1, phase, wavePath.intensity);
    pushVertex(start.x + nx, start.y + ny, startAlong, 1, phase, wavePath.intensity);
    pushVertex(end.x - nx, end.y - ny, endAlong, -1, phase, wavePath.intensity);
    pushVertex(start.x + nx, start.y + ny, startAlong, 1, phase, wavePath.intensity);
    pushVertex(end.x + nx, end.y + ny, endAlong, 1, phase, wavePath.intensity);
    pushVertex(end.x - nx, end.y - ny, endAlong, -1, phase, wavePath.intensity);
    accumulated = endAlong;
  }
}

function buildShoreGeometry(ref: MercatorRef): THREE.BufferGeometry {
  const positions: number[] = [];
  const alongs: number[] = [];
  const acrosses: number[] = [];
  const ribbons: number[] = [];
  const phases: number[] = [];
  const intensities: number[] = [];
  const segmentMasks: number[] = [];
  const widthXs: number[] = [];
  const widthYs: number[] = [];

  const pushVert = (
    x: number,
    y: number,
    along: number,
    across: number,
    ribbon: number,
    phase: number,
    intensity: number,
    segmentMask: number,
    widthX: number,
    widthY: number,
  ) => {
    positions.push(x, y, SHORE_Z);
    alongs.push(along);
    acrosses.push(across);
    ribbons.push(ribbon);
    phases.push(phase);
    intensities.push(intensity);
    segmentMasks.push(segmentMask);
    widthXs.push(widthX);
    widthYs.push(widthY);
  };

  const pushRibbonTri = (
    cx0: number,
    cy0: number,
    a0: number,
    cx1: number,
    cy1: number,
    a1: number,
    nx: number,
    ny: number,
    ribbon: number,
    phase: number,
    intensity: number,
    segmentMask: number,
  ) => {
    const wx = nx * BASE_SHORE_HALF_WIDTH_M;
    const wy = ny * BASE_SHORE_HALF_WIDTH_M;
    pushVert(cx0 - wx, cy0 - wy, a0, 1, ribbon, phase, intensity, segmentMask, -wx, -wy);
    pushVert(cx0, cy0, a0, 0, ribbon, phase, intensity, segmentMask, 0, 0);
    pushVert(cx1 - wx, cy1 - wy, a1, 1, ribbon, phase, intensity, segmentMask, -wx, -wy);
    pushVert(cx0, cy0, a0, 0, ribbon, phase, intensity, segmentMask, 0, 0);
    pushVert(cx1, cy1, a1, 0, ribbon, phase, intensity, segmentMask, 0, 0);
    pushVert(cx1 - wx, cy1 - wy, a1, 1, ribbon, phase, intensity, segmentMask, -wx, -wy);

    pushVert(cx0, cy0, a0, 0, ribbon, phase, intensity, segmentMask, 0, 0);
    pushVert(cx0 + wx, cy0 + wy, a0, 1, ribbon, phase, intensity, segmentMask, wx, wy);
    pushVert(cx1, cy1, a1, 0, ribbon, phase, intensity, segmentMask, 0, 0);
    pushVert(cx0 + wx, cy0 + wy, a0, 1, ribbon, phase, intensity, segmentMask, wx, wy);
    pushVert(cx1 + wx, cy1 + wy, a1, 1, ribbon, phase, intensity, segmentMask, wx, wy);
    pushVert(cx1, cy1, a1, 0, ribbon, phase, intensity, segmentMask, 0, 0);
  };

  for (const shoreline of SHORELINE_PATHS) {
    addShorelinePath(shoreline, ref, pushRibbonTri);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(alongs), 1));
  geo.setAttribute("aAcross", new THREE.BufferAttribute(new Float32Array(acrosses), 1));
  geo.setAttribute("aRibbon", new THREE.BufferAttribute(new Float32Array(ribbons), 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(phases), 1));
  geo.setAttribute("aIntensity", new THREE.BufferAttribute(new Float32Array(intensities), 1));
  geo.setAttribute("aSegmentMask", new THREE.BufferAttribute(new Float32Array(segmentMasks), 1));
  geo.setAttribute("aWidthX", new THREE.BufferAttribute(new Float32Array(widthXs), 1));
  geo.setAttribute("aWidthY", new THREE.BufferAttribute(new Float32Array(widthYs), 1));
  return geo;
}

function addShorelinePath(
  shoreline: ShorelinePath,
  ref: MercatorRef,
  pushRibbonTri: (
    cx0: number,
    cy0: number,
    a0: number,
    cx1: number,
    cy1: number,
    a1: number,
    nx: number,
    ny: number,
    ribbon: number,
    phase: number,
    intensity: number,
    segmentMask: number,
  ) => void,
) {
  const pts = shoreline.points.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0));
  const baseHash = idHash(shoreline.id);
  let accumulated = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 1) continue;

    const tx = dx / segmentLength;
    const ty = dy / segmentLength;
    const nx = -ty * shoreline.waterSide;
    const ny = tx * shoreline.waterSide;
    const steps = Math.max(1, Math.ceil(segmentLength / SHORE_SAMPLE_STEP_M));

    for (let step = 0; step < steps; step++) {
      const s0 = (step / steps) * segmentLength;
      const s1 = ((step + 1) / steps) * segmentLength;
      const along0 = accumulated + s0;
      const along1 = accumulated + s1;
      const segmentSeed = baseHash + i * 97 + step * 13;
      const phase = hash01(segmentSeed);
      const segmentMask = hash01(segmentSeed + 41) > 0.26 ? 1 : 0;

      for (let ribbonIndex = 0; ribbonIndex < SHORE_RIBBON_OFFSETS.length; ribbonIndex++) {
        const finalOffset = shoreline.offsetMeters + SHORE_RIBBON_OFFSETS[ribbonIndex];
        const cx0 = a.x + tx * s0 + nx * finalOffset;
        const cy0 = a.y + ty * s0 + ny * finalOffset;
        const cx1 = a.x + tx * s1 + nx * finalOffset;
        const cy1 = a.y + ty * s1 + ny * finalOffset;
        pushRibbonTri(
          cx0,
          cy0,
          along0,
          cx1,
          cy1,
          along1,
          nx,
          ny,
          ribbonIndex,
          phase,
          shoreline.intensity,
          segmentMask,
        );
      }
    }

    accumulated += segmentLength;
  }
}

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  uniform float uTime;
  uniform float uWaveHeight;
  uniform float uWaveScale;

  float wave(vec2 p, vec2 dir, float freq, float speed) {
    return sin(dot(p, normalize(dir)) * freq + uTime * speed);
  }

  void main() {
    vec3 displaced = position;
    vec2 p = position.xy * uWaveScale;
    float h = wave(p, vec2(1.0, 0.35), 7.0, 1.15) * 0.45;
    h += wave(p, vec2(-0.25, 1.0), 10.0, 0.82) * 0.35;
    h += wave(p, vec2(0.75, -0.55), 15.0, 1.45) * 0.20;
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
  uniform vec3 uFoamColor;
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
    float whitecap = smoothstep(0.72, 1.0, swell) * 0.7;
    float depthMix = clamp(swell * 0.65 + w3 * 0.35, 0.0, 1.0);
    float highlight = glint * 0.12 + fineGlint * 0.10 + whitecap * 0.22;
    vec3 water = mix(uDeepColor, uWaterColor, depthMix);
    vec3 color = mix(water, uFoamColor, highlight);
    float alpha = uOpacity * (0.86 + swell * 0.12 + glint * 0.10);
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
      uWaterColor: { value: new THREE.Color(satellite ? 0x4fa9bd : 0x56b5ca) },
      uDeepColor: { value: new THREE.Color(satellite ? 0x145e73 : 0x1c7187) },
      uFoamColor: { value: new THREE.Color(0xffffff) },
      uDistortion: { value: satellite ? 0.25 : 0.32 },
      uOpacity: { value: satellite ? 0.23 : 0.18 },
      uWaveHeight: { value: satellite ? 1.9 : 1.55 },
      uWaveScale: { value: 0.0044 },
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
  let shoreMesh: THREE.Mesh | null = null;
  let shoreMaterial: THREE.ShaderMaterial | null = null;
  let openSeaMesh: THREE.Mesh | null = null;
  let openSeaMaterial: THREE.ShaderMaterial | null = null;
  let firstFrameLogged = false;
  let projectionWarned = false;
  const localToMercator = new THREE.Matrix4();
  const projectionMatrix = new THREE.Matrix4();
  const mercatorScale = new THREE.Vector3();

  const createShorelineBundle = (): ShorelineGeometryBundle => {
    const material = makeShoreMaterial();
    const mesh = new THREE.Mesh(buildShoreGeometry(ref), material);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return { mesh, material };
  };

  const createOpenSeaWaveBundle = (): OpenSeaWaveGeometryBundle => {
    const material = makeOpenSeaWaveMaterial();
    const mesh = new THREE.Mesh(buildOpenSeaWaveGeometry(ref), material);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return { mesh, material };
  };

  return {
    id: "dubai-water-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      console.log("[Water] creating layer", { mode });

      const originLngLat: [number, number] = [55.138, 25.1];
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(originLngLat, 0);
      ref = {
        x: origin.x,
        y: origin.y,
        z: origin.z,
        scale: origin.meterInMercatorCoordinateUnits(),
      };

      waterMaterial = makeWaterMaterial(mode);
      for (const area of WATER_AREAS) {
        if (!area.renderSurface) {
          console.log("[Water] surface skipped", area.id);
          continue;
        }

        const valid =
          Array.isArray(area.polygon) &&
          area.polygon.length >= 3 &&
          area.polygon.every(
            (c) =>
              Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]),
          );
        if (!valid) {
          console.warn("[Water] invalid polygon skipped", area.id);
          continue;
        }

        const shape = new THREE.Shape();
        area.polygon.forEach(([lng, lat], i) => {
          const p = lngLatToLocal(lng, lat, ref, 0);
          if (i === 0) shape.moveTo(p.x, p.y);
          else shape.lineTo(p.x, p.y);
        });
        shape.closePath();

        const geometry = subdivide(new THREE.ShapeGeometry(shape), 2);
        const water = new THREE.Mesh(geometry, waterMaterial);
        water.position.z = 0.2;
        water.renderOrder = 1;
        waters.push(water);
        scene.add(water);
      }

      console.log(
        "[Water] rendered surface ids:",
        WATER_AREAS.filter((area) => area.renderSurface).map((area) => area.id),
      );

      if (SHORE_WAVES_ENABLED) {
        console.log("[ShoreWaves] using dedicated shoreline paths");
        console.log(
          "[ShoreWaves] active paths:",
          SHORELINE_PATHS.map((shoreline) => shoreline.id),
        );
        const bundle = createShorelineBundle();
        shoreMesh = bundle.mesh;
        shoreMaterial = bundle.material;
        scene.add(shoreMesh);
        console.log("[ShoreWaves] geometry created once");
      }

      if (OPEN_SEA_WAVES_ENABLED) {
        const bundle = createOpenSeaWaveBundle();
        openSeaMesh = bundle.mesh;
        openSeaMaterial = bundle.material;
        scene.add(openSeaMesh);
        console.log("[OpenSeaWaves] wide swell tracks created", OPEN_SEA_WAVE_PATHS.length);
      }

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      console.log("[Water] shared renderer acquired");
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
      console.log("[Water] total areas:", waters.length);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;

      if (waterMaterial?.uniforms.uTime) waterMaterial.uniforms.uTime.value += dt * 0.8;
      if (shoreMaterial) {
        shoreMaterial.uniforms.uTime.value = elapsed;
        shoreMaterial.uniforms.uGeneration.value = Math.floor(elapsed / SHORE_WAVE_CYCLE_SECONDS);
        shoreMaterial.uniforms.uWidthScale.value = getShoreWaveWidthMeters(map.getZoom()) / 18;
      }
      if (openSeaMaterial) openSeaMaterial.uniforms.uTime.value = elapsed;

      const mArr = extractProjectionMatrix(matrix);
      if (!mArr) {
        if (!projectionWarned) {
          console.warn(
            "[Water] Mapbox projection matrix unavailable - shape:",
            matrix && typeof matrix === "object" ? Object.keys(matrix as object) : typeof matrix,
          );
          projectionWarned = true;
        }
        map.triggerRepaint();
        return;
      }

      mercatorScale.set(ref.scale, -ref.scale, ref.scale);
      localToMercator.makeTranslation(ref.x, ref.y, ref.z).scale(mercatorScale);
      camera.projectionMatrix = projectionMatrix.fromArray(mArr).multiply(localToMercator);

      renderer.resetState();
      renderer.render(scene, camera);

      if (!firstFrameLogged) {
        console.log("[Water] first frame rendered");
        firstFrameLogged = true;
      }
      map.triggerRepaint();
    },

    onRemove() {
      if (onResize) map.off("resize", onResize);
      onResize = null;
      for (const water of waters) {
        water.geometry.dispose();
      }
      waters.length = 0;
      waterMaterial?.dispose();
      waterMaterial = null;
      if (shoreMesh) {
        scene.remove(shoreMesh);
        shoreMesh.geometry.dispose();
        shoreMesh = null;
      }
      shoreMaterial?.dispose();
      shoreMaterial = null;
      if (openSeaMesh) {
        scene.remove(openSeaMesh);
        openSeaMesh.geometry.dispose();
        openSeaMesh = null;
      }
      openSeaMaterial?.dispose();
      openSeaMaterial = null;
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
