// Procedural Dubai-Metro-style station, built in Three.js — no GLB fetch.
//
// Authored natively in the map's LOCAL frame (see lib/mapbox/mercatorLocal.ts):
// real METRES, +X = east (station length), +Y = south (station width),
// +Z = up (height), base at z = 0. Because the model is already Z-up and at
// true scale, the layer places it with scale ≈ 1 and no rotation correction.
//
// Silhouette over detail: at city zoom (11–16) a station is a few pixels tall,
// so what reads is the arched shell roof on columns plus the line-coloured
// accent band. Interchange stations get a twin vault and a size bump.
import * as THREE from "three";

/** Name of the per-station line-coloured accent group (tinted after cloning). */
export const LINE_ACCENT_NAME = "lineAccent";
/** Names of the two roof variants — exactly one is visible per station. */
export const VAULT_STANDARD_NAME = "vaultStandard";
export const VAULT_INTERCHANGE_NAME = "vaultInterchange";

// Real-world-ish dimensions (metres) for a standard elevated station.
const LENGTH = 95; // along +X
const WIDTH = 14; // along +Y
const COLUMN_H = 7.2; // ground → underside of the deck
const DECK_T = 0.9;
const DECK_TOP = COLUMN_H + 0.45 + DECK_T; // columns overlap the deck slightly
const ROOF_RISE = 8.5; // deck → apex

/** Tapered octagonal pylons carrying the deck. */
function buildColumns(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.7, 1.0, COLUMN_H, 8);
  // Cylinders are Y-up; bake the swing to Z-up once into the geometry so every
  // instance shares it.
  geo.rotateX(Math.PI / 2);
  const pitch = 13;
  const count = 6;
  const x0 = -((count - 1) * pitch) / 2;
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x0 + i * pitch, 0, COLUMN_H / 2);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

/** The platform slab. */
function buildDeck(material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, WIDTH, DECK_T), material);
  mesh.position.set(0, 0, DECK_TOP - DECK_T / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Glass edge screens along both long sides of the deck. */
function buildGlassBalustrade(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(LENGTH, 0.25, 1.1);
  for (const y of [-WIDTH / 2 + 0.4, WIDTH / 2 - 0.4]) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, y, DECK_TOP + 0.55);
    group.add(mesh);
  }
  return group;
}

/**
 * One arched shell vault: a 2D arch profile (drawn across the station's width,
 * rising in height) extruded along the station's length. The profile is drawn
 * in shape-XY then baked to the local frame, so shape-Y becomes world Z (up)
 * and the extrude axis becomes world X (length).
 */
function buildVault(span: number, rise: number, length: number, material: THREE.Material): THREE.Mesh {
  const half = span / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.quadraticCurveTo(-half * 0.55, rise * 1.16, 0, rise);
  shape.quadraticCurveTo(half * 0.55, rise * 1.16, half, 0);
  // Shell thickness: return along a slightly smaller arch so the roof is a
  // shell, not a solid lump (cheap, and reads right at any pitch).
  const t = 0.55;
  shape.lineTo(half - t * 0.7, 0);
  shape.quadraticCurveTo((half - t) * 0.55, (rise - t) * 1.16, 0, rise - t);
  shape.quadraticCurveTo(-((half - t) * 0.55), (rise - t) * 1.16, -(half - t * 0.7), 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 10,
  });
  // Extrude runs along +Z (shape space). Swing so shape-Y → world Z (up) and
  // the extrude axis → world X (length), then centre it on the station.
  geo.rotateX(Math.PI / 2);
  geo.rotateZ(Math.PI / 2);
  geo.translate(-length / 2, 0, 0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

/** Line-coloured fascia strips running along both roof springlines. */
function buildAccentBand(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = LINE_ACCENT_NAME;
  const geo = new THREE.BoxGeometry(LENGTH, 0.4, 0.5);
  for (const y of [-WIDTH / 2 + 0.3, WIDTH / 2 - 0.3]) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, y, DECK_TOP + 0.35);
    group.add(mesh);
  }
  return group;
}

/**
 * Build the shared station template. One template is cloned per station; the
 * layer then picks the roof variant and tints [[LINE_ACCENT_NAME]] to the
 * station's line colour. Materials/geometries are created once here and shared
 * by every clone (Three's dispose() is idempotent, so the layer's
 * traverse-and-dispose teardown stays correct).
 */
export function buildStationTemplate(): THREE.Group {
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.85, metalness: 0.05 });
  const columnMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.75, metalness: 0.1 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd0e0,
    roughness: 0.15,
    metalness: 0.3,
    transparent: true,
    opacity: 0.55,
  });
  // DoubleSide: the extrude + axis bake can flip winding on the shell; this is
  // the cheap safety net against black/inside-out roof faces at some bearings.
  const roofShellMat = new THREE.MeshStandardMaterial({
    color: 0xf2e9c9,
    roughness: 0.4,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });
  // Template default — every clone swaps in its own tinted copy.
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.5,
  });

  const root = new THREE.Group();
  root.add(buildColumns(columnMat));
  root.add(buildDeck(concreteMat));
  root.add(buildGlassBalustrade(glassMat));

  // Standard: one wide vault over the whole platform.
  const vaultStandard = buildVault(WIDTH, ROOF_RISE, LENGTH, roofShellMat);
  vaultStandard.name = VAULT_STANDARD_NAME;
  vaultStandard.position.z = DECK_TOP;
  root.add(vaultStandard);

  // Interchange: twin narrower vaults — grander, and instantly distinguishable.
  const vaultInterchange = new THREE.Group();
  vaultInterchange.name = VAULT_INTERCHANGE_NAME;
  for (const y of [-4, 4]) {
    const v = buildVault(6, ROOF_RISE, LENGTH, roofShellMat);
    v.position.set(0, y, DECK_TOP);
    vaultInterchange.add(v);
  }
  vaultInterchange.visible = false;
  root.add(vaultInterchange);

  root.add(buildAccentBand(accentMat));
  return root;
}
