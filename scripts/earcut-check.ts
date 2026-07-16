// Direct earcut/triangulation check for the generated water geometry — the
// exact THREE.ShapeGeometry path WaterLayer uses — without needing Mapbox or a
// browser. Confirms every WATER_AREA triangulates to a non-zero, area-matching
// mesh in reasonable time (the open sea with its island holes is the concern).
import * as THREE from "three";
import { WATER_AREAS } from "../src/lib/water";

// Flat local projection (metres) around a Dubai origin — mirrors lngLatToLocal.
const LAT0 = 25.2;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const toLocal = ([lng, lat]: [number, number]): [number, number] => [
  lng * M_PER_DEG_LNG,
  lat * M_PER_DEG_LAT,
];

function ringArea(ring: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = toLocal(ring[i]);
    const b = toLocal(ring[(i + 1) % ring.length]);
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

let failures = 0;
for (const area of WATER_AREAS) {
  const t0 = Date.now();
  const shape = new THREE.Shape();
  area.polygon.forEach(([lng, lat], i) => {
    const [x, y] = toLocal([lng, lat]);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  for (const hole of area.holes ?? []) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    hole.forEach(([lng, lat], i) => {
      const [x, y] = toLocal([lng, lat]);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
    shape.holes.push(path);
  }

  const geom = new THREE.ShapeGeometry(shape);
  const ms = Date.now() - t0;
  const index = geom.getIndex();
  const pos = geom.getAttribute("position");
  const tris = index ? index.count / 3 : pos ? pos.count / 3 : 0;

  let meshArea = 0;
  if (pos && index) {
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      const ax = pos.getX(ia), ay = pos.getY(ia);
      const bx = pos.getX(ib), by = pos.getY(ib);
      const cx = pos.getX(ic), cy = pos.getY(ic);
      meshArea += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    }
  }
  const expected = ringArea(area.polygon) - (area.holes ?? []).reduce((s, h) => s + ringArea(h), 0);
  const pct = expected > 0 ? (meshArea / expected) * 100 : 0;
  const ok = tris > 0 && pct >= 99;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${area.id}: ${tris} tris, ${pct.toFixed(1)}% area, ${(area.holes ?? []).length} holes, ${area.polygon.length} outer pts, ${ms}ms`,
  );
}
console.log(failures === 0 ? "\nPASS — all water areas triangulate" : `\nFAIL — ${failures} area(s)`);
process.exit(failures === 0 ? 0 : 1);
