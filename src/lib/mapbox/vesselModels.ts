// Procedural vessel meshes for the Mapbox 3D vessel layer.
//
// Authoring conventions (must match VesselLayer's placement maths):
//   - metre scale (1 unit = 1 metre); the layer scales metres → mercator.
//   - forward = +X (the layer yaws the model about +Z to face its heading).
//   - keel at z = 0 so the hull sits ON the water surface (the layer sets the
//     group's z to the wave height under it).
//   - every material is DoubleSide: the mercator transform mirrors Y and flips
//     triangle winding, so single-sided faces would cull to nothing.
//
// Shapes are deliberately stylised blocks — distinct silhouettes that read at
// city zoom, no textures or GLTF.

import * as THREE from "three";

function mat(
  color: number,
  opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number } = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.6,
    metalness: opts.metal ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: THREE.DoubleSide,
  });
}

// Shared material palette — built once, reused by every vessel copy.
const PALETTE = {
  hullWhite: mat(0xf7f8fa, { rough: 0.35 }),
  hullRed: mat(0x8a3b34, { rough: 0.7 }),
  superWhite: mat(0xeef1f5, { rough: 0.4 }),
  glass: mat(0x101820, { rough: 0.15, emissive: 0x9fd4ff, emissiveIntensity: 0.65 }),
  trimDark: mat(0x2a3340, { rough: 0.5 }),
  metal: mat(0xc9d2dc, { rough: 0.3, metal: 0.6 }),
  deckTeak: mat(0xb08b5a, { rough: 0.8 }),
  containers: [mat(0x2f6f9f), mat(0xc7902f), mat(0x3f8f5f), mat(0xb0483f)],
};

// Geometry cache — every shared shape (box, cylinder, sphere, per-vessel hull)
// is built once and reused across all copies of all vessels.
const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const UNIT_BOX = cachedGeo("box", () => new THREE.BoxGeometry(1, 1, 1));
// Axis along +Z (rotated from the default +Y axis).
const UNIT_CYL = cachedGeo("cyl8", () =>
  new THREE.CylinderGeometry(0.5, 0.5, 1, 8).rotateX(Math.PI / 2),
);
const UNIT_SPHERE = cachedGeo("sph", () => new THREE.SphereGeometry(0.5, 8, 6));

/** Add a box of size (l along X, w along Y, h along Z) centred at (cx,cy,cz). Shares UNIT_BOX. */
function addBox(
  group: THREE.Group,
  l: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cz: number,
  material: THREE.Material,
): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_BOX, material);
  m.scale.set(l, w, h);
  m.position.set(cx, cy, cz);
  group.add(m);
  return m;
}

/** Add a cylinder of diameter `dia`, height `h`, base at (cx,cy,cz), axis +Z. Shares UNIT_CYL. */
function addCylinder(
  group: THREE.Group,
  dia: number,
  h: number,
  cx: number,
  cy: number,
  cz: number,
  material: THREE.Material,
): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_CYL, material);
  m.scale.set(dia, dia, h);
  m.position.set(cx, cy, cz + h / 2);
  group.add(m);
  return m;
}

/** Add a sphere of diameter `dia` centred at (cx,cy,cz). Shares UNIT_SPHERE. */
function addSphere(
  group: THREE.Group,
  dia: number,
  cx: number,
  cy: number,
  cz: number,
  material: THREE.Material,
): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_SPHERE, material);
  m.scale.set(dia, dia, dia);
  m.position.set(cx, cy, cz);
  group.add(m);
  return m;
}

/** Thin emissive window band poking through both hull/cabin walls. */
function addWindowStrip(
  group: THREE.Group,
  l: number,
  w: number,
  cx: number,
  cy: number,
  cz: number,
): THREE.Mesh {
  return addBox(group, l, w + 0.15, 0.9, cx, cy, cz, PALETTE.glass);
}

type HullOpts = {
  length: number;
  beam: number;
  depth: number;
  bowSharpness?: number;
  sternTaper?: number;
  bilgeRound?: number;
  bowRake?: number;
  sheer?: number;
};

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Curved hull via displaced BoxGeometry, cached per vessel type (by `key`). */
function makeHullGeometry(key: string, opts: HullOpts): THREE.BufferGeometry {
  return cachedGeo(key, () => {
    const {
      length,
      beam,
      depth,
      bowSharpness = 2.2,
      sternTaper = 0.9,
      bilgeRound = 0.6,
      bowRake = 0.35 * depth,
      sheer = 0.06 * depth,
    } = opts;

    const geo = new THREE.BoxGeometry(length, beam, depth, 10, 2, 3);
    const pos = geo.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const t = (x + length / 2) / length; // 0 stern -> 1 bow
      const zn = (z + depth / 2) / depth; // 0 keel -> 1 deck

      // Plan taper: full beam midship, pinches toward the bow, transom at stern.
      y *= lerp(sternTaper, 0, Math.pow(t, bowSharpness));

      // Bilge rounding: round the hull cross-section below the waterline.
      if (zn < 0.5) {
        y *= lerp(1, Math.sqrt(Math.max(0, 1 - Math.pow(1 - 2 * zn, 2))), bilgeRound);
      }

      // Bow rake: keel-side verts near the bow sweep upward/forward.
      if (zn < 0.5) {
        z += (bowRake * Math.pow(Math.max(0, t - 0.7), 2)) / 0.09;
      }

      // Sheer: deck-side verts rise toward the bow.
      if (zn >= 0.5) {
        z += sheer * Math.pow(Math.max(0, t - 0.5), 2);
      }

      pos.setY(i, y);
      pos.setZ(i, z);
    }

    geo.computeVertexNormals();
    geo.translate(0, 0, depth / 2); // keel at z = 0
    return geo;
  });
}

/** Add a cached, shared curved hull mesh at the group origin. */
function addHull(
  group: THREE.Group,
  key: string,
  opts: HullOpts,
  material: THREE.Material,
): THREE.Mesh {
  const geo = makeHullGeometry(key, opts);
  const m = new THREE.Mesh(geo, material);
  group.add(m);
  return m;
}

/** Small motor boat, ~18 m. */
export function buildBoat(): THREE.Group {
  const g = new THREE.Group();
  addHull(g, "hull-boat", { length: 18, beam: 6, depth: 2.6 }, PALETTE.hullWhite);
  addBox(g, 16, 5.6, 0.3, -0.5, 0, 2.6, PALETTE.deckTeak); // deck cap
  addBox(g, 5.5, 4, 2.2, -1, 0, 3.4, PALETTE.superWhite); // raked cabin
  addWindowStrip(g, 4.6, 4, -1, 0, 3.9); // cabin windows
  addBox(g, 1.8, 3.6, 1.1, 1.8, 0, 3.5, PALETTE.glass); // angled windshield
  addBox(g, 1.6, 3, 1.2, -4.2, 0, 4.4, PALETTE.trimDark); // radar arch
  addBox(g, 4, 4.2, 0.4, -6.4, 0, 3.6, PALETTE.deckTeak); // aft sun-pad
  addCylinder(g, 0.25, 3, -4.2, 0, 4.9, PALETTE.metal); // mast
  addSphere(g, 1.2, 0.2, 0, 2.9, PALETTE.hullWhite); // bow deck bump
  return g;
}

/** Sleek luxury yacht, ~50 m, multi-deck + tower. */
export function buildYacht(): THREE.Group {
  const g = new THREE.Group();
  addHull(g, "hull-yacht", { length: 50, beam: 11, depth: 4.4, bilgeRound: 0.7 }, PALETTE.hullWhite);

  // Main deck.
  addBox(g, 36, 10, 3, -3, 0, 4.6, PALETTE.superWhite);
  addCylinder(g, 10, 1.6, 13, 0, 4.6, PALETTE.superWhite); // rounded deck-front
  addWindowStrip(g, 30, 9.4, -3, 0, 5.2);

  // Upper deck.
  addBox(g, 24, 8, 2.6, -6, 0, 7.6, PALETTE.superWhite);
  addCylinder(g, 8, 1.4, 4, 0, 7.6, PALETTE.superWhite);
  addWindowStrip(g, 20, 7.4, -6, 0, 8.1);

  // Sun deck.
  addBox(g, 14, 6, 2.2, -10, 0, 10.2, PALETTE.superWhite);
  addCylinder(g, 6, 1.2, -5, 0, 10.2, PALETTE.superWhite);
  addWindowStrip(g, 11, 5.4, -10, 0, 10.6);

  addBox(g, 6, 4.6, 2, -1, 0, 12.4, PALETTE.trimDark); // bridge
  addBox(g, 46, 0.15, 1, -3, 5.05, 5.5, PALETTE.metal); // side railing (port)
  addBox(g, 46, 0.15, 1, -3, -5.05, 5.5, PALETTE.metal); // side railing (stbd)
  addCylinder(g, 0.6, 5, -1, 0, 13.4, PALETTE.metal); // mast tower
  addSphere(g, 1.6, -1, 0, 18.4, PALETTE.superWhite); // radar dome
  return g;
}

/** Long cargo ship, ~140 m, bridge aft + container stacks. */
export function buildShip(): THREE.Group {
  const g = new THREE.Group();
  addHull(
    g,
    "hull-ship",
    { length: 140, beam: 26, depth: 11, bowSharpness: 2.8, sternTaper: 0.95 },
    PALETTE.hullRed,
  );
  addBox(g, 138, 26.4, 0.6, 0, 0, 2, PALETTE.trimDark); // boot-top
  addBox(g, 132, 23, 1.4, -2, 0, 11.2, PALETTE.trimDark); // deck plate
  addBox(g, 14, 20, 3, 58, 0, 12.5, PALETTE.superWhite); // forecastle

  // Container stacks, alternating colours, varied heights.
  const stackHeights = [5, 7, 8, 6, 7, 5];
  for (let i = 0; i < 6; i++) {
    const cx = 42 - i * 20;
    const h = stackHeights[i];
    addBox(g, 18, 20, h, cx, 0, 12 + h / 2, PALETTE.containers[i % 4]);
  }

  // Accommodation block, aft (-X).
  addBox(g, 18, 20, 16, -52, 0, 20, PALETTE.superWhite);
  addWindowStrip(g, 16, 19.4, -52, 0, 23);
  addWindowStrip(g, 16, 19.4, -52, 0, 26.5);
  addBox(g, 12, 22, 0.6, -52, 0, 28.3, PALETTE.trimDark); // wheelhouse wing
  addCylinder(g, 3.2, 14, -60, 0, 22, PALETTE.trimDark); // raked funnel
  addCylinder(g, 3.4, 1, -60, 0, 35, PALETTE.metal); // funnel cap band
  addCylinder(g, 0.5, 8, -52, 0, 30, PALETTE.metal); // radar mast
  addBox(g, 6, 10, 0.4, -52, 0, 37.5, PALETTE.trimDark); // crossbar
  addSphere(g, 3, 68, 0, 3, PALETTE.hullRed); // bulbous bow hint
  return g;
}
