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

function mat(color: number, opts: { rough?: number; metal?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.6,
    metalness: opts.metal ?? 0.1,
    side: THREE.DoubleSide,
  });
}

/** Add a box of size (l along X, w along Y, h along Z) centred at (cx,cy,cz). */
function box(
  group: THREE.Group,
  l: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cz: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, w, h), material);
  mesh.position.set(cx, cy, cz);
  group.add(mesh);
}

/** Tapered hull: a box whose bow (front, +X) is pinched to a point. */
function hull(
  length: number,
  beam: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(length, beam, depth, 4, 1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const halfL = length / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    // Pinch the beam toward the bow (+X) so it reads as a prow, not a brick.
    const t = Math.max(0, (x + halfL) / length); // 0 stern .. 1 bow
    const taper = 1 - 0.85 * Math.pow(t, 2.2);
    pos.setY(i, pos.getY(i) * taper);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.z = depth / 2; // keel at z = 0
  return mesh;
}

/** Small motor boat, ~18 m. */
export function buildBoat(): THREE.Group {
  const g = new THREE.Group();
  g.add(hull(18, 5, 2.4, mat(0xf4f4f6)));
  box(g, 6, 4, 2.2, -1.5, 0, 3.4, mat(0xdfe6ee)); // cabin
  box(g, 2.4, 2.4, 1.2, -5, 0, 3.2, mat(0x33465c)); // aft console
  return g;
}

/** Sleek luxury yacht, ~50 m, multi-deck + tower. */
export function buildYacht(): THREE.Group {
  const g = new THREE.Group();
  g.add(hull(50, 9, 4, mat(0xffffff, { rough: 0.35 })));
  box(g, 34, 8, 3, -2, 0, 5.4, mat(0xf2f4f8, { rough: 0.3 })); // main deck
  box(g, 20, 6.5, 2.6, -4, 0, 7.8, mat(0xe9edf3, { rough: 0.3 })); // upper deck
  box(g, 7, 4.5, 2.2, -1, 0, 10.0, mat(0x1c2a3a)); // bridge / glass
  box(g, 1.2, 1.2, 4.5, 3, 0, 11.5, mat(0xc9d2dc, { metal: 0.4 })); // mast/tower
  return g;
}

/** Long cargo ship, ~140 m, bridge aft + container stacks. */
export function buildShip(): THREE.Group {
  const g = new THREE.Group();
  g.add(hull(140, 22, 10, mat(0x8a3b34, { rough: 0.7 }))); // red-oxide hull
  box(g, 130, 20, 2, 0, 0, 10.5, mat(0x394452)); // main deck plate
  // Container stacks (fore of the bridge), alternating colours.
  const colors = [0x2f6f9f, 0xc7902f, 0x3f8f5f, 0xb0483f];
  for (let i = 0; i < 5; i++) {
    const cx = 40 - i * 22;
    box(g, 18, 18, 6, cx, 0, 14, mat(colors[i % colors.length]));
  }
  // Bridge / accommodation block, aft (-X).
  box(g, 16, 20, 14, -52, 0, 18, mat(0xeef1f4));
  box(g, 10, 12, 6, -52, 0, 27, mat(0x2a3340)); // wheelhouse
  box(g, 3, 3, 16, -60, 0, 26, mat(0x20262f)); // funnel
  return g;
}
