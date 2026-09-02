// Standalone audit: point-in-polygon test known real-world LAND coordinates
// against every rendered WATER_AREA (outer ring minus holes). Land points must
// not be covered by any water surface. Run:
//   npx esbuild scripts/auditWaterOverlap.ts --bundle --platform=node --format=cjs --outfile=.output/audit-water.cjs && node .output/audit-water.cjs
import { WATER_AREAS } from "../src/lib/water";

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  const [px, py] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInWaterArea(point: [number, number], area: (typeof WATER_AREAS)[number]): boolean {
  if (!pointInRing(point, area.polygon)) return false;
  for (const hole of area.holes ?? []) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

const LAND_CHECKS: { name: string; coord: [number, number] }[] = [
  { name: "Jebel Ali Port container yard", coord: [55.03, 24.99] },
  { name: "Jebel Ali Port breakwater base", coord: [55.017, 24.983] },
  { name: "Dubai Marina mainland tower cluster", coord: [55.14, 25.077] },
  { name: "JBR beachfront promenade (mainland side)", coord: [55.13, 25.073] },
  { name: "JBR mid-beach", coord: [55.145, 25.08] },
  { name: "Palm Jumeirah trunk center", coord: [55.141, 25.11] },
  { name: "Palm Jumeirah trunk (mid)", coord: [55.142, 25.113] },
  { name: "Deira waterfront district", coord: [55.31, 25.27] },
  { name: "Deira Creek east bank", coord: [55.325, 25.265] },
  { name: "Downtown Dubai (well inland)", coord: [55.274, 25.197] },
];

const WATER_CHECKS: { name: string; coord: [number, number] }[] = [
  { name: "deep off JBR NW", coord: [55.1, 25.1] },
  { name: "off JBR beach", coord: [55.12, 25.095] },
  { name: "off central JBR", coord: [55.14, 25.093] },
  { name: "open sea NW of Palm", coord: [55.08, 25.12] },
  { name: "mid offshore JBR", coord: [55.11, 25.085] },
];

let failures = 0;

console.log("=== LAND points (must NOT be covered by water) ===");
for (const check of LAND_CHECKS) {
  // A land point is a bug if ANY rendered water area covers it (its outer ring
  // contains the point and no hole punches it back out).
  const hits = WATER_AREAS.filter(
    (area) => area.renderSurface && pointInWaterArea(check.coord, area),
  );
  if (hits.length > 0) {
    failures++;
    console.log(
      `  FAIL: "${check.name}" ${JSON.stringify(check.coord)} covered by: ${hits.map((h) => h.id).join(", ")}`,
    );
  } else {
    console.log(`  ok:   "${check.name}"`);
  }
}

console.log("\n=== WATER points (must remain covered) ===");
for (const check of WATER_CHECKS) {
  const hits = WATER_AREAS.filter(
    (area) => area.renderSurface && pointInWaterArea(check.coord, area),
  );
  if (hits.length === 0) {
    failures++;
    console.log(
      `  FAIL: "${check.name}" ${JSON.stringify(check.coord)} not covered by any water area`,
    );
  } else {
    console.log(`  ok:   "${check.name}" -> ${hits.map((h) => h.id).join(", ")}`);
  }
}

console.log(`\n${failures === 0 ? "PASS — no overlaps" : `FAIL — ${failures} issue(s)`}`);
process.exit(failures === 0 ? 0 : 1);
