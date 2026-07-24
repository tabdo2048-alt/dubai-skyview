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

// Real-world-ish dimensions (metres) for a standard elevated station. Kept on
// the short side of the real range: a full 95 m barrel reads as a blank wall on
// screen, while ~72 m lets the arch's curve actually register.
const LENGTH = 72; // along +X
const WIDTH = 14; // along +Y
const COLUMN_H = 7.2; // ground → underside of the deck
const DECK_T = 0.9;
const DECK_TOP = COLUMN_H + 0.45 + DECK_T; // columns overlap the deck slightly
const ROOF_RISE = 10.5; // deck → apex; tall enough to read as a vault, not a lid
const ROOF_SPAN = 12.4; // inboard of the deck edge, so the fascia stays visible

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
    group.add(mesh);
  }
  return group;
}

/** The platform slab. */
function buildDeck(material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, WIDTH, DECK_T), material);
  mesh.position.set(0, 0, DECK_TOP - DECK_T / 2);
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
 * The signature shell roof: a half-ellipsoid "pod" — Dubai Metro's golden
 * lens. Deliberately NOT an extruded barrel vault: a barrel is a plain
 * rectangle when seen from the side (the arch only shows at the two ends),
 * which on the map just reads as a box. A dome curves on BOTH axes, so the
 * silhouette stays curved from every bearing.
 */
function buildPod(length: number, span: number, rise: number, material: THREE.Material): THREE.Mesh {
  // Upper hemisphere only (thetaLength = π/2), open underneath.
  const geo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  // Sphere is Y-up; swing +Y → +Z, then stretch the unit dome to the real
  // length / width / height of the shell.
  geo.rotateX(Math.PI / 2);
  geo.scale(length / 2, span / 2, rise);
  return new THREE.Mesh(geo, material);
}

/**
 * Line-coloured fascia strips. These sit on the OUTER face of the deck edge,
 * below the roof springline — outboard of both the deck and the vault, so the
 * band is actually visible from the side instead of buried inside the shell.
 */
function buildAccentBand(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = LINE_ACCENT_NAME;
  const geo = new THREE.BoxGeometry(LENGTH, 0.3, 0.75);
  for (const y of [-WIDTH / 2 - 0.15, WIDTH / 2 + 0.15]) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, y, DECK_TOP - DECK_T / 2);
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
  // Bright, low-metalness palette with a touch of emissive: the map's own dark
  // 3D style composites over the custom layer, so materials that look correct in
  // isolation come out muddy here. These are tuned against the live basemap.
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xf7f4ec,
    emissive: 0x2a2822,
    roughness: 0.85,
    metalness: 0.02,
  });
  const columnMat = new THREE.MeshStandardMaterial({
    color: 0xded8ca,
    emissive: 0x232019,
    roughness: 0.75,
    metalness: 0.05,
  });
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
    color: 0xfff3d2,
    emissive: 0x554527,
    roughness: 0.35,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  // Template default — every clone swaps in its own tinted copy. Strongly
  // emissive so the line colour still reads once the basemap dims the layer.
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.4,
    roughness: 0.3,
    metalness: 0.1,
  });

  const root = new THREE.Group();
  root.add(buildColumns(columnMat));
  root.add(buildDeck(concreteMat));
  root.add(buildGlassBalustrade(glassMat));

  // Standard: one pod over the whole platform.
  const vaultStandard = buildPod(LENGTH, ROOF_SPAN, ROOF_RISE, roofShellMat);
  vaultStandard.name = VAULT_STANDARD_NAME;
  vaultStandard.position.z = DECK_TOP;
  root.add(vaultStandard);

  // Interchange: twin pods side by side — grander, instantly distinguishable.
  const vaultInterchange = new THREE.Group();
  vaultInterchange.name = VAULT_INTERCHANGE_NAME;
  for (const y of [-3.4, 3.4]) {
    const v = buildPod(LENGTH, 6.4, ROOF_RISE * 0.92, roofShellMat);
    v.position.set(0, y, DECK_TOP);
    vaultInterchange.add(v);
  }
  vaultInterchange.visible = false;
  root.add(vaultInterchange);

  root.add(buildAccentBand(accentMat));
  return root;
}
