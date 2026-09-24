import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((value) => {
        this.result = value;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((value) => {
        this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.FileReader ??= NodeFileReader;

const outputPath = path.resolve("public/models/fluencia-test-tower.glb");
const scene = new THREE.Scene();
scene.name = "Fluencia Test Tower";
scene.userData = {
  assetRole: "project-test-model",
  designStatus: "concept-not-official-architecture",
  units: "metres",
  coordinateOrigin: "ground-centre",
  futureInteractionNodes: ["Tower_Exterior", "Floor_17", "Unit_911"],
};

const materials = {
  stone: new THREE.MeshStandardMaterial({ color: 0xe4ddcf, roughness: 0.58 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x9d9486, roughness: 0.66 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x183c55,
    metalness: 0.28,
    roughness: 0.18,
  }),
  glassLight: new THREE.MeshStandardMaterial({
    color: 0x39758e,
    metalness: 0.2,
    roughness: 0.22,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xc7a34d,
    metalness: 0.58,
    roughness: 0.25,
  }),
  charcoal: new THREE.MeshStandardMaterial({ color: 0x20282f, roughness: 0.62 }),
  landscape: new THREE.MeshStandardMaterial({ color: 0x42684f, roughness: 0.92 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x2b8ca3,
    metalness: 0.05,
    roughness: 0.19,
  }),
  unit: new THREE.MeshStandardMaterial({
    color: 0xf1c65b,
    emissive: 0x4b3107,
    emissiveIntensity: 0.24,
    transparent: true,
    opacity: 0.82,
    roughness: 0.33,
  }),
};

const geometry = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  column: new THREE.CylinderGeometry(0.42, 0.48, 1, 12),
  planter: new THREE.CylinderGeometry(1.15, 1.35, 0.65, 16),
  tree: new THREE.SphereGeometry(1, 12, 8),
};

function box(parent, name, size, position, material, rotationY = 0) {
  const mesh = new THREE.Mesh(geometry.unitBox, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...size);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, name, radiusScale, height, position, material) {
  const mesh = new THREE.Mesh(geometry.column, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(radiusScale, height, radiusScale);
  parent.add(mesh);
  return mesh;
}

const site = new THREE.Group();
site.name = "Project_Site";
scene.add(site);

box(site, "Site_Podium", [55, 1.1, 44], [0, 0.55, 0], materials.stoneDark);
box(site, "Arrival_Court", [24, 0.14, 12], [0, 1.16, 19], materials.charcoal);
box(site, "Pool", [18, 0.18, 7], [-16, 1.18, -13], materials.water);
box(site, "Pool_Deck", [23, 0.12, 11], [-16, 1.14, -13], materials.stone);
box(site, "Dropoff_Canopy", [19, 0.75, 7], [0, 5.5, 18.5], materials.gold);

for (const [x, z] of [
  [-23, 17],
  [23, 17],
  [-24, -17],
  [24, -17],
  [-5, 20],
  [5, 20],
]) {
  cylinder(site, "Landscape_Planter", 1, 0.65, [x, 1.45, z], materials.stone);
  const crown = new THREE.Mesh(geometry.tree, materials.landscape);
  crown.name = "Landscape_Tree";
  crown.position.set(x, 4.2, z);
  crown.scale.set(1.7, 2.2, 1.7);
  site.add(crown);
}

const tower = new THREE.Group();
tower.name = "Tower_Exterior";
tower.userData = { interactionRole: "project-tower" };
scene.add(tower);

const podiumHeight = 12;
const floorHeight = 3.75;
const floorCount = 28;
const towerWidth = 35;
const towerDepth = 25;
const towerBaseY = 1.1 + podiumHeight;

box(tower, "Podium_Stone", [44, podiumHeight, 34], [0, 1.1 + podiumHeight / 2, 0], materials.stone);
box(tower, "Podium_Glass_North", [24, 7.5, 0.35], [0, 5.5, 17.15], materials.glassLight);
box(tower, "Podium_Glass_East", [0.35, 7.5, 18], [22.15, 5.5, 0], materials.glassLight);

const facades = {
  north: new THREE.Group(),
  south: new THREE.Group(),
  east: new THREE.Group(),
  west: new THREE.Group(),
};
facades.north.name = "Facade_North";
facades.south.name = "Facade_South";
facades.east.name = "Facade_East";
facades.west.name = "Facade_West";
Object.values(facades).forEach((facade) => tower.add(facade));

const floorSlabs = new THREE.Group();
floorSlabs.name = "Floor_Slabs";
tower.add(floorSlabs);

for (let floor = 1; floor <= floorCount; floor += 1) {
  const floorGroup = new THREE.Group();
  floorGroup.name = `Floor_${String(floor).padStart(2, "0")}`;
  floorGroup.userData = { floorNumber: floor, interactionRole: "floor" };
  const y0 = towerBaseY + (floor - 1) * floorHeight;
  const midY = y0 + floorHeight / 2;

  box(floorGroup, `Floor_${floor}_Core`, [11.5, floorHeight - 0.28, 10], [0, midY, 0], materials.stone);
  box(floorGroup, `Floor_${floor}_Slab`, [towerWidth + 0.8, 0.22, towerDepth + 0.8], [0, y0, 0], materials.gold);

  const northInset = floor % 4 === 0 ? 1.5 : 0;
  box(facades.north, `North_Glass_${floor}`, [towerWidth - 6 - northInset, floorHeight - 0.42, 0.28], [northInset / 2, midY, towerDepth / 2 + 0.12], materials.glass);
  box(facades.south, `South_Glass_${floor}`, [towerWidth - 6, floorHeight - 0.42, 0.28], [0, midY, -towerDepth / 2 - 0.12], floor % 3 === 0 ? materials.glassLight : materials.glass);
  box(facades.east, `East_Glass_${floor}`, [0.28, floorHeight - 0.42, towerDepth - 5], [towerWidth / 2 + 0.12, midY, 0], materials.glassLight);
  box(facades.west, `West_Glass_${floor}`, [0.28, floorHeight - 0.42, towerDepth - 5], [-towerWidth / 2 - 0.12, midY, 0], materials.glass);

  for (const x of [-towerWidth / 2 + 1.6, towerWidth / 2 - 1.6]) {
    box(floorGroup, `Stone_Fin_${floor}`, [2.5, floorHeight - 0.18, towerDepth + 0.55], [x, midY, 0], materials.stone);
  }

  if (floor >= 5 && floor % 2 === 1) {
    const balconySide = floor % 4 === 1 ? 1 : -1;
    box(
      floorGroup,
      `Balcony_${floor}`,
      [10.5, 0.28, 3],
      [balconySide * 8, y0 + 0.25, -towerDepth / 2 - 1.4],
      materials.stone,
    );
    box(
      floorGroup,
      `Balcony_Rail_${floor}`,
      [10.5, 1.05, 0.14],
      [balconySide * 8, y0 + 0.78, -towerDepth / 2 - 2.84],
      materials.gold,
    );
  }

  if (floor === 17) {
    floorGroup.name = "Floor_17";
    floorGroup.userData = {
      floorNumber: 17,
      interactionRole: "tour-floor",
      tourLabel: "Floor 17",
    };
    const unit = new THREE.Group();
    unit.name = "Unit_911";
    unit.userData = {
      interactionRole: "tour-unit",
      tourLabel: "Unit 911",
      floorNumber: 17,
    };
    box(unit, "Unit_911_Outline", [11, floorHeight - 0.5, 8], [11.4, midY, -7.5], materials.unit);
    floorGroup.add(unit);
  }

  floorSlabs.add(floorGroup);
}

const crownY = towerBaseY + floorCount * floorHeight;
box(tower, "Roof_Terrace", [towerWidth + 1.4, 0.65, towerDepth + 1.4], [0, crownY + 0.32, 0], materials.gold);
box(tower, "Roof_Crown", [19, 8.5, 13], [0, crownY + 4.8, 0], materials.glassLight);
box(tower, "Roof_Halo", [23, 0.55, 17], [0, crownY + 9.2, 0], materials.gold);
box(tower, "Fluencia_Sign", [12, 1.2, 0.22], [0, crownY + 6, 6.62], materials.gold);

scene.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    object.castShadow = false;
    object.receiveShadow = false;
  }
});

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  trs: false,
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(binary));
console.log(`Generated ${outputPath} (${(binary.byteLength / 1024).toFixed(1)} KB)`);
