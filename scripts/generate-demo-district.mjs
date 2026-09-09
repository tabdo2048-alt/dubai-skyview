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

const outputPath = path.resolve("public/models/demo-district.glb");
const scene = new THREE.Scene();
scene.name = "Keyora 3D Demo District";

const materials = {
  sand: new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.95 }),
  pavement: new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9 }),
  road: new THREE.MeshStandardMaterial({ color: 0x26313b, roughness: 0.92 }),
  roadLine: new THREE.MeshStandardMaterial({ color: 0xe6c875, roughness: 0.7 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x168eaa,
    metalness: 0.08,
    roughness: 0.23,
  }),
  grass: new THREE.MeshStandardMaterial({ color: 0x568657, roughness: 1 }),
  tree: new THREE.MeshStandardMaterial({ color: 0x2e6948, roughness: 1 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x785739, roughness: 1 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xeee4d2, roughness: 0.55 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf6f2e9, roughness: 0.48 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a84c, metalness: 0.55, roughness: 0.28 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x183b53, metalness: 0.35, roughness: 0.2 }),
  glassLight: new THREE.MeshStandardMaterial({ color: 0x3a748b, metalness: 0.25, roughness: 0.23 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0xbb795b, roughness: 0.7 }),
};

function box(parent, name, size, position, material, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, name, radius, height, position, material, sides = 24) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.04, height, sides),
    material,
  );
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function tower(parent, name, x, z, width, depth, height, options = {}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);
  parent.add(group);

  const bodyMaterial = options.body ?? materials.ivory;
  const glassMaterial = options.glass ?? materials.glass;
  box(group, name, [width + 3, 1.1, depth + 3], [0, 0.55, 0], materials.pavement);
  box(group, name, [width, height, depth], [0, height / 2 + 1.1, 0], bodyMaterial);

  const podiumHeight = Math.min(5, height * 0.16);
  box(group, name, [width + 2.2, podiumHeight, depth + 2.2], [0, podiumHeight / 2 + 1.1, 0], materials.white);

  const floors = Math.max(4, Math.round(height / 4));
  for (let floor = 1; floor < floors; floor += 1) {
    const y = 1.1 + (height * floor) / floors;
    box(group, name, [width + 0.65, 0.22, depth + 0.65], [0, y, 0], materials.gold);
  }

  box(group, name, [width * 0.64, height * 0.92, 0.18], [0, height * 0.5 + 1.1, depth / 2 + 0.1], glassMaterial);
  box(group, name, [0.18, height * 0.92, depth * 0.62], [width / 2 + 0.1, height * 0.5 + 1.1, 0], glassMaterial);
  box(group, name, [width * 0.42, 1.3, depth * 0.42], [0, height + 1.75, 0], materials.gold);
  return group;
}

function roundTower(parent, name, x, z, radius, height) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);
  parent.add(group);
  cylinder(group, name, radius + 1.5, 1.1, [0, 0.55, 0], materials.pavement, 32);
  cylinder(group, name, radius, height, [0, height / 2 + 1.1, 0], materials.glassLight, 32);
  const floors = Math.max(5, Math.round(height / 3.8));
  for (let floor = 1; floor < floors; floor += 1) {
    cylinder(group, name, radius + 0.7, 0.24, [0, 1.1 + (height * floor) / floors, 0], materials.gold, 32);
  }
  cylinder(group, name, radius * 0.72, 1.1, [0, height + 1.65, 0], materials.gold, 24);
}

function tree(parent, x, z, scale = 1) {
  cylinder(parent, "Landscape", 0.28 * scale, 2.4 * scale, [x, 1.2 * scale, z], materials.trunk, 9);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.35 * scale, 10, 8),
    materials.tree,
  );
  crown.name = "Landscape";
  crown.position.set(x, 3 * scale, z);
  parent.add(crown);
}

const district = new THREE.Group();
district.name = "Keyora 3D Demo District";
scene.add(district);

box(district, "Masterplan Ground", [250, 0.8, 210], [0, -0.4, 0], materials.sand);
box(district, "Central Boulevard", [250, 0.35, 17], [0, 0.18, 0], materials.road);
box(district, "North Avenue", [14, 0.36, 210], [-12, 0.2, 0], materials.road);
box(district, "Boulevard Median", [250, 0.12, 1], [0, 0.42, 0], materials.roadLine);
box(district, "Canal Promenade", [21, 0.2, 180], [-84, 0.48, 0], materials.water);
box(district, "Central Park", [39, 0.24, 49], [22, 0.5, -49], materials.grass);
box(district, "Marina Pool", [34, 0.22, 14], [65, 0.52, -51], materials.water);
box(district, "Aurelia Pool", [27, 0.22, 10], [-48, 0.52, -50], materials.water);

const aurelia = new THREE.Group();
aurelia.name = "Aurelia Gardens";
district.add(aurelia);
tower(aurelia, "Aurelia Gardens", -55, -62, 18, 16, 45);
tower(aurelia, "Aurelia Gardens", -30, -54, 16, 14, 36);
tower(aurelia, "Aurelia Gardens", -49, -31, 14, 13, 29);

const marina = new THREE.Group();
marina.name = "Marina Crown";
district.add(marina);
roundTower(marina, "Marina Crown", 65, -67, 10, 58);
roundTower(marina, "Marina Crown", 89, -47, 8, 42);
roundTower(marina, "Marina Crown", 57, -29, 7, 35);

const palm = new THREE.Group();
palm.name = "The Palm Residences";
district.add(palm);
for (const [x, z, rotation] of [
  [-59, 29, 0.08],
  [-38, 30, -0.08],
  [-57, 50, -0.06],
  [-35, 53, 0.06],
  [-55, 73, 0.04],
  [-33, 76, -0.04],
]) {
  box(palm, "The Palm Residences", [15, 8, 13], [x, 4.4, z], materials.white, rotation);
  box(palm, "The Palm Residences", [15.8, 0.35, 13.8], [x, 7.2, z], materials.gold, rotation);
  box(palm, "The Palm Residences", [9, 4.2, 0.18], [x, 4.5, z + 6.6], materials.glass, rotation);
}

const azure = new THREE.Group();
azure.name = "Azure Heights";
district.add(azure);
tower(azure, "Azure Heights", 25, 33, 20, 15, 66, { body: materials.white, glass: materials.glassLight });
tower(azure, "Azure Heights", 50, 42, 18, 14, 50, { body: materials.white, glass: materials.glassLight });
tower(azure, "Azure Heights", 27, 66, 16, 13, 37, { body: materials.white, glass: materials.glassLight });

const boulevard = new THREE.Group();
boulevard.name = "Keyora Boulevard";
district.add(boulevard);
tower(boulevard, "Keyora Boulevard", 91, 41, 19, 17, 48, { body: materials.terracotta });
tower(boulevard, "Keyora Boulevard", 88, 72, 22, 18, 62, { body: materials.terracotta });

for (let x = -112; x <= 112; x += 14) {
  if (Math.abs(x + 12) > 11) {
    tree(district, x, -12, 0.85);
    tree(district, x + 5, 13, 0.75);
  }
}
for (let z = -88; z <= 88; z += 15) {
  tree(district, -99, z, 0.9);
  if (z < -22 || z > 9) tree(district, -20, z, 0.7);
}
for (const [x, z] of [[7, -67], [18, -70], [31, -69], [8, -39], [34, -32], [12, 71], [59, 72], [107, 67]]) {
  tree(district, x, z, 1);
}

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
