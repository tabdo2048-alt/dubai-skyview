// Mapbox custom layer for transparent animated water surfaces and shoreline foam.
// It uses the shared Three.js renderer owned by Mapbox's WebGL context.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { DUBAI_CENTER } from "@/lib/dubai";
import { WATER_AREAS } from "@/lib/water";
import { SHORELINE_PATHS, type ShorelinePath } from "@/lib/shorelines";
import {
  acquireSharedRenderer,
  extractProjectionMatrix,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "@/lib/mapbox/sharedThreeRenderer";
import {
  buildWaterWaveGLSL,
  MAX_WAVE_AMPLITUDE,
  waterTimeSeconds,
} from "@/lib/mapbox/waterWaveModel";

// Development-only wireframe overlay of every water polygon (and its holes) so
// coverage can be checked against the coastline. Never enable in production.
const WATER_DEBUG = false;

// Water-mask debug mode: draws polygon outer rings (cyan), holes (red), and
// the triangulated mesh edges (green) so satellite alignment can be checked
// visually. Also attaches a map click handler that prints the clicked
// [lng, lat] to the console, for manually correcting boundary coordinates
// against the satellite basemap. Never enable in production.
//
// This is a RUNTIME flag (not a compile-time const) so the dev-only Water Debug
// Editor can toggle the mask on/off live. The mask geometry is always built in
// onAdd but stays hidden until enabled — flipping it is just a `.visible` change,
// no layer rebuild. Defaults off; the editor is the only thing that turns it on.
let waterMaskDebugEnabled = false;
const waterMaskDebugListeners = new Set<(enabled: boolean) => void>();

export function setWaterMaskDebug(enabled: boolean) {
  if (waterMaskDebugEnabled === enabled) return;
  waterMaskDebugEnabled = enabled;
  for (const listener of waterMaskDebugListeners) listener(enabled);
}

export function isWaterMaskDebugEnabled() {
  return waterMaskDebugEnabled;
}

// Any created water layer registers a listener so a live toggle reaches it even
// when there are two layers mounted (satellite + 3d). Returns an unsubscribe.
function subscribeWaterMaskDebug(listener: (enabled: boolean) => void) {
  waterMaskDebugListeners.add(listener);
  return () => {
    waterMaskDebugListeners.delete(listener);
  };
}

const SHORE_WAVES_ENABLED = true;
// Note: the old hand-drawn open-sea white ribbon meshes are retired — open-Gulf
// crest foam now comes from the water shader itself (see WATER_FRAGMENT).
// Bigger, faster breaking waves at the shore: a shorter cycle (waves arrive more
// often), ribbons spread further offshore and wider so the surf reads large.
const SHORE_WAVE_CYCLE_SECONDS = 4.6;
const SHORE_RIBBON_OFFSETS = [42, 30, 20, 12, 6] as const;
const BASE_SHORE_HALF_WIDTH_M = 9;
const SHORE_SAMPLE_STEP_M = 7;
const SHORE_Z = 0.62;

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

// Global alignment nudge in local metres for calibrating the whole water
// stack (surfaces, masks, foam — they all pass through lngLatToLocal, so they
// move together) against satellite-imagery georegistration. Leave at zero
// unless a uniform residual offset is measured with the Water Debug Editor
// click log; signs follow the local axes used below.
const WATER_ALIGN_OFFSET_M = { x: 0, y: 0 };

function lngLatToLocal(lng: number, lat: number, ref: MercatorRef, altitude = 0): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3(
    (m.x - ref.x) / ref.scale + WATER_ALIGN_OFFSET_M.x,
    (m.y - ref.y) / ref.scale + WATER_ALIGN_OFFSET_M.y,
    (m.z - ref.z) / ref.scale,
  );
}

function pointInLocalRing(point: THREE.Vector3, ring: THREE.Vector3[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

type LocalWaterMask = {
  outer: THREE.Vector3[];
  holes: THREE.Vector3[][];
};

function pointInLocalWaterMask(point: THREE.Vector3, mask: LocalWaterMask) {
  return (
    pointInLocalRing(point, mask.outer) && !mask.holes.some((hole) => pointInLocalRing(point, hole))
  );
}

function pointInAnyLocalWaterMask(point: THREE.Vector3, masks: LocalWaterMask[]) {
  return masks.some((mask) => pointInLocalWaterMask(point, mask));
}

// --- Shore distance field ---------------------------------------------------
// Per-vertex distance (metres) to the nearest REAL coastline segment, used by
// the water shader for shallow tinting, breaking surf bands, and the crisp
// waterline. Artificial water-water boundaries (the open-sea clipping
// rectangle and the Gulf <-> Palm-surround seam ring) are excluded so foam
// never appears in the middle of open water.
const SHORE_DIST_MAX_M = 400;
const SHORE_GRID_CELL_M = 256;

type SegmentGrid = {
  cells: Map<number, number[]>;
  ax: number[];
  ay: number[];
  bx: number[];
  by: number[];
};

function shoreGridKey(ix: number, iy: number): number {
  return (ix + 2048) * 8192 + (iy + 2048);
}

function buildShoreSegmentGrid(rings: THREE.Vector3[][]): SegmentGrid {
  const grid: SegmentGrid = { cells: new Map(), ax: [], ay: [], bx: [], by: [] };
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j];
      const b = ring[i];
      const index = grid.ax.length;
      grid.ax.push(a.x);
      grid.ay.push(a.y);
      grid.bx.push(b.x);
      grid.by.push(b.y);
      const minX = Math.floor(Math.min(a.x, b.x) / SHORE_GRID_CELL_M);
      const maxX = Math.floor(Math.max(a.x, b.x) / SHORE_GRID_CELL_M);
      const minY = Math.floor(Math.min(a.y, b.y) / SHORE_GRID_CELL_M);
      const maxY = Math.floor(Math.max(a.y, b.y) / SHORE_GRID_CELL_M);
      for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
          const key = shoreGridKey(cx, cy);
          const bucket = grid.cells.get(key);
          if (bucket) bucket.push(index);
          else grid.cells.set(key, [index]);
        }
      }
    }
  }
  return grid;
}

function shoreSegmentDistanceSq(grid: SegmentGrid, index: number, x: number, y: number): number {
  const ax = grid.ax[index];
  const ay = grid.ay[index];
  const dx = grid.bx[index] - ax;
  const dy = grid.by[index] - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq)) : 0;
  const px = ax + dx * t;
  const py = ay + dy * t;
  return (x - px) * (x - px) + (y - py) * (y - py);
}

function shoreDistance(grid: SegmentGrid, x: number, y: number): number {
  const cx = Math.floor(x / SHORE_GRID_CELL_M);
  const cy = Math.floor(y / SHORE_GRID_CELL_M);
  const maxRing = Math.ceil(SHORE_DIST_MAX_M / SHORE_GRID_CELL_M) + 1;
  let bestSq = SHORE_DIST_MAX_M * SHORE_DIST_MAX_M;
  for (let r = 0; r <= maxRing; r++) {
    // Once every cell in ring r-1 has been checked, any segment further out is
    // at least (r-1)*cell metres away — stop when that can't beat the best hit.
    const ringFloor = (r - 1) * SHORE_GRID_CELL_M;
    if (ringFloor > 0 && ringFloor * ringFloor > bestSq) break;
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iy = cy - r; iy <= cy + r; iy++) {
        if (r > 0 && ix !== cx - r && ix !== cx + r && iy !== cy - r && iy !== cy + r) continue;
        const bucket = grid.cells.get(shoreGridKey(ix, iy));
        if (!bucket) continue;
        for (const seg of bucket) {
          const d = shoreSegmentDistanceSq(grid, seg, x, y);
          if (d < bestSq) bestSq = d;
        }
      }
    }
  }
  return Math.sqrt(bestSq);
}

// Adaptive refinement: split triangles near the coastline so the interpolated
// shore-distance field (and the crisp waterline band) hugs the real boundary
// instead of smearing across big earcut slivers. Thresholds shrink per pass so
// refinement stays confined to the coastal band; already-tiny triangles are
// left alone.
const SHORE_REFINE_THRESHOLDS_M = [220, 110, 55] as const;
const SHORE_REFINE_MIN_EDGE_M = 12;

function subdivideNearShore(
  geometry: THREE.BufferGeometry,
  grid: SegmentGrid,
): THREE.BufferGeometry {
  let verts = Array.from((geometry.getAttribute("position") as THREE.BufferAttribute).array);
  geometry.dispose();
  const minEdgeSq = SHORE_REFINE_MIN_EDGE_M * SHORE_REFINE_MIN_EDGE_M;

  for (const threshold of SHORE_REFINE_THRESHOLDS_M) {
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

      const longestEdgeSq = Math.max(
        (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
        (cx - bx) * (cx - bx) + (cy - by) * (cy - by),
        (ax - cx) * (ax - cx) + (ay - cy) * (ay - cy),
      );
      const near =
        longestEdgeSq > minEdgeSq &&
        (shoreDistance(grid, ax, ay) < threshold ||
          shoreDistance(grid, bx, by) < threshold ||
          shoreDistance(grid, cx, cy) < threshold);
      if (!near) {
        out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        continue;
      }

      const abx = (ax + bx) / 2,
        aby = (ay + by) / 2,
        abz = (az + bz) / 2;
      const bcx = (bx + cx) / 2,
        bcy = (by + cy) / 2,
        bcz = (bz + cz) / 2;
      const cax = (cx + ax) / 2,
        cay = (cy + ay) / 2,
        caz = (cz + az) / 2;
      out.push(ax, ay, az, abx, aby, abz, cax, cay, caz);
      out.push(abx, aby, abz, bx, by, bz, bcx, bcy, bcz);
      out.push(cax, cay, caz, bcx, bcy, bcz, cx, cy, cz);
      out.push(abx, aby, abz, bcx, bcy, bcz, cax, cay, caz);
    }
    verts = out;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  return result;
}

// Per-vertex distance to a ring set, written to a named attribute. Used for two
// distinct fields: `aShoreDist` (nearest REAL coastline only — drives foam) and
// `aEdgeDist` (nearest of ALL the area's own rings incl. its outer ring — drives
// the height taper). Keeping them separate lets crests flatten to ~0 at every
// basin boundary (no seam walls, no lapping onto land) while foam still appears
// only along real coastline.
function attachDistances(geometry: THREE.BufferGeometry, grid: SegmentGrid, attribute: string) {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const source = positions.array;
  const dists = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    dists[i] = shoreDistance(grid, source[i * 3], source[i * 3 + 1]);
  }
  geometry.setAttribute(attribute, new THREE.BufferAttribute(dists, 1));
}

function subdivide(geometry: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
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
  uniform float uCycleSeconds;
  uniform vec3 uColor;

  float hash01(float value) {
    float x = sin(value * 12.9898) * 43758.5453;
    return x - floor(x);
  }

  void main() {
    float cycleLength = max(uCycleSeconds, 0.1);
    float cycle = mod(uTime, cycleLength) / cycleLength;
    float ribbonPhase = vRibbon / 5.0;
    float localPhase = fract(cycle - ribbonPhase + 0.18);
    float arrival =
      smoothstep(0.04, 0.16, localPhase) *
      (1.0 - smoothstep(0.42, 0.7, localPhase));

    float generationJitter = hash01(vPhase * 97.0 + uGeneration * 13.0);
    float generationMask = smoothstep(0.1, 0.42, generationJitter);
    float alongVariation =
      0.95 + 0.25 * sin(vAlong * 0.045 + vPhase * 6.2831 + uGeneration * 0.42);
    float edgeFade = pow(1.0 - vAcross, 2.2);
    float pulse = 0.72 + 0.24 * sin(uTime * 2.1 + vPhase * 9.0);
    float alpha =
      uOpacity *
      0.92 *
      vIntensity *
      vSegmentMask *
      generationMask *
      arrival *
      alongVariation *
      edgeFade *
      pulse;

    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`;

function makeShoreMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SHORE_VERTEX,
    fragmentShader: SHORE_FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uGeneration: { value: 0 },
      uOpacity: { value: 0.64 },
      uCycleSeconds: { value: SHORE_WAVE_CYCLE_SECONDS },
      uWidthScale: { value: 1 },
      uColor: { value: new THREE.Color(0xffffff) },
    },
  });
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

  const waterMasks: LocalWaterMask[] = WATER_AREAS.filter((area) => area.renderSurface).map(
    (area) => ({
      outer: area.polygon.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0)),
      holes: (area.holes ?? []).map((hole) =>
        hole.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0)),
      ),
    }),
  );

  for (const shoreline of SHORELINE_PATHS) {
    addShorelinePath(shoreline, ref, waterMasks, pushRibbonTri);
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
  waterMasks: LocalWaterMask[],
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

  // Narrow, curving basins (creek banks, Palm frond canals) are often
  // narrower than the full open-coast ribbon spread — probing/drawing that
  // far can overshoot past the opposite bank onto land, or miss water
  // entirely on a tight bend. Drop any ribbon ring whose reach would exceed
  // the path's configured cap, and probe at whichever reach is smaller.
  const ribbonOffsets = shoreline.maxReachMeters
    ? SHORE_RIBBON_OFFSETS.filter(
        (offset) =>
          shoreline.offsetMeters + offset + BASE_SHORE_HALF_WIDTH_M <= shoreline.maxReachMeters!,
      )
    : SHORE_RIBBON_OFFSETS;
  const widestOffset = ribbonOffsets.length > 0 ? ribbonOffsets[0] : SHORE_RIBBON_OFFSETS[0];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 1) continue;

    const tx = dx / segmentLength;
    const ty = dy / segmentLength;
    const preferredNx = -ty * shoreline.waterSide;
    const preferredNy = tx * shoreline.waterSide;
    const probeOffset = shoreline.offsetMeters + widestOffset + BASE_SHORE_HALF_WIDTH_M;
    const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    const preferredProbe = new THREE.Vector3(
      mid.x + preferredNx * probeOffset,
      mid.y + preferredNy * probeOffset,
      0,
    );
    const oppositeProbe = new THREE.Vector3(
      mid.x - preferredNx * probeOffset,
      mid.y - preferredNy * probeOffset,
      0,
    );
    const preferredIsWater = pointInAnyLocalWaterMask(preferredProbe, waterMasks);
    const oppositeIsWater = pointInAnyLocalWaterMask(oppositeProbe, waterMasks);
    const sideCorrection = !preferredIsWater && oppositeIsWater ? -1 : 1;
    const nx = preferredNx * sideCorrection;
    const ny = preferredNy * sideCorrection;
    const steps = Math.max(1, Math.ceil(segmentLength / SHORE_SAMPLE_STEP_M));

    for (let step = 0; step < steps; step++) {
      const s0 = (step / steps) * segmentLength;
      const s1 = ((step + 1) / steps) * segmentLength;
      const along0 = accumulated + s0;
      const along1 = accumulated + s1;
      const segmentSeed = baseHash + i * 97 + step * 13;
      const phase = hash01(segmentSeed);
      const segmentMask = hash01(segmentSeed + 41) > 0.08 ? 1 : 0;

      for (let ribbonIndex = 0; ribbonIndex < ribbonOffsets.length; ribbonIndex++) {
        const finalOffset = shoreline.offsetMeters + ribbonOffsets[ribbonIndex];
        const cx0 = a.x + tx * s0 + nx * finalOffset;
        const cy0 = a.y + ty * s0 + ny * finalOffset;
        const cx1 = a.x + tx * s1 + nx * finalOffset;
        const cy1 = a.y + ty * s1 + ny * finalOffset;

        // Clip to the water mask: pushRibbonTri extends each quad from
        // (offset - halfWidth) to (offset + halfWidth) along the normal (see
        // its -wx/+wx corners below), so a point near a sharp coastline curve
        // (real OSM traces are jagged, e.g. Palm Jumeirah's frond combs) can be
        // "in water" at the centerline yet have an edge poke onto land. Probe
        // all four actual corners of the quad about to be emitted and skip it
        // entirely unless the whole quad is submerged, so foam never bleeds
        // past the real shoreline.
        const halfX = nx * BASE_SHORE_HALF_WIDTH_M;
        const halfY = ny * BASE_SHORE_HALF_WIDTH_M;
        const quadIsWater =
          pointInAnyLocalWaterMask(new THREE.Vector3(cx0 - halfX, cy0 - halfY, 0), waterMasks) &&
          pointInAnyLocalWaterMask(new THREE.Vector3(cx0 + halfX, cy0 + halfY, 0), waterMasks) &&
          pointInAnyLocalWaterMask(new THREE.Vector3(cx1 - halfX, cy1 - halfY, 0), waterMasks) &&
          pointInAnyLocalWaterMask(new THREE.Vector3(cx1 + halfX, cy1 + halfY, 0), waterMasks);
        if (!quadIsWater) continue;

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

// Vertex + fragment share ONE copy of the Gerstner maths, generated from
// waterWaveModel.ts so the GPU surface matches the CPU boat physics exactly.
const WAVE_GLSL = buildWaterWaveGLSL();

const WATER_VERTEX = /* glsl */ `
  ${WAVE_GLSL}
  attribute float aShoreDist;
  attribute float aEdgeDist;
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vLocal;
  varying vec2 vBase;
  varying float vShoreDist;

  void main() {
    vec2 base = position.xy;
    // Vertical displacement only. Horizontal Gerstner shift is intentionally
    // NOT applied: adjacent water bodies share boundary rings but run different
    // uIntensity values, so shifting edge vertices horizontally opened animated
    // cracks along shared seams (Gulf vs Palm surround) and pushed the water
    // edge across the shoreline onto beaches. Crest shape still reads correctly
    // because lighting/foam are computed per-fragment from the wave field.
    float h = waterWaveHeight(base, uTime, uIntensity);
    // Shoaling: flatten crests over the last metres before ANY basin edge (its
    // own outer ring + holes) so animated water never laps past the polygon edge
    // and so both sides of a shared water-water seam meet at ~0 — no vertical
    // wall even with tall amplitudes. Band widened to 45 m to absorb the larger
    // crests smoothly.
    h *= smoothstep(0.0, 45.0, aEdgeDist);
    vec3 displaced = vec3(base, position.z + h);
    vBase = base;
    vLocal = displaced;
    vShoreDist = aShoreDist;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  precision highp float;
  ${WAVE_GLSL}
  varying vec3 vLocal;
  varying vec2 vBase;
  varying float vShoreDist;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uMaxAmp;
  uniform vec3 uCamLocal;
  uniform vec3 uSunDir;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uFoamColor;
  uniform float uOpacity;

  // Cheap value noise for restrained high-frequency normal detail.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec3 viewVec = uCamLocal - vLocal;
    float dist = length(viewVec);
    vec3 viewDir = viewVec / max(dist, 1e-4);

    // Per-fragment wave normal + height from the SAME Gerstner field — so
    // lighting is independent of triangle density across the huge Gulf polygon.
    vec3 waveNormal = waterWaveNormal(vBase, uTime, uIntensity);
    float height = waterWaveHeight(vBase, uTime, uIntensity);

    // Distance-based detail reduction: near water gets fine ripples, far water
    // settles so the surface never shimmers into aliasing at the horizon.
    float detail = 1.0 - smoothstep(250.0, 2000.0, dist);
    vec2 np = vLocal.xy * 0.09 + uTime * 0.12;
    float n = valueNoise(np)
      + 0.5 * valueNoise(np * 2.3 - uTime * 0.07)
      + 0.25 * valueNoise(np * 5.7 + uTime * 0.21);
    vec3 normal = normalize(waveNormal + vec3((n - 0.875) * 0.42 * detail, (valueNoise(np.yx * 1.31) - 0.5) * 0.42 * detail, 0.0));

    // Fresnel: grazing angles reflect the sky, steep angles show water color.
    float fres = pow(clamp(1.0 - max(dot(normal, viewDir), 0.0), 0.0, 1.0), 5.0);
    fres = mix(0.02, 1.0, fres);

    // Sun glint: broad warm sheen + tight glitter-modulated sparkle lobe.
    vec3 halfDir = normalize(uSunDir + viewDir);
    float specDot = max(dot(normal, halfDir), 0.0);
    float glitter = 0.35 + 0.65 * valueNoise(vLocal.xy * 1.7 + uTime * 0.9);
    float spec = pow(specDot, 48.0) * 0.16 + pow(specDot, 360.0) * 2.4 * glitter;

    // Deep vs shallow water color: true shore proximity drives the turquoise
    // shallows, with surface facing + crest height adding local variation.
    float facing = clamp(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float crest = clamp(height / max(uMaxAmp * uIntensity, 0.001), -1.0, 1.0);
    float shoreNear = 1.0 - smoothstep(0.0, 140.0, vShoreDist);
    float depthMix = clamp(facing * 0.45 + crest * 0.2 + 0.1 + shoreNear * 0.6, 0.0, 1.0);
    vec3 water = mix(uDeepColor, uShallowColor, depthMix);

    // Sky reflection via Fresnel, then warm sun glint.
    vec3 color = mix(water, uSkyColor, fres * 0.7);
    color += vec3(1.0, 0.96, 0.86) * spec;

    // Whitecaps ONLY on the sharpest, highest open-water crests.
    float foam = smoothstep(0.72, 0.98, crest) * smoothstep(0.35, 0.9, 1.0 - facing);
    foam *= 0.5 + 0.5 * valueNoise(vLocal.xy * 0.5 + uTime * 0.4);
    foam *= uIntensity;

    // Breaking surf: foam bands rolling toward every real coastline, fading
    // out ~95 m offshore. Band phase decreases with time so crests advance
    // shoreward; noise breaks the bands so they aren't ruler-straight.
    float surfZone = 1.0 - smoothstep(8.0, 95.0, vShoreDist);
    float bandPhase = fract(vShoreDist / 26.0 + uTime / 7.5);
    float band = smoothstep(0.68, 0.84, bandPhase) * (1.0 - smoothstep(0.84, 0.98, bandPhase));
    float surf = band * surfZone * (0.5 + 0.5 * valueNoise(vLocal.xy * 0.11 + uTime * 0.18));
    surf *= clamp(uIntensity, 0.0, 1.0);

    // Crisp waterline: solid bright foam edge hugging the shore polygon
    // boundary. Band width scales with camera distance so the line stays a
    // couple of pixels wide at every zoom — never sub-pixel shimmer far out,
    // never a fat blurry ribbon up close.
    float edgeHalfWidth = clamp(dist * 0.004, 2.0, 22.0);
    float edgeFoam = 1.0 - smoothstep(edgeHalfWidth * 0.4, edgeHalfWidth, vShoreDist);

    float foamTotal = clamp(foam * 0.6 + surf * 0.9 + edgeFoam, 0.0, 1.0);
    color = mix(color, uFoamColor, foamTotal * 0.85);

    float alpha = uOpacity * (0.82 + fres * 0.18) + spec * 0.12 + foamTotal * 0.3;
    alpha = mix(alpha, 0.95, edgeFoam * 0.85);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

type WaterMaterialOptions = {
  mode: "satellite" | "3d";
  intensity: number;
  openSea: boolean;
};

function makeWaterMaterial({
  mode,
  intensity,
  openSea,
}: WaterMaterialOptions): THREE.ShaderMaterial {
  const satellite = mode === "satellite";
  const opacity = satellite ? (openSea ? 0.22 : 0.2) : openSea ? 0.28 : 0.24;
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    // Real depth so land, piers, and islands can occlude water instead of it
    // painting over everything. depthWrite stays off (transparent surface) and a
    // tiny polygon offset keeps it off the terrain plane without z-fighting.
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uMaxAmp: { value: MAX_WAVE_AMPLITUDE },
      uCamLocal: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(-0.5, -0.35, 0.79).normalize() },
      uDeepColor: { value: new THREE.Color(satellite ? 0x1d7187 : 0x1a6d82) },
      uShallowColor: { value: new THREE.Color(satellite ? 0x559eaf : 0x4b9cad) },
      uSkyColor: { value: new THREE.Color(satellite ? 0x84beca : 0x8bc7d2) },
      uFoamColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: opacity },
    },
  });
}

// Build a triangulated, grid-refined water surface for one area. THREE.Shape
// handles the outer ring + holes (islands/land) via Earcut; the result is then
// subdivided so there are enough vertices for smooth Gerstner displacement even
// across the large offshore polygons.
function buildWaterGeometry(
  area: (typeof WATER_AREAS)[number],
  ref: MercatorRef,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  area.polygon.forEach(([lng, lat], i) => {
    const p = lngLatToLocal(lng, lat, ref, 0);
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();

  for (const hole of area.holes ?? []) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    hole.forEach(([lng, lat], i) => {
      const p = lngLatToLocal(lng, lat, ref, 0);
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    });
    path.closePath();
    shape.holes.push(path);
  }

  // Bigger, exposed areas need more subdivision for clean crests; sheltered
  // basins stay light. openSea areas are large -> 3 levels, others -> 2.
  const levels = area.openSea ? 3 : 2;
  const mask: LocalWaterMask = {
    outer: area.polygon.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0)),
    holes: (area.holes ?? []).map((hole) =>
      hole.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0)),
    ),
  };
  // Shore-distance attribute: only REAL coastline rings count as shore. The
  // open-sea outer ring is the artificial map-bounds clip, and a suppressOuterFoam
  // basin's outer ring (the Palm lagoon) is a water-water seam with the open sea —
  // foam along either would sit in the middle of open water. Land holes always
  // get foam.
  const holes = area.holes ?? [];
  const shoreRings: THREE.Vector3[][] = [];
  if (!area.openSea && !area.suppressOuterFoam) shoreRings.push(mask.outer);
  for (let i = 0; i < holes.length; i++) shoreRings.push(mask.holes[i]);
  const grid = buildShoreSegmentGrid(shoreRings);

  // Height-taper ring set: ALWAYS includes the area's own outer ring plus every
  // hole. Unlike the foam set above it never omits the outer ring, so crests
  // flatten to ~0 at every basin boundary — including water-water seams like the
  // Palm-lagoon mouth (suppressOuterFoam) where the open-sea side also tapers to
  // 0. Without this, taller amplitudes would open a visible vertical wall along
  // that seam. Foam still uses `grid` (real coast only), so the seam stays
  // foam-free.
  const edgeRings: THREE.Vector3[][] = [mask.outer, ...mask.holes];
  const edgeGrid = buildShoreSegmentGrid(edgeRings);

  const shapeGeometry = new THREE.ShapeGeometry(shape);
  warnIfTriangulationFailed(area.id, shapeGeometry, mask);

  const refined = subdivideNearShore(subdivide(shapeGeometry, levels), grid);
  attachDistances(refined, grid, "aShoreDist");
  attachDistances(refined, edgeGrid, "aEdgeDist");
  return refined;
}

// Ring shoelace area in local metres. Used only to sanity-check triangulation
// output, not for rendering.
function ringAreaLocal(ring: THREE.Vector3[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Earcut (via THREE.ShapeGeometry) can silently drop triangles or fail to
// close around a hole when the input ring is malformed (e.g. self-intersecting
// segments in hand-traced/OSM-sourced coastline data — see GULF_MAINLAND_LAND
// history). A ring with zero triangles, or whose meshed area is far short of
// the polygon-minus-holes area computed directly from the same points, means
// the water surface has a silent gap that would otherwise only show up as an
// unexplained patch of un-animated satellite water. Warn loudly so a bad
// coastline edit is caught at build/dev time instead of a screenshot review.
function warnIfTriangulationFailed(areaId: string, geometry: THREE.BufferGeometry, mask: LocalWaterMask) {
  const positions = geometry.getAttribute("position");
  // ShapeGeometry is indexed (shared vertices at triangle edges) — the
  // triangle list lives in the index buffer, not in sequential position
  // triples. Reading positions sequentially without the index would compute
  // garbage "triangles" from unrelated neighbouring vertices.
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : positions ? positions.count / 3 : 0;

  let meshArea = 0;
  if (positions && index) {
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      const ax = positions.getX(ia), ay = positions.getY(ia);
      const bx = positions.getX(ib), by = positions.getY(ib);
      const cx = positions.getX(ic), cy = positions.getY(ic);
      meshArea += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    }
  } else if (positions) {
    for (let i = 0; i < positions.count; i += 3) {
      const ax = positions.getX(i), ay = positions.getY(i);
      const bx = positions.getX(i + 1), by = positions.getY(i + 1);
      const cx = positions.getX(i + 2), cy = positions.getY(i + 2);
      meshArea += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    }
  }

  const expectedArea =
    ringAreaLocal(mask.outer) - mask.holes.reduce((sum, hole) => sum + ringAreaLocal(hole), 0);

  const shape = `outer ${mask.outer.length} pts, ${mask.holes.length} holes`;
  if (triangleCount === 0) {
    console.error(
      `[WaterLayer] "${areaId}" triangulated to 0 triangles — water surface is missing entirely (${shape}).`,
    );
  } else if (expectedArea > 0 && meshArea < expectedArea * 0.99) {
    console.error(
      `[WaterLayer] "${areaId}" mesh area (${meshArea.toFixed(0)} m²) is short of the expected polygon area (${expectedArea.toFixed(0)} m², ${((meshArea / expectedArea) * 100).toFixed(1)}%) — earcut likely dropped triangles around a malformed ring (${shape}).`,
    );
  }
}

// Builds a closed line loop from a [lng, lat] ring for WATER_MASK_DEBUG
// visualization (polygon outer rings in cyan, holes in red).
function buildRingLine(
  ring: [number, number][],
  ref: MercatorRef,
  color: number,
  z: number,
): THREE.LineLoop {
  const points = ring.map(([lng, lat]) => lngLatToLocal(lng, lat, ref, 0));
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const line = new THREE.LineLoop(geo, material);
  line.position.z = z;
  line.renderOrder = 6;
  line.frustumCulled = false;
  return line;
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
  const waterMaterials: THREE.ShaderMaterial[] = [];
  const debugLines: THREE.LineSegments[] = [];
  const maskDebugLines: THREE.LineLoop[] = [];
  // Every mask-debug object (tri-wire + ring/hole lines) so their visibility can
  // be toggled together at runtime by the Water Debug Editor.
  const maskDebugObjects: THREE.Object3D[] = [];
  // Areas built so far (across the chunked build queue), kept so mask-debug
  // geometry can be built lazily/retroactively when debug is first enabled.
  const builtAreas: { area: (typeof WATER_AREAS)[number]; geometry: THREE.BufferGeometry }[] = [];
  const maskDebugBuiltFor = new Set<string>();
  let disposed = false;
  let buildTimeout: number | null = null;
  let ref: MercatorRef;
  let clock: THREE.Clock;
  let onResize: (() => void) | null = null;
  let onMaskDebugClick: ((e: mapboxgl.MapMouseEvent) => void) | null = null;
  let unsubscribeMaskDebug: (() => void) | null = null;
  let shoreMesh: THREE.Mesh | null = null;
  let shoreMaterial: THREE.ShaderMaterial | null = null;
  let firstFrameLogged = false;
  let projectionWarned = false;
  const localToMercator = new THREE.Matrix4();
  const projectionMatrix = new THREE.Matrix4();
  const mercatorScale = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  const camMercator = new THREE.Vector3();

  const createShorelineBundle = (): ShorelineGeometryBundle => {
    const material = makeShoreMaterial();
    const mesh = new THREE.Mesh(buildShoreGeometry(ref), material);
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

      const originLngLat: [number, number] = [DUBAI_CENTER.lng, DUBAI_CENTER.lat];
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(originLngLat, 0);
      ref = {
        x: origin.x,
        y: origin.y,
        z: origin.z,
        scale: origin.meterInMercatorCoordinateUnits(),
      };

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      console.log("[Water] shared renderer acquired");
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);

      // Apply a mask-debug enabled/disabled state to this layer's objects and
      // its console click-logger. Called on init and whenever the runtime flag
      // flips (via the Water Debug Editor's toggle). Also builds mask-debug
      // geometry lazily for any area built before debug was first enabled —
      // see buildMaskDebugForArea below.
      const applyMaskDebug = (enabled: boolean) => {
        if (enabled) {
          for (const { area, geometry } of builtAreas) {
            if (!maskDebugBuiltFor.has(area.id)) buildMaskDebugForArea(area, geometry);
          }
        }
        for (const obj of maskDebugObjects) obj.visible = enabled;
        if (enabled && !onMaskDebugClick) {
          onMaskDebugClick = (e: mapboxgl.MapMouseEvent) => {
            const { lng, lat } = e.lngLat;
            console.log("[WaterMaskDebug]", `[${lng.toFixed(6)}, ${lat.toFixed(6)}]`);
          };
          map.on("click", onMaskDebugClick);
          console.log("[WaterMaskDebug] click the map to print [lng, lat] coordinates");
        } else if (!enabled && onMaskDebugClick) {
          map.off("click", onMaskDebugClick);
          onMaskDebugClick = null;
        }
        map.triggerRepaint();
      };

      // Mask-debug geometry (green triangulation wireframe + cyan/red ring
      // outlines) used to be built unconditionally for every area, hidden
      // behind `visible = false` — a large, pure-overhead pass (WireframeGeometry
      // over the full refined mesh) paid on every load even though the Water
      // Debug Editor is off in production. Build it lazily instead: only when
      // debug is actually enabled, either at build time (if already on) or
      // retroactively via applyMaskDebug above (if enabled later).
      function buildMaskDebugForArea(area: (typeof WATER_AREAS)[number], geometry: THREE.BufferGeometry) {
        maskDebugBuiltFor.add(area.id);
        // THREE.WireframeGeometry dedups edges in a JS Set; the open-sea basin's
        // shore-refined mesh has millions of edges and overflows the Set's max
        // size (RangeError), aborting the whole mask build before the alignment
        // rings are drawn. The green tri-wire is only a nicety — skip it for very
        // large meshes and always draw the cyan/red rings (the part that matters
        // for satellite alignment). ~500k verts ≈ safe edge-Set headroom.
        const vertCount = geometry.getAttribute("position")?.count ?? 0;
        if (vertCount <= 500_000) {
          const triWire = new THREE.WireframeGeometry(geometry);
          const triLine = new THREE.LineSegments(
            triWire,
            new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35 }),
          );
          triLine.position.z = 0.45;
          triLine.renderOrder = 5;
          triLine.frustumCulled = false;
          triLine.visible = waterMaskDebugEnabled;
          scene.add(triLine);
          debugLines.push(triLine);
          maskDebugObjects.push(triLine);
        } else {
          console.warn(
            `[WaterMaskDebug] "${area.id}" mesh too large for tri-wireframe (${vertCount} verts) — drawing ring outlines only.`,
          );
        }

        // Outer ring in cyan.
        const outer = buildRingLine(area.polygon, ref, 0x00ffff, 0.55);
        outer.visible = waterMaskDebugEnabled;
        scene.add(outer);
        maskDebugLines.push(outer);
        maskDebugObjects.push(outer);

        // Holes (excluded land) in red.
        for (const hole of area.holes ?? []) {
          const holeLine = buildRingLine(hole, ref, 0xff0000, 0.58);
          holeLine.visible = waterMaskDebugEnabled;
          scene.add(holeLine);
          maskDebugLines.push(holeLine);
          maskDebugObjects.push(holeLine);
        }
      }

      // One mesh + material per water body so each carries its own wave
      // intensity (calm Marina/Creek/canal, small Palm lagoon, full open Gulf).
      // Built one area per macrotask instead of all 8 synchronously in one go —
      // the biggest areas (open-arabian-gulf, dubai-creek) each triangulate and
      // shore-refine thousands of points, and doing all 8 back to back was the
      // single longest-running task on the main thread during initial load
      // (blocking input/paint/CDP for the whole duration). Spreading it over
      // several macrotasks costs nothing visually — the loading overlay is
      // already gone by the time this runs, so areas simply finish populating
      // over a few extra frames instead of all appearing in one frame.
      const buildQueue = WATER_AREAS.filter((area) => area.renderSurface);

      function buildArea(area: (typeof WATER_AREAS)[number]) {
        const valid =
          Array.isArray(area.polygon) &&
          area.polygon.length >= 3 &&
          area.polygon.every(
            (c) =>
              Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]),
          );
        if (!valid) {
          console.warn("[Water] invalid polygon skipped", area.id);
          return;
        }

        const material = makeWaterMaterial({
          mode,
          intensity: area.waveIntensity ?? 1,
          openSea: area.openSea ?? false,
        });
        const geometry = buildWaterGeometry(area, ref);
        const water = new THREE.Mesh(geometry, material);
        // Tiny lift keeps water off the exact terrain plane; polygon offset in
        // the material does the real z-fighting prevention.
        water.position.z = 0.15;
        water.renderOrder = 1;
        water.frustumCulled = false;
        waterMaterials.push(material);
        waters.push(water);
        scene.add(water);
        builtAreas.push({ area, geometry });

        if (WATER_DEBUG) {
          const wire = new THREE.WireframeGeometry(geometry);
          const line = new THREE.LineSegments(
            wire,
            new THREE.LineBasicMaterial({ color: area.openSea ? 0xff3366 : 0x33ff99 }),
          );
          line.position.z = 0.5;
          line.renderOrder = 5;
          line.frustumCulled = false;
          debugLines.push(line);
          scene.add(line);
        }

        if (waterMaskDebugEnabled) buildMaskDebugForArea(area, geometry);
      }

      function buildNext() {
        if (disposed) return;
        const area = buildQueue.shift();
        if (!area) {
          console.log(
            "[Water] rendered surface ids:",
            WATER_AREAS.filter((a) => a.renderSurface).map((a) => a.id),
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
          console.log("[Water] total areas:", waters.length);
          buildTimeout = null;
          return;
        }
        buildArea(area);
        map.triggerRepaint();
        buildTimeout = window.setTimeout(buildNext, 0);
      }
      buildTimeout = window.setTimeout(buildNext, 0);

      applyMaskDebug(waterMaskDebugEnabled);
      unsubscribeMaskDebug = subscribeWaterMaskDebug(applyMaskDebug);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;
      clock.getDelta();
      const elapsed = clock.elapsedTime;
      // Shared, layer-independent wave clock so the surface and the boats
      // (Model3DLayer) evaluate the identical wave field at the identical t.
      const waveTime = waterTimeSeconds();

      // Camera position in local metres space, for Fresnel + specular.
      const cam = map.getFreeCameraOptions().position;
      if (cam) {
        camMercator.set(cam.x, cam.y, cam.z);
        camLocal.set(
          (camMercator.x - ref.x) / ref.scale,
          (camMercator.y - ref.y) / ref.scale,
          (camMercator.z - ref.z) / ref.scale,
        );
      }

      for (const material of waterMaterials) {
        material.uniforms.uTime.value = waveTime;
        (material.uniforms.uCamLocal.value as THREE.Vector3).copy(camLocal);
      }

      if (shoreMaterial) {
        shoreMaterial.uniforms.uTime.value = elapsed;
        shoreMaterial.uniforms.uGeneration.value = Math.floor(elapsed / SHORE_WAVE_CYCLE_SECONDS);
        shoreMaterial.uniforms.uCycleSeconds.value = SHORE_WAVE_CYCLE_SECONDS;
        shoreMaterial.uniforms.uWidthScale.value = getShoreWaveWidthMeters(map.getZoom()) / 18;
      }

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

      mercatorScale.set(ref.scale, ref.scale, ref.scale);
      localToMercator.makeTranslation(ref.x, ref.y, ref.z).scale(mercatorScale);
      camera.matrixWorld.identity();
      camera.matrixWorldInverse.identity();
      camera.projectionMatrix.copy(projectionMatrix.fromArray(mArr).multiply(localToMercator));

      renderer.resetState();
      renderer.render(scene, camera);

      if (!firstFrameLogged) {
        console.log("[Water] first frame rendered");
        firstFrameLogged = true;
      }
      map.triggerRepaint();
    },

    onRemove() {
      disposed = true;
      if (buildTimeout != null) {
        clearTimeout(buildTimeout);
        buildTimeout = null;
      }
      if (onResize) map.off("resize", onResize);
      onResize = null;
      if (unsubscribeMaskDebug) unsubscribeMaskDebug();
      unsubscribeMaskDebug = null;
      if (onMaskDebugClick) map.off("click", onMaskDebugClick);
      onMaskDebugClick = null;
      for (const water of waters) {
        scene.remove(water);
        water.geometry.dispose();
      }
      waters.length = 0;
      for (const material of waterMaterials) material.dispose();
      waterMaterials.length = 0;
      for (const line of debugLines) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      debugLines.length = 0;
      for (const line of maskDebugLines) {
        scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      maskDebugLines.length = 0;
      maskDebugObjects.length = 0;
      if (shoreMesh) {
        scene.remove(shoreMesh);
        shoreMesh.geometry.dispose();
        shoreMesh = null;
      }
      shoreMaterial?.dispose();
      shoreMaterial = null;
      builtAreas.length = 0;
      maskDebugBuiltFor.clear();
      releaseSharedRenderer();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
