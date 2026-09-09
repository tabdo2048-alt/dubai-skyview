import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  acquireSharedRenderer,
  extractProjectionMatrix,
  releaseSharedRenderer,
  syncSharedRendererSize,
} from "@/lib/mapbox/sharedThreeRenderer";
import { composeLocalToMercator, lngLatToLocal, makeMercatorRef } from "@/lib/mapbox/mercatorLocal";

const LAYER_ID = "selected-project-digital-twin";
const GENERIC_NODE_NAMES = new Set(["scene", "root", "rootnode", "sketchup", "default"]);

export type ProjectModelConfig = {
  projectId: string;
  projectName: string;
  url: string;
  lat: number;
  lng: number;
  altitude: number;
  scale: number;
  rotation: number;
};

export type ProjectModelHandle = {
  layer: mapboxgl.CustomLayerInterface;
};

type HighlightedMaterial = {
  material: THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number };
  emissive?: THREE.Color;
  emissiveIntensity?: number;
};

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    });
  });
}

function readableNodeName(object: THREE.Object3D, modelRoot: THREE.Object3D, fallback: string) {
  let node: THREE.Object3D | null = object;
  while (node && node !== modelRoot) {
    const normalized = node.name.trim().toLowerCase();
    if (normalized && !GENERIC_NODE_NAMES.has(normalized) && !/^mesh[_-]?\d*$/i.test(normalized)) {
      // glTF exporters suffix duplicate mesh names (for example, Project_12).
      // Strip that technical suffix so the map popup keeps the sales-friendly label.
      return node.name.replace(/_\d+$/, "").replaceAll("_", " ");
    }
    node = node.parent;
  }
  return fallback;
}

export function createProjectModelLayer(
  controller: { shouldRender: () => boolean },
  config: ProjectModelConfig,
): ProjectModelHandle {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let modelRoot: THREE.Group | null = null;
  let mapInstance: mapboxgl.Map | null = null;
  let popup: mapboxgl.Popup | null = null;
  let highlighted: HighlightedMaterial[] = [];
  let disposed = false;
  const ref = makeMercatorRef();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const lastGoodMatrix: number[] = new Array(16).fill(0);
  lastGoodMatrix[15] = 1;

  const restoreHighlight = () => {
    highlighted.forEach(({ material, emissive, emissiveIntensity }) => {
      if (emissive && material.emissive) material.emissive.copy(emissive);
      if (emissiveIntensity != null && "emissiveIntensity" in material) {
        material.emissiveIntensity = emissiveIntensity;
      }
    });
    highlighted = [];
  };

  const highlightMesh = (mesh: THREE.Mesh) => {
    restoreHighlight();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((source, index) => {
      const material = source.clone() as HighlightedMaterial["material"];
      if (Array.isArray(mesh.material)) mesh.material[index] = material;
      else mesh.material = material;
      if (material.emissive) {
        highlighted.push({
          material,
          emissive: material.emissive.clone(),
          emissiveIntensity: material.emissiveIntensity,
        });
        material.emissive.set("#c9a84c");
        material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 0.65);
      }
    });
  };

  const hitTest = (event: MouseEvent) => {
    if (!camera || !modelRoot || !mapInstance) return null;
    const canvas = mapInstance.getCanvas();
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.matrixWorld.identity();
    camera.matrixWorldInverse.identity();
    raycaster.setFromCamera(pointer, camera);
    return (
      raycaster.intersectObject(modelRoot, true).find((hit) => hit.object instanceof THREE.Mesh) ??
      null
    );
  };

  const onPointerMove = (event: MouseEvent) => {
    if (!mapInstance || !controller.shouldRender()) return;
    mapInstance.getCanvas().style.cursor = hitTest(event) ? "pointer" : "";
  };

  const onClick = (event: MouseEvent) => {
    if (!mapInstance || !modelRoot || !controller.shouldRender()) return;
    const hit = hitTest(event);
    if (!hit || !(hit.object instanceof THREE.Mesh)) return;
    highlightMesh(hit.object);
    popup?.remove();
    const label = readableNodeName(hit.object, modelRoot, config.projectName);
    popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: 18,
      className: "project-model-popup",
    })
      .setLngLat([config.lng, config.lat])
      .setText(label)
      .addTo(mapInstance);
    mapInstance.triggerRepaint();
  };

  const onResize = () => {
    if (mapInstance) syncSharedRendererSize(mapInstance.getCanvas());
  };

  const layer: mapboxgl.CustomLayerInterface = {
    id: LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
      mapInstance = map;
      renderer = acquireSharedRenderer(map.getCanvas(), gl);
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      scene.add(new THREE.HemisphereLight(0xfff7e6, 0x49626b, 2.15));
      const sunlight = new THREE.DirectionalLight(0xffefd0, 2.4);
      sunlight.position.set(-0.6, -0.35, 1).multiplyScalar(500);
      scene.add(sunlight);
      const fill = new THREE.DirectionalLight(0xddeeff, 1.1);
      fill.position.set(0.5, 0.7, 0.45).multiplyScalar(300);
      scene.add(fill);

      const loader = new GLTFLoader();
      loader.load(
        config.url,
        (gltf) => {
          if (disposed || !scene || !mapInstance) {
            disposeObject3D(gltf.scene);
            return;
          }

          // GLB is Y-up. This nested transform converts it to the Z-up local
          // metre frame shared by the rest of the Dubai map, then applies the
          // real-world heading without altering the model's embedded materials.
          const placement = new THREE.Group();
          const axisConversion = new THREE.Group();
          axisConversion.rotation.x = Math.PI / 2;
          placement.rotation.z = THREE.MathUtils.degToRad(-config.rotation);
          placement.scale.setScalar(config.scale);
          lngLatToLocal(config.lng, config.lat, ref, config.altitude, placement.position);

          gltf.scene.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          const center = bounds.getCenter(new THREE.Vector3());
          gltf.scene.position.set(-center.x, -bounds.min.y, -center.z);
          gltf.scene.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = true;
          });

          axisConversion.add(gltf.scene);
          placement.add(axisConversion);
          modelRoot = placement;
          scene.add(placement);
          mapInstance.triggerRepaint();
        },
        undefined,
        (error) => console.error(`Failed to load 3D model for ${config.projectName}`, error),
      );

      map.getCanvas().addEventListener("mousemove", onPointerMove, { passive: true });
      map.getCanvas().addEventListener("click", onClick);
      map.on("resize", onResize);
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer || !scene || !camera || !controller.shouldRender()) return;
      const matrixArray = extractProjectionMatrix(matrix) ?? lastGoodMatrix;
      const projection = new THREE.Matrix4().fromArray(matrixArray);
      const localToMercator = new THREE.Matrix4();
      composeLocalToMercator(localToMercator, ref);
      camera.projectionMatrix.copy(projection).multiply(localToMercator);
      renderer.resetState();
      renderer.render(scene, camera);
    },

    onRemove() {
      disposed = true;
      restoreHighlight();
      popup?.remove();
      if (mapInstance) {
        mapInstance.getCanvas().removeEventListener("mousemove", onPointerMove);
        mapInstance.getCanvas().removeEventListener("click", onClick);
        mapInstance.getCanvas().style.cursor = "";
        mapInstance.off("resize", onResize);
      }
      if (modelRoot) disposeObject3D(modelRoot);
      releaseSharedRenderer();
      modelRoot = null;
      scene = null;
      camera = null;
      renderer = null;
      mapInstance = null;
    },
  };

  return { layer };
}
