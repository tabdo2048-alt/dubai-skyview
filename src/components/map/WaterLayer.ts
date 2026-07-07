// A Mapbox GL custom layer that renders animated three.js water and moving
// procedural boats (yachts, ships, abras) over Dubai's marine areas.
//
// The layer shares Mapbox's camera: on each frame Mapbox hands us its
// view-projection matrix and we render our three.js scene into the same WebGL
// context, positioning everything in Mercator coordinate space.

import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import mapboxgl from "mapbox-gl";
import { WATER_AREAS, BOAT_ROUTES, boatPointAt, type BoatKind } from "@/lib/water";

type MercatorRef = {
  x: number;
  y: number;
  z: number;
  scale: number; // metres -> mercator units at the reference latitude
};

// Convert a lng/lat to a position in the layer's local metre space, relative to
// a chosen reference origin. Mapbox MercatorCoordinate gives us the scale.
function lngLatToLocal(
  lng: number,
  lat: number,
  ref: MercatorRef,
  altitude = 0,
): THREE.Vector3 {
  const m = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  // Mercator units -> metres via metersPerUnit at the reference.
  return new THREE.Vector3((m.x - ref.x) / ref.scale, (m.y - ref.y) / ref.scale, (m.z - ref.z) / ref.scale);
}

// Build a stylized boat mesh from primitives. No external model files.
function makeBoat(kind: BoatKind, color: number): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xf5ead1, metalness: 0.1, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e2a33, metalness: 0.3, roughness: 0.5 });

  if (kind === "abra") {
    // Small wooden boat with a canopy.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 24), hullMat);
    hull.position.z = 6;
    g.add(hull);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 12), deckMat);
    canopy.position.set(0, 0, 22);
    g.add(canopy);
  } else if (kind === "yacht") {
    // Sleek multi-deck yacht.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(120, 30, 26), hullMat);
    hull.position.z = 8;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(15, 40, 4), hullMat);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.x = Math.PI / 2;
    bow.position.set(75, 0, 8);
    g.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 16), deckMat);
    deck.position.set(-10, 0, 26);
    g.add(deck);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(40, 22, 12), deckMat);
    upper.position.set(-20, 0, 40);
    g.add(upper);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(72, 22, 2), darkMat);
    glass.position.set(-10, 0, 30);
    g.add(glass);
  } else {
    // Larger cargo/cruise ship.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(220, 46, 40), hullMat);
    hull.position.z = 14;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(23, 60, 4), hullMat);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.x = Math.PI / 2;
    bow.position.set(140, 0, 14);
    g.add(bow);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(50, 44, 60), deckMat);
    tower.position.set(-60, 0, 60);
    g.add(tower);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 34, 12), darkMat);
    funnel.rotation.x = Math.PI / 2;
    funnel.position.set(-70, 0, 96);
    g.add(funnel);
  }
  // Orient so +X is the bow, and the deck points up (+Z in our local frame).
  g.rotation.x = Math.PI / 2;
  return g;
}

export function createWaterLayer(): mapboxgl.CustomLayerInterface {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let map: mapboxgl.Map;
  const waters: Water[] = [];
  const boats: { group: THREE.Group; routeIdx: number; t: number }[] = [];
  let ref: MercatorRef;
  let clock: THREE.Clock;

  return {
    id: "dubai-water-3d",
    type: "custom",
    renderingMode: "3d",

    onAdd(m: mapboxgl.Map, gl: WebGLRenderingContext) {
      map = m;
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      camera = new THREE.Camera();

      // Reference origin at the Marina — everything positioned relative to it.
      const originLngLat: [number, number] = [55.138, 25.1];
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(originLngLat, 0);
      ref = { x: origin.x, y: origin.y, z: origin.z, scale: origin.meterInMercatorCoordinateUnits() };

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 1.0));
      const sun = new THREE.DirectionalLight(0xfff2d6, 1.3);
      sun.position.set(-1, -1, 2);
      scene.add(sun);

      // Water planes per area
      const waterNormals = new THREE.TextureLoader().load(
        "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg",
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
        },
      );
      for (const area of WATER_AREAS) {
        const geo = new THREE.PlaneGeometry(area.size[0], area.size[1]);
        const water = new Water(geo, {
          textureWidth: 512,
          textureHeight: 512,
          waterNormals,
          sunDirection: new THREE.Vector3(-1, -1, 1).normalize(),
          sunColor: 0xffffff,
          waterColor: 0x0a4d6b,
          distortionScale: 3.2,
          fog: false,
        });
        const pos = lngLatToLocal(area.center[0], area.center[1], ref, 0);
        water.position.copy(pos);
        water.position.z += 0.5; // sit just above ground to avoid z-fighting
        waters.push(water);
        scene.add(water);
      }

      // Boats
      BOAT_ROUTES.forEach((route, i) => {
        const group = makeBoat(route.kind, route.color);
        // Scale factor: our meshes are modelled in metres but the local frame is
        // already in metres, so no extra scale is needed beyond a small tweak.
        group.scale.setScalar(1);
        scene.add(group);
        boats.push({ group, routeIdx: i, t: (i * 0.13) % 1 });
      });

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    render(_gl: WebGLRenderingContext, matrix: unknown) {
      if (!renderer) return;
      const dt = clock.getDelta();

      // Advance boats along their routes.
      for (const b of boats) {
        const route = BOAT_ROUTES[b.routeIdx];
        b.t = (b.t + route.speed * dt) % 1;
        const { coord, heading } = boatPointAt(route.path, b.t);
        const pos = lngLatToLocal(coord[0], coord[1], ref, 0);
        b.group.position.set(pos.x, pos.y, pos.z + 1);
        // heading is a compass-style angle (atan2(dx,dy)); rotate around Z.
        b.group.rotation.z = -heading + Math.PI / 2;
        // gentle bob
        b.group.position.z += Math.sin(clock.elapsedTime * 1.5 + b.routeIdx) * 1.2;
      }

      // Animate water shaders.
      for (const w of waters) {
        (w.material as THREE.ShaderMaterial).uniforms["time"].value += dt;
      }

      // Mapbox may pass the matrix directly (v2) or wrapped (v3 globe/mercator).
      const mArr = Array.isArray(matrix)
        ? (matrix as number[])
        : (matrix as { defaultProjectionData?: { mainMatrix: number[] } } | undefined)?.defaultProjectionData
            ?.mainMatrix;
      if (!mArr) return;

      // Build the model matrix that maps our local metre space to Mercator.
      const l = new THREE.Matrix4()
        .makeTranslation(ref.x, ref.y, ref.z)
        .scale(new THREE.Vector3(ref.scale, -ref.scale, ref.scale));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(mArr).multiply(l);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },

    onRemove() {
      for (const w of waters) {
        w.geometry.dispose();
        (w.material as THREE.Material).dispose();
      }
      renderer?.dispose();
      renderer = null;
    },
  } as unknown as mapboxgl.CustomLayerInterface;
}
