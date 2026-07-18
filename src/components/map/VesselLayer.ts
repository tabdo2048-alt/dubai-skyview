// Mapbox custom layer that sails procedural 3D vessels along water lanes,
// floating each one exactly on the shared Gerstner wave surface.
//
// It reuses the water stack's machinery so boats and water can never drift
// apart: the SAME shared THREE.WebGLRenderer (Mapbox's one GL context), the
// SAME Mercator origin / local-metres frame (mercatorLocal.ts), and the SAME
// wave field + clock (waterWaveModel.ts). Local space: +X east, +Y south,
// +Z up, units metres.

import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import {
  acquireSharedRenderer,
  extractProjectionMatrix,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "@/lib/mapbox/sharedThreeRenderer";
import {
  lngLatToLocal,
  makeMercatorRef,
  type MercatorRef,
} from "@/lib/mapbox/mercatorLocal";
import {
  sampleWaterWave,
  waterTimeSeconds,
  type WaveSample,
} from "@/lib/mapbox/waterWaveModel";
import { pointAlongPath } from "@/lib/metro";
import { VESSEL_FLEET, type Path } from "@/lib/marineRoutes";

type Vessel = {
  mesh: THREE.Group;
  route: Path;
  offset: number; // starting fraction along the lane, 0..1
  speedMps: number; // metres per second (real sailing speed)
  lengthM: number; // lane length in metres (precomputed once)
  sizeScale: number;
  intensity: number;
};

// Lane length in METRES, measured in the shared local frame so speeds are real
// m/s regardless of how long the [lng,lat] polyline happens to be.
function routeLengthMeters(route: Path, ref: MercatorRef): number {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    lngLatToLocal(route[i - 1][0], route[i - 1][1], ref, 0, a);
    lngLatToLocal(route[i][0], route[i][1], ref, 0, b);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total || 1;
}

export function createVesselLayer(
  controller?: { shouldRender: () => boolean },
  mode: "satellite" | "3d" = "3d",
): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  let ref: MercatorRef;
  let onResize: (() => void) | null = null;
  let disposed = false;
  let firstFrameLogged = false;
  let projectionWarned = false;
  const vessels: Vessel[] = [];

  // Per-frame scratch — allocate once, never in the render loop.
  const localToMercator = new THREE.Matrix4();
  const projectionMatrix = new THREE.Matrix4();
  const mercatorScale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const posAhead = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 0, 1);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();
  const wave: WaveSample = {
    height: 0,
    normal: new THREE.Vector3(0, 0, 1),
    slopeX: 0,
    slopeY: 0,
  };

  return {
    id: "dubai-vessels-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      scene = new THREE.Scene();
      camera = new THREE.Camera();
      ref = makeMercatorRef();

      console.log("[Vessels] creating layer", { mode });

      scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a2130, 1.1));
      const key = new THREE.DirectionalLight(0xfff0d8, 1.2);
      key.position.set(60, 40, 120); // +Z up, high key
      scene.add(key);

      // Build the fleet once. Each spec spawns `count` copies staggered evenly
      // along its lane so a route is never empty and copies don't overlap.
      for (const spec of VESSEL_FLEET) {
        for (let i = 0; i < spec.count; i++) {
          const mesh = spec.build();
          mesh.matrixAutoUpdate = false; // we drive the matrix every frame
          mesh.frustumCulled = false;
          scene.add(mesh);
          vessels.push({
            mesh,
            route: spec.route,
            offset: i / spec.count,
            speedMps: spec.speedMps,
            lengthM: routeLengthMeters(spec.route, ref),
            sizeScale: spec.sizeScale,
            intensity: spec.intensity,
          });
        }
      }

      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      onResize = () => syncSharedRendererSize(map.getCanvas());
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || (controller && !controller.shouldRender())) return;

      const t = waterTimeSeconds();

      for (const v of vessels) {
        // Distance travelled in metres → fraction along the lane, so speed is a
        // real m/s independent of the lane's length.
        const dist = (v.offset * v.lengthM + v.speedMps * t) % v.lengthM;
        let d = dist / v.lengthM;
        if (d < 0) d += 1;
        const ahead = (d + 8 / v.lengthM) % 1; // look ~8 m ahead for heading

        const cur = pointAlongPath(v.route, d).coord;
        const nxt = pointAlongPath(v.route, ahead).coord;
        lngLatToLocal(cur[0], cur[1], ref, 0, pos);
        lngLatToLocal(nxt[0], nxt[1], ref, 0, posAhead);

        // Heading from LOCAL-space deltas (mercator Y points south, so lng/lat
        // deltas would give the wrong sign). Model forward = +X.
        const yaw = Math.atan2(posAhead.y - pos.y, posAhead.x - pos.x);

        // Float on the visible surface: z = wave height, deck tips to the normal.
        sampleWaterWave(pos.x, pos.y, t, v.intensity, wave);
        pos.z = wave.height;

        qYaw.setFromAxisAngle(zAxis, yaw);
        qTilt.setFromUnitVectors(upAxis, wave.normal);
        qOut.copy(qTilt).multiply(qYaw); // yaw first, then tip to the wave

        scaleVec.set(v.sizeScale, v.sizeScale, v.sizeScale);
        v.mesh.matrix.compose(pos, qOut, scaleVec);
      }

      const mArr = extractProjectionMatrix(matrix);
      if (!mArr) {
        if (!projectionWarned) {
          console.warn("[Vessels] projection matrix unavailable");
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
        console.log("[Vessels] first frame rendered");
        firstFrameLogged = true;
      }
      map.triggerRepaint();
    },

    onRemove() {
      disposed = true;
      if (onResize) map?.off("resize", onResize);
      for (const v of vessels) {
        v.mesh.traverse((o) => {
          const mesh = o as THREE.Mesh;
          mesh.geometry?.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        });
      }
      vessels.length = 0;
      renderer = null;
      releaseSharedRenderer();
      void disposed;
    },
  };
}
