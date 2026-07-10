// Mapbox custom layer for a transparent animated water surface.
// It renders cyan/deep-blue moving water clipped to Dubai's real marine basins.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { WATER_AREAS, type WaterArea } from "@/lib/water";
import {
  acquireSharedRenderer,
  releaseSharedRenderer,
  syncSharedRendererSize,
  extractProjectionMatrix,
} from "@/lib/mapbox/sharedThreeRenderer";

// --- Shoreline-wave tuning -------------------------------------------------
// Thin white foam lines that hug the coast just inside the water, regenerated
// with fresh noise every few seconds and animated continuously. Easy to tune.
const SHORE_WAVES_ENABLED = true;
const SHORE_WAVE_REGEN_MS = 5000; // rebuild the broken foam lines this often
const SHORE_WAVE_FADE_MS = 900; // crossfade old→new so it never flashes
const SHORE_WAVE_MIN_OFFSET_M = 15; // nearest a foam line sits to the shore
const SHORE_WAVE_MAX_OFFSET_M = 35; // farthest a foam line sits from the shore
const SHORE_WAVE_SPEED = 0.5; // foam flow speed along the line
const SHORE_WAVE_WIDTH_M = 11; // ribbon width (world meters ≈ thin line at city zoom)
const SHORE_SEG_MIN_M = 30; // broken-segment length range…
const SHORE_SEG_MAX_M = 90;
const SHORE_GAP_MIN_M = 15; // …and the gaps between them
const SHORE_GAP_MAX_M = 45;
const SHORE_SAMPLE_STEP_M = 10; // centerline sample spacing
const SHORE_MAX_EDGE_M = 3200; // skip suspiciously long (artificial) edges
const SHORE_Z = 0.6; // just above the water surface (z≈0.2), below boats (z≈1+)

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

// --- Shoreline foam lines --------------------------------------------------
// White broken lines running parallel to the coast, just INSIDE the water.
// Regenerated with fresh noise every few seconds and crossfaded so the change
// is never a hard flash. The flow (moving brightness + gaps + pulse) is done in
// the fragment shader from per-vertex distance/phase attributes.

const SHORE_VERTEX = /* glsl */ `
  attribute float aDist;
  attribute float aEdge;
  attribute float aPhase;
  attribute float aIntensity;
  varying float vDist;
  varying float vEdge;
  varying float vPhase;
  varying float vIntensity;
  void main() {
    vDist = aDist;
    vEdge = aEdge;
    vPhase = aPhase;
    vIntensity = aIntensity;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHORE_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vDist;
  varying float vEdge;
  varying float vPhase;
  varying float vIntensity;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFlowSpeed;
  uniform float uWaveScale;
  uniform float uFade;
  uniform vec3 uColor;

  void main() {
    // Soft perpendicular falloff — bright centre, transparent ribbon edges.
    float across = 1.0 - vEdge;
    across = across * across;

    // Brightness that travels along the line (foam crests moving to shore).
    float flow = fract(vDist * uWaveScale - uTime * uFlowSpeed + vPhase);
    float crest = smoothstep(0.0, 0.35, flow) * smoothstep(1.0, 0.55, flow);

    // Gentle, non-synchronised pulsing per segment.
    float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vPhase * 6.2831);

    float a = uOpacity * uFade * vIntensity * across * (0.32 + crest * 0.9) * pulse;
    gl_FragColor = vec4(uColor, a);
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
      uOpacity: { value: 0.8 },
      uFlowSpeed: { value: SHORE_WAVE_SPEED },
      uWaveScale: { value: 0.02 },
      uFade: { value: 0 },
      uColor: { value: new THREE.Color(0xffffff) },
    },
  });
}

// Signed area of a ring in LOCAL xy (>0 => CCW => interior is left of each
// directed edge). Computed in local space so the inward offset matches the
// space the ribbon is built and rendered in.
function localSignedArea(pts: THREE.Vector3[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

type ShoreLog = { initialized: boolean; areasLogged: Set<string> };

// Build one merged BufferGeometry of all shoreline foam ribbons. `rand` lets
// each regeneration use fresh noise. Only real coastline is drawn: open-sea
// areas and excluded/over-long edges are skipped.
function buildShoreGeometry(ref: MercatorRef, rand: () => number, log?: ShoreLog): THREE.BufferGeometry {
  const positions: number[] = [];
  const dists: number[] = [];
  const edges: number[] = [];
  const phases: number[] = [];
  const intensities: number[] = [];

  const half = SHORE_WAVE_WIDTH_M / 2;
  let intensity = 1; // set per area below

  const pushVert = (x: number, y: number, d: number, e: number, ph: number) => {
    positions.push(x, y, SHORE_Z);
    dists.push(d);
    edges.push(e);
    phases.push(ph);
    intensities.push(intensity);
  };

  for (const area of WATER_AREAS as WaterArea[]) {
    if (area.openSea) continue;
    intensity = area.shorelineIntensity ?? 1;
    const excluded = new Set(area.shorelineExcludedEdges ?? []);
    const pts = area.polygon.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0));
    if (pts.length < 3) {
      console.warn("[ShoreWaves] invalid polygon", area.id);
      continue;
    }
    const ccw = localSignedArea(pts) > 0;
    let anySegment = false;

    for (let i = 0; i < pts.length; i++) {
      if (excluded.has(i)) continue;
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const edgeLen = Math.hypot(dx, dy); // local units ≈ metres
      if (edgeLen < 1) continue;
      if (edgeLen > SHORE_MAX_EDGE_M) {
        console.warn("[ShoreWaves] skipped artificial edge", area.id, i);
        continue;
      }
      // Unit direction + inward normal (points into the water polygon).
      const tx = dx / edgeLen;
      const ty = dy / edgeLen;
      const nx = ccw ? -ty : ty;
      const ny = ccw ? tx : -tx;

      // Walk the edge laying down broken segments with gaps.
      let pos = rand() * SHORE_GAP_MAX_M; // random start so lines don't align across regens
      while (pos < edgeLen) {
        const segLen = SHORE_SEG_MIN_M + rand() * (SHORE_SEG_MAX_M - SHORE_SEG_MIN_M);
        const end = Math.min(pos + segLen, edgeLen);
        const phase = rand();
        const offset = SHORE_WAVE_MIN_OFFSET_M + rand() * (SHORE_WAVE_MAX_OFFSET_M - SHORE_WAVE_MIN_OFFSET_M);

        // Sample the segment centreline, offset inward + a little wobble.
        const samples: { x: number; y: number; d: number }[] = [];
        let s = pos;
        let acc = 0;
        let prevX = 0;
        let prevY = 0;
        let first = true;
        while (s <= end + 0.001) {
          const wobble = (rand() - 0.5) * 6; // ±3 m natural noise
          const cx = a.x + tx * s + nx * (offset + wobble);
          const cy = a.y + ty * s + ny * (offset + wobble);
          if (!first) acc += Math.hypot(cx - prevX, cy - prevY);
          samples.push({ x: cx, y: cy, d: acc });
          prevX = cx;
          prevY = cy;
          first = false;
          s += SHORE_SAMPLE_STEP_M;
        }
        if (samples.length >= 2) {
          // Emit a 3-wide ribbon (left/centre/right) as two triangle rows,
          // using the inward normal as the ribbon's perpendicular.
          for (let k = 0; k < samples.length - 1; k++) {
            const p0 = samples[k];
            const p1 = samples[k + 1];
            const l0x = p0.x + nx * half, l0y = p0.y + ny * half;
            const r0x = p0.x - nx * half, r0y = p0.y - ny * half;
            const l1x = p1.x + nx * half, l1y = p1.y + ny * half;
            const r1x = p1.x - nx * half, r1y = p1.y - ny * half;
            // left→centre strip
            pushVert(l0x, l0y, p0.d, 1, phase);
            pushVert(p0.x, p0.y, p0.d, 0, phase);
            pushVert(l1x, l1y, p1.d, 1, phase);
            pushVert(p0.x, p0.y, p0.d, 0, phase);
            pushVert(p1.x, p1.y, p1.d, 0, phase);
            pushVert(l1x, l1y, p1.d, 1, phase);
            // centre→right strip
            pushVert(p0.x, p0.y, p0.d, 0, phase);
            pushVert(r0x, r0y, p0.d, 1, phase);
            pushVert(p1.x, p1.y, p1.d, 0, phase);
            pushVert(r0x, r0y, p0.d, 1, phase);
            pushVert(r1x, r1y, p1.d, 1, phase);
            pushVert(p1.x, p1.y, p1.d, 0, phase);
          }
          anySegment = true;
        }
        pos = end + SHORE_GAP_MIN_M + rand() * (SHORE_GAP_MAX_M - SHORE_GAP_MIN_M);
      }
    }
    if (log && !log.areasLogged.has(area.id)) {
      if (anySegment) console.log("[ShoreWaves] area generated", area.id);
      else console.warn("[ShoreWaves] empty shoreline geometry", area.id);
      log.areasLogged.add(area.id);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("aDist", new THREE.BufferAttribute(new Float32Array(dists), 1));
  geo.setAttribute("aEdge", new THREE.BufferAttribute(new Float32Array(edges), 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(phases), 1));
  geo.setAttribute("aIntensity", new THREE.BufferAttribute(new Float32Array(intensities), 1));
  return geo;
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
    float whitecap = smoothstep(0.76, 1.0, swell) * 0.5;
    float depthMix = clamp(swell * 0.65 + w3 * 0.35, 0.0, 1.0);
    float highlight = glint * 0.2 + fineGlint + whitecap;

    vec3 water = mix(uDeepColor, uWaterColor, depthMix);
    vec3 color = mix(water, uFoamColor, highlight);
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
      uWaterColor: { value: new THREE.Color(satellite ? 0xeafcff : 0xdff7ff) },
      uDeepColor: { value: new THREE.Color(satellite ? 0xc9f3ff : 0xbdeeff) },
      uFoamColor: { value: new THREE.Color(0xffffff) },
      uDistortion: { value: satellite ? 0.2 : 0.26 },
      uOpacity: { value: satellite ? 0.28 : 0.18 },
      uWaveHeight: { value: satellite ? 3.8 : 2.2 },
      uWaveScale: { value: 0.0035 },
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
  let firstFrameLogged = false;
  let projectionWarned = false;
  const localToMercator = new THREE.Matrix4();
  const projectionMatrix = new THREE.Matrix4();
  const mercatorScale = new THREE.Vector3();

  // Shoreline-wave state: a current (fading-in) generation and an optional
  // previous (fading-out) generation, crossfaded on each 5s regeneration.
  type ShoreGen = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial };
  let shoreCurrent: ShoreGen | null = null;
  let shorePrev: ShoreGen | null = null;
  let shoreLastRegen = -Infinity;
  let shoreFadeStart = 0;
  const shoreLog: ShoreLog = { initialized: false, areasLogged: new Set() };

  const disposeShoreGen = (g: ShoreGen | null) => {
    if (!g) return;
    scene.remove(g.mesh);
    g.mesh.geometry.dispose();
    g.mat.dispose();
  };

  const regenShore = (now: number) => {
    // Retire whatever was still fading out, promote current → previous, and
    // build a fresh generation that fades in.
    disposeShoreGen(shorePrev);
    shorePrev = shoreCurrent;
    const geo = buildShoreGeometry(ref, Math.random, shoreLog);
    const mat = makeShoreMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2; // above the water surface (1), below boats (own layer)
    mesh.frustumCulled = false;
    scene.add(mesh);
    shoreCurrent = { mesh, mat };
    shoreFadeStart = now;
    shoreLastRegen = now;
    if (shoreLog.initialized) console.log("[ShoreWaves] regeneration complete");
  };

  const updateShore = (now: number) => {
    if (!SHORE_WAVES_ENABLED) return;
    if (now - shoreLastRegen >= SHORE_WAVE_REGEN_MS / 1000) regenShore(now);
    const fadeSecs = SHORE_WAVE_FADE_MS / 1000;
    if (shoreCurrent) {
      const ft = Math.min(1, (now - shoreFadeStart) / fadeSecs);
      shoreCurrent.mat.uniforms.uFade.value = ft;
      shoreCurrent.mat.uniforms.uTime.value = now;
      if (shorePrev) {
        shorePrev.mat.uniforms.uFade.value = 1 - ft;
        shorePrev.mat.uniforms.uTime.value = now;
        if (ft >= 1) {
          disposeShoreGen(shorePrev);
          shorePrev = null;
        }
      }
    }
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
        // Skip malformed areas instead of letting one bad polygon break the
        // whole layer — a ring needs at least 3 finite coordinates.
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

        // Subdivide so the vertex-shader wave displacement has interior vertices
        // to ripple (ShapeGeometry alone is a flat, boundary-only fan).
        const geometry = subdivide(new THREE.ShapeGeometry(shape), 2);
        // Keep the surface just above the basemap water but well below boats
        // (which sit ~1m+ up), avoiding z-fighting with the imagery.
        const water = new THREE.Mesh(geometry, waterMaterial);
        water.position.z = 0.2;
        water.renderOrder = 1;
        waters.push(water);
        scene.add(water);
        console.log("[Water] area created", area.id);
      }

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      console.log("[Water] shared renderer acquired");
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
      console.log("[Water] total areas:", waters.length);

      // Build the first shoreline-wave generation (subsequent ones regenerate
      // on the 5s timer inside render()). shoreLastRegen = -Infinity forces the
      // first render frame to generate immediately.
      if (SHORE_WAVES_ENABLED) {
        regenShore(0);
        shoreLog.initialized = true;
        console.log("[ShoreWaves] initialized");
      }
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;
      const dt = Math.min(clock.getDelta(), 0.1);

      if (waterMaterial?.uniforms.uTime) waterMaterial.uniforms.uTime.value += dt * 0.8;

      // Drive shoreline-wave animation, regeneration and crossfade. clock's
      // elapsedTime only advances while we render (tab visible + active), so
      // both the flow and the 5s timer pause and resume cleanly.
      updateShore(clock.elapsedTime);

      const mArr = extractProjectionMatrix(matrix);
      if (!mArr) {
        // No projection this frame — skip cleanly and ask for another so the
        // surface never freezes waiting on a matrix. Log the shape once so an
        // unexpected Mapbox matrix format is diagnosable.
        if (!projectionWarned) {
          console.warn(
            "[Water] Mapbox projection matrix unavailable — shape:",
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
      for (const w of waters) {
        w.geometry.dispose();
      }
      waters.length = 0;
      waterMaterial?.dispose();
      waterMaterial = null;
      // Dispose both shoreline-wave generations (geometry + material).
      disposeShoreGen(shoreCurrent);
      disposeShoreGen(shorePrev);
      shoreCurrent = null;
      shorePrev = null;
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
