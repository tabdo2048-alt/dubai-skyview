// Shared Mercator→local-metres transform for Mapbox custom Three.js layers.
//
// WaterLayer.ts and the vessel layer must place geometry in the SAME local
// coordinate frame so boats float exactly on the visible water surface. That
// frame is: origin at DUBAI_CENTER, axes in METRES (divide the mercator delta
// by meterInMercatorCoordinateUnits). Local +X = east, local +Y = SOUTH (the
// mercator Y axis points south), local +Z = up (altitude).
//
// WaterLayer.ts keeps its own private copies of this maths (unchanged, so the
// 3D water stays byte-identical); the formulas here are identical to it, so any
// layer built on this module aligns pixel-for-pixel with the water.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { DUBAI_CENTER } from "@/lib/dubai";

export type MercatorRef = { x: number; y: number; z: number; scale: number };

/** Build the shared reference origin from DUBAI_CENTER (matches WaterLayer). */
export function makeMercatorRef(): MercatorRef {
  const origin = mapboxgl.MercatorCoordinate.fromLngLat(
    [DUBAI_CENTER.lng, DUBAI_CENTER.lat],
    0,
  );
  return {
    x: origin.x,
    y: origin.y,
    z: origin.z,
    scale: origin.meterInMercatorCoordinateUnits(),
  };
}

/** lng/lat (+ optional altitude in metres) → local metres. Writes into `target`
 *  when supplied to avoid per-frame allocation in the render loop. */
export function lngLatToLocal(
  lng: number,
  lat: number,
  ref: MercatorRef,
  altitude = 0,
  target?: THREE.Vector3,
): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  const out = target ?? new THREE.Vector3();
  return out.set(
    (m.x - ref.x) / ref.scale,
    (m.y - ref.y) / ref.scale,
    (m.z - ref.z) / ref.scale,
  );
}

/** Compose the local-metres → mercator matrix Mapbox's projection expects:
 *  translate(ref) · scale(ref.scale). Multiply Mapbox's proj matrix by this. */
export function composeLocalToMercator(
  target: THREE.Matrix4,
  ref: MercatorRef,
): THREE.Matrix4 {
  return target
    .makeTranslation(ref.x, ref.y, ref.z)
    .scale(new THREE.Vector3(ref.scale, ref.scale, ref.scale));
}
