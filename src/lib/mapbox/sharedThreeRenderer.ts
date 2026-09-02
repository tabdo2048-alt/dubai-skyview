// A single shared THREE.WebGLRenderer for all Mapbox custom three.js layers.
//
// Mapbox hands every custom layer the SAME WebGL context (the map's canvas
// context). Creating one THREE.WebGLRenderer per layer means multiple renderers
// fight over that single context — each one's resetState()/render() corrupts
// the others', so typically only one (or neither) renders. Sharing a single
// renderer instance across every layer avoids that entirely.

import * as THREE from "three";

let renderer: THREE.WebGLRenderer | null = null;
let refCount = 0;
let boundCanvas: HTMLCanvasElement | null = null;

/**
 * Acquire the shared renderer, creating it against Mapbox's canvas/context on
 * first use. Every custom layer that renders three.js should call this in its
 * `onAdd` and release it in `onRemove`.
 */
export function acquireSharedRenderer(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
): THREE.WebGLRenderer {
  if (!renderer || boundCanvas !== canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    renderer.autoClear = false;
    boundCanvas = canvas;
  }
  refCount++;
  return renderer;
}

/**
 * Release a reference to the shared renderer. The renderer itself is kept alive
 * as long as at least one layer still holds it (disposing it would break the
 * remaining layers, since they share Mapbox's context).
 */
export function releaseSharedRenderer(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && renderer) {
    renderer.dispose();
    renderer = null;
    boundCanvas = null;
  }
}

/** Keep the shared renderer's drawing-buffer size in sync with the canvas. */
export function syncSharedRendererSize(canvas: HTMLCanvasElement): void {
  renderer?.setSize(canvas.width, canvas.height, false);
}

// Mapbox hands a custom layer's render(gl, matrix) a projection matrix whose
// SHAPE varies by version/projection:
//  - Mapbox GL v2 (mercator): `matrix` is a plain number[] (length 16).
//  - Mapbox GL v3 (globe/mercator): `matrix` is an object; the 16-float
//    view-projection lives at `.defaultProjectionData.mainMatrix`.
//  - Some builds pass a Float32Array/Float64Array (fails Array.isArray!).
// Extract the 16-length array from any of these; return null if none found.
export function extractProjectionMatrix(matrix: unknown): number[] | null {
  const isMat16 = (v: unknown): v is ArrayLike<number> =>
    !!v && typeof v === "object" && typeof (v as ArrayLike<number>).length === "number" && (v as ArrayLike<number>).length === 16;

  // Plain array or typed array handed directly.
  if (isMat16(matrix)) return Array.from(matrix as ArrayLike<number>);

  const obj = matrix as
    | {
        defaultProjectionData?: { mainMatrix?: ArrayLike<number> };
        mainMatrix?: ArrayLike<number>;
        projMatrix?: ArrayLike<number>;
      }
    | undefined;
  const candidate =
    obj?.defaultProjectionData?.mainMatrix ?? obj?.mainMatrix ?? obj?.projMatrix;
  if (isMat16(candidate)) return Array.from(candidate as ArrayLike<number>);

  return null;
}
