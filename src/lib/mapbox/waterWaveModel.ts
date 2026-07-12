// Canonical Gerstner wave model shared by the water surface shader (GPU) and the
// boat buoyancy physics (CPU). There is exactly ONE set of wave parameters here;
// the GLSL used by WaterLayer.ts is GENERATED from the same array via
// buildWaterWaveGLSL(), so the surface the eye sees and the surface boats float
// on can never drift apart.
//
// Local coordinate space: WaterLayer and Model3DLayer both use the SAME Mercator
// reference origin ([55.138, 25.1]) and divide by meterInMercatorCoordinateUnits,
// so local X/Y are in METRES. Wavelengths/amplitudes below are therefore in
// metres and directly comparable between CPU and GPU.

import * as THREE from "three";

export type WaterWaveParam = {
  /** Heading the crest travels toward, degrees (0 = +X/east, 90 = +Y/north). */
  directionDeg: number;
  /** Crest-to-crest distance in metres. */
  wavelength: number;
  /** Vertical amplitude in metres. */
  amplitude: number;
  /** Gerstner steepness 0..1 — pinches crests via horizontal displacement. */
  steepness: number;
  /** Phase speed in metres/second. */
  speed: number;
  /** Static phase offset in radians so waves don't all align at t=0. */
  phase: number;
};

// Two long ocean swells, two broad low-frequency waves, two medium waves, two
// small detail waves. The long swells (420m/760m) are what keeps the WHOLE Gulf
// visibly moving at city-scale zoom — the shorter waves vanish below one pixel
// there. Broad, clearly visible motion without becoming a cartoon. `intensity`
// scales these values down for protected Marina, Creek, and canal water.
export const WATER_WAVE_PARAMS: WaterWaveParam[] = [
  { directionDeg: 310, wavelength: 760, amplitude: 1.3, steepness: 0.16, speed: 34, phase: 5.9 },
  { directionDeg: 295, wavelength: 420, amplitude: 1.0, steepness: 0.22, speed: 25, phase: 2.3 },
  { directionDeg: 300, wavelength: 165, amplitude: 0.66, steepness: 0.58, speed: 10.2, phase: 0.0 },
  { directionDeg: 284, wavelength: 112, amplitude: 0.48, steepness: 0.55, speed: 8.4, phase: 1.7 },
  { directionDeg: 322, wavelength: 56, amplitude: 0.25, steepness: 0.48, speed: 6.0, phase: 3.1 },
  { directionDeg: 258, wavelength: 34, amplitude: 0.17, steepness: 0.4, speed: 4.8, phase: 4.6 },
  { directionDeg: 210, wavelength: 16, amplitude: 0.075, steepness: 0.3, speed: 3.3, phase: 0.9 },
  { directionDeg: 32, wavelength: 9.5, amplitude: 0.045, steepness: 0.24, speed: 2.5, phase: 5.4 },
];

type CompiledWave = {
  dirX: number;
  dirY: number;
  k: number; // wavenumber 2π/L
  omega: number; // angular speed = k * phase-speed
  amplitude: number;
  qA: number; // steepness * amplitude, the Gerstner horizontal magnitude
  phase: number;
};

const COMPILED: CompiledWave[] = WATER_WAVE_PARAMS.map((w) => {
  const rad = (w.directionDeg * Math.PI) / 180;
  const k = (2 * Math.PI) / w.wavelength;
  return {
    dirX: Math.cos(rad),
    dirY: Math.sin(rad),
    k,
    omega: k * w.speed,
    amplitude: w.amplitude,
    qA: w.steepness * w.amplitude,
    phase: w.phase,
  };
});

/** Sum of all wave amplitudes — the theoretical crest height at intensity 1. */
export const MAX_WAVE_AMPLITUDE = WATER_WAVE_PARAMS.reduce((s, w) => s + w.amplitude, 0);

export type WaveSample = {
  /** Vertical displacement (metres) of the surface at (x, y, t). */
  height: number;
  /** Up-facing surface normal in local space. */
  normal: THREE.Vector3;
  /** ∂height/∂x — surface slope along local +X. */
  slopeX: number;
  /** ∂height/∂y — surface slope along local +Y. */
  slopeY: number;
};

// A shared, monotonic wave clock so BOTH custom layers evaluate the waves at the
// same t regardless of when each layer was added. Uses performance.now() (app
// runtime, always available in the browser) rather than per-layer THREE.Clocks.
let waveEpochMs = 0;
export function waterTimeSeconds(): number {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (waveEpochMs === 0) waveEpochMs = now;
  return (now - waveEpochMs) / 1000;
}

/**
 * CPU evaluation of the height field z = Σ Aᵢ·sin(θᵢ) with analytic normal.
 * Equivalent to the generated GLSL waterWaveHeight()/waterWaveNormal(). Pass a
 * reusable `target` to avoid per-frame allocation in the boat loop.
 */
export function sampleWaterWave(
  x: number,
  y: number,
  elapsedSeconds: number,
  intensity = 1,
  target?: WaveSample,
): WaveSample {
  let height = 0;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < COMPILED.length; i++) {
    const w = COMPILED[i];
    const theta = w.k * (w.dirX * x + w.dirY * y) - w.omega * elapsedSeconds + w.phase;
    const a = w.amplitude * intensity;
    height += a * Math.sin(theta);
    const ak = a * w.k * Math.cos(theta);
    nx += w.dirX * ak;
    ny += w.dirY * ak;
  }
  const out: WaveSample =
    target ?? ({ height: 0, normal: new THREE.Vector3(), slopeX: 0, slopeY: 0 } as WaveSample);
  out.height = height;
  out.slopeX = nx;
  out.slopeY = ny;
  out.normal.set(-nx, -ny, 1).normalize();
  return out;
}

// --- GLSL generation -------------------------------------------------------
// Emits the exact same maths as sampleWaterWave() as unrolled WebGL1 GLSL so
// there is no second copy of the wave logic to keep in sync.
function glslFloat(n: number): string {
  const s = n.toFixed(7);
  return s.includes(".") ? s : `${s}.0`;
}

/**
 * Returns a GLSL chunk defining, in local metres space:
 *   float waterWaveHeight(vec2 p, float t, float intensity)
 *   vec3  waterWaveNormal(vec2 p, float t, float intensity)   // normalised
 *   vec2  waterWaveDisplaceXY(vec2 p, float t, float intensity) // Gerstner shift
 * Prepend this to a THREE.ShaderMaterial vertex/fragment shader.
 */
export function buildWaterWaveGLSL(): string {
  const heightLines: string[] = [];
  const normalLines: string[] = [];
  const dispLines: string[] = [];
  COMPILED.forEach((w, i) => {
    const theta = `theta${i}`;
    heightLines.push(
      `  float ${theta} = ${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(
        w.dirY,
      )} * p.y) - ${glslFloat(w.omega)} * t + ${glslFloat(w.phase)};`,
      `  h += ${glslFloat(w.amplitude)} * intensity * sin(${theta});`,
    );
    normalLines.push(
      `  float ${theta} = ${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(
        w.dirY,
      )} * p.y) - ${glslFloat(w.omega)} * t + ${glslFloat(w.phase)};`,
      `  float ak${i} = ${glslFloat(w.amplitude)} * intensity * ${glslFloat(w.k)} * cos(${theta});`,
      `  nx += ${glslFloat(w.dirX)} * ak${i};`,
      `  ny += ${glslFloat(w.dirY)} * ak${i};`,
    );
    dispLines.push(
      `  float ${theta} = ${glslFloat(w.k)} * (${glslFloat(w.dirX)} * p.x + ${glslFloat(
        w.dirY,
      )} * p.y) - ${glslFloat(w.omega)} * t + ${glslFloat(w.phase)};`,
      `  float qc${i} = ${glslFloat(w.qA)} * intensity * cos(${theta});`,
      `  d += vec2(${glslFloat(w.dirX)}, ${glslFloat(w.dirY)}) * qc${i};`,
    );
  });

  return /* glsl */ `
    float waterWaveHeight(vec2 p, float t, float intensity) {
      float h = 0.0;
${heightLines.join("\n")}
      return h;
    }

    vec3 waterWaveNormal(vec2 p, float t, float intensity) {
      float nx = 0.0;
      float ny = 0.0;
${normalLines.join("\n")}
      return normalize(vec3(-nx, -ny, 1.0));
    }

    vec2 waterWaveDisplaceXY(vec2 p, float t, float intensity) {
      vec2 d = vec2(0.0);
${dispLines.join("\n")}
      return d;
    }
  `;
}
