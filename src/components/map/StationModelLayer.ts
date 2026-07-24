import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import {
  buildStationTemplate,
  LINE_ACCENT_NAME,
  VAULT_STANDARD_NAME,
  VAULT_INTERCHANGE_NAME,
} from "./stationModel";
import { acquireSharedRenderer, releaseSharedRenderer, syncSharedRendererSize, extractProjectionMatrix } from "@/lib/mapbox/sharedThreeRenderer";
import { makeMercatorRef, lngLatToLocal, composeLocalToMercator } from "@/lib/mapbox/mercatorLocal";
import type { MetroLine, MetroStation } from "@/lib/metro";

export type StationModelHandle = {
  layer: mapboxgl.CustomLayerInterface;
  setReveal: (metro: number, train: number) => void;
};

interface StationClone {
  mesh: THREE.Group;
  station: { id: string; coord: [number, number]; color: string; interchange: boolean; network: "metro" | "train"; progress: number };
  target: number;
  current: number;
  baseScale: number;
}

export function createStationModelLayer(
  controller: { shouldRender: () => boolean },
  lines: MetroLine[],
  stationProgress: Record<string, number>,
  metroLineIds: Set<string>
): StationModelHandle {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let ref: ReturnType<typeof makeMercatorRef> | null = null;
  let clones: StationClone[] = [];
  let gltfTemplate: THREE.Group | null = null;
  let clock: THREE.Clock | null = null;
  let lastGoodMatrix: number[] = new Array(16).fill(0);
  lastGoodMatrix[15] = 1;
  let disposed = false;

  const stations = lines.flatMap((line) =>
    line.stations.map((s) => ({
      id: s.id,
      coord: s.coord as [number, number],
      color: line.color,
      interchange: !!s.interchange,
      network: metroLineIds.has(line.id) ? ("metro" as const) : ("train" as const),
      progress: stationProgress[s.id] ?? 0,
    }))
  );

  const scheduleRepaint = (map: mapboxgl.Map) => {
    if (!disposed) map.triggerRepaint();
  };

  function buildClones(template: THREE.Group | THREE.Mesh) {
    clones = [];
    for (const station of stations) {
      const clone = template.clone(true) as THREE.Group;
      lngLatToLocal(station.coord[0], station.coord[1], ref!, 0, clone.position);
      // The template is authored Z-up at true metres, so scale ~1 IS real size
      // (95 m platform); interchange stations get a genuine size bump.
      const scale = station.interchange ? 1.3 : 1.0;
      clone.scale.setScalar(scale);

      // Roof variant: single wide vault, or the grander twin vault for interchanges.
      const vStd = clone.getObjectByName(VAULT_STANDARD_NAME);
      const vInt = clone.getObjectByName(VAULT_INTERCHANGE_NAME);
      if (vStd) vStd.visible = !station.interchange;
      if (vInt) vInt.visible = station.interchange;

      // Tint the accent band to this station's line colour. clone(true) shares
      // materials, so the accent meshes need their OWN material copy or the
      // colour would bleed across every station.
      const accent = clone.getObjectByName(LINE_ACCENT_NAME);
      accent?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mat = (child.material as THREE.MeshStandardMaterial).clone();
        mat.color.set(station.color);
        mat.emissive.set(station.color);
        child.material = mat;
      });

      clone.updateMatrixWorld(true);
      // Rest the model on the ground plane: lift so its lowest point sits at the
      // placement altitude instead of floating or sinking (fixes mis-placement
      // from the GLB's pivot not being at its base).
      const box = new THREE.Box3().setFromObject(clone);
      if (isFinite(box.min.z)) clone.position.z -= box.min.z;
      clone.visible = false;
      if (clone.type === "Group") {
        clone.traverse((child) => {
          if ((child as any).isMesh) (child as THREE.Mesh).frustumCulled = true;
        });
      } else {
        (clone as any).frustumCulled = true;
      }
      scene!.add(clone);
      clones.push({
        mesh: clone,
        station,
        target: 0,
        current: 0,
        baseScale: scale,
      });
    }
  }

  const layer: mapboxgl.CustomLayerInterface = {
    id: "metro-stations-3d-model",
    type: "custom",
    renderingMode: "3d",

    onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
      scene = new THREE.Scene();
      camera = new THREE.Camera();
      clock = new THREE.Clock();
      ref = makeMercatorRef();
      renderer = acquireSharedRenderer(map.getCanvas(), gl);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
      dirLight.position.set(-0.5, -0.35, 0.79).multiplyScalar(2);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.far = 5;
      dirLight.shadow.camera.left = -2;
      dirLight.shadow.camera.right = 2;
      dirLight.shadow.camera.top = 2;
      dirLight.shadow.camera.bottom = -2;
      scene.add(dirLight);

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Procedural station — built synchronously, so there's no GLB fetch and no
      // race where render() fires before an async model finished loading.
      gltfTemplate = buildStationTemplate();
      buildClones(gltfTemplate);

      map.on("resize", () => {
        syncSharedRendererSize(map.getCanvas());
      });
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || !scene || !camera || !controller.shouldRender() || !clock || !ref) return;

      const dt = Math.min(1 / 16, clock.getDelta());
      let anyTweening = false;

      for (const clone of clones) {
        if (clone.target !== clone.current) {
          anyTweening = true;
          clone.current += (clone.target - clone.current) * Math.min(1, dt * 5);
          if (Math.abs(clone.target - clone.current) < 0.01) clone.current = clone.target;
        }
        clone.mesh.visible = clone.current > 0.001;
        clone.mesh.scale.setScalar(clone.baseScale * clone.current);
      }

      const mArr = extractProjectionMatrix(matrix) ?? lastGoodMatrix;
      const proj = new THREE.Matrix4().fromArray(mArr);
      const localToMercator = new THREE.Matrix4();
      composeLocalToMercator(localToMercator, ref);
      camera.projectionMatrix.copy(proj).multiply(localToMercator);

      renderer.resetState();
      renderer.render(scene, camera);

      if (anyTweening) renderer.getContext().canvas.dispatchEvent(new Event("repaint"));
    },

    onRemove() {
      disposed = true;
      clones.forEach((c) => {
        c.mesh.traverse((child) => {
          if ((child as any).geometry) (child as THREE.Mesh).geometry.dispose();
          if ((child as any).material) {
            if (Array.isArray((child as any).material)) {
              (child as any).material.forEach((m: THREE.Material) => m.dispose());
            } else {
              (child as any).material.dispose();
            }
          }
        });
      });
      if (gltfTemplate) {
        gltfTemplate.traverse((child) => {
          if ((child as any).geometry) (child as THREE.Mesh).geometry.dispose();
          if ((child as any).material) {
            if (Array.isArray((child as any).material)) {
              (child as any).material.forEach((m: THREE.Material) => m.dispose());
            } else {
              (child as any).material.dispose();
            }
          }
        });
      }
      releaseSharedRenderer();
      clones = [];
      gltfTemplate = null;
    },
  };

  return {
    layer,
    setReveal(metro: number, train: number) {
      let changed = false;
      for (const clone of clones) {
        const target = clone.station.progress <= (clone.station.network === "metro" ? metro : train) ? 1 : 0;
        if (target !== clone.target) {
          clone.target = target;
          changed = true;
        }
      }
      if (changed && renderer) {
        renderer.getContext().canvas.dispatchEvent(new Event("repaint"));
      }
    },
  };
}
