import { ALL_RAIL_LINES, METRO_LINES, TRAIN_LINES, STATION_PROGRESS } from "../src/lib/metro";

const failures: string[] = [];

function distDeg(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distanceToPathDeg(path: [number, number][], coord: [number, number]) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((coord[0] - ax) * dx + (coord[1] - ay) * dy) / lenSq));
    const px = ax + dx * t;
    const py = ay + dy * t;
    best = Math.min(best, Math.hypot(coord[0] - px, coord[1] - py));
  }
  return best;
}

// Real-named stations (RTA data) must sit tight on their line. Generic
// "Point N"-derived stations live on speculative 2030-plan lines the source
// KML itself only sketches loosely (sparse LineStrings that don't always
// dip through every drawn station) — those get a much looser tolerance.
const ON_LINE_TOLERANCE_REAL_DEG = 0.0015; // ~150m
const ON_LINE_TOLERANCE_GENERIC_DEG = 0.07; // ~7.8km
const UAE_BBOX = { minLng: 51, maxLng: 57, minLat: 22, maxLat: 27 };

let totalStations = 0;
const allStationIds = new Set<string>();
const allLineIds = new Set<string>();

for (const line of ALL_RAIL_LINES) {
  if (allLineIds.has(line.id)) failures.push(`duplicate line id: ${line.id}`);
  allLineIds.add(line.id);

  if (line.path.length < 2) failures.push(`${line.id}: path has fewer than 2 points`);

  for (const [lng, lat] of line.path) {
    if (Number.isNaN(lng) || Number.isNaN(lat)) failures.push(`${line.id}: NaN coordinate in path`);
    if (lng < UAE_BBOX.minLng || lng > UAE_BBOX.maxLng || lat < UAE_BBOX.minLat || lat > UAE_BBOX.maxLat) {
      failures.push(`${line.id}: path coordinate [${lng},${lat}] outside UAE bbox`);
    }
  }
  // Speculative-line source LineStrings are sometimes sparse (e.g. a 2-point
  // stub spanning several km with no via-points) — only flag gaps large
  // enough to suggest a stitching error, not a legitimately sparse segment.
  for (let i = 1; i < line.path.length; i++) {
    const gap = distDeg(line.path[i - 1], line.path[i]);
    if (gap > 0.15) failures.push(`${line.id}: large path gap (${gap.toFixed(4)} deg) at vertex ${i}`);
  }

  let prevProgress = -1;
  for (let i = 0; i < line.stations.length; i++) {
    const station = line.stations[i];
    totalStations++;

    if (allStationIds.has(station.id)) failures.push(`duplicate station id: ${station.id}`);
    allStationIds.add(station.id);

    const isGeneric = / Station \d+$/.test(station.name);
    const tolerance = isGeneric ? ON_LINE_TOLERANCE_GENERIC_DEG : ON_LINE_TOLERANCE_REAL_DEG;
    const d = distanceToPathDeg(line.path, station.coord);
    if (d > tolerance) {
      failures.push(`${line.id}/${station.id} "${station.name}": ${(d * 111320).toFixed(0)}m from its own line's path`);
    }

    const progress = STATION_PROGRESS[station.id];
    if (progress === undefined) {
      failures.push(`${line.id}/${station.id}: missing STATION_PROGRESS entry`);
    } else if (progress < prevProgress - 1e-9) {
      failures.push(
        `${line.id}: station order not monotonic at "${station.name}" (progress ${progress.toFixed(4)} < previous ${prevProgress.toFixed(4)})`,
      );
    } else {
      prevProgress = progress;
    }

    for (let j = i + 1; j < line.stations.length; j++) {
      if (distDeg(station.coord, line.stations[j].coord) < 0.0004) {
        failures.push(`${line.id}: near-duplicate stations "${station.name}" / "${line.stations[j].name}"`);
      }
    }
  }
}

// Real-name smoke test — must survive the KML->TS conversion.
const allNames = new Set(ALL_RAIL_LINES.flatMap((l) => l.stations.map((s) => s.name)));
const expectedRed = ["Emirates Towers", "DMCC", "Al Rigga"];
const expectedGreen = ["Union", "Gold Souq", "Baniyas Square"];
for (const name of [...expectedRed, ...expectedGreen]) {
  if (!allNames.has(name)) failures.push(`expected real station name missing: "${name}"`);
}

const genericLeftover = [...allNames].filter((n) => /^Point \d+$/.test(n));
if (genericLeftover.length) {
  failures.push(`${genericLeftover.length} station(s) still have raw "Point N" placeholder names`);
}

const metroLineCount = METRO_LINES.length;
const trainLineCount = TRAIN_LINES.length;
if (trainLineCount < 1) failures.push("expected at least 1 train line (Etihad Rail)");
if (metroLineCount < 7) failures.push(`expected at least 7 metro lines (one per source folder + tram), got ${metroLineCount}`);

console.log(
  JSON.stringify(
    {
      metroLines: metroLineCount,
      trainLines: trainLineCount,
      totalStations,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  throw new Error(`Metro validation failed with ${failures.length} issue(s)`);
}
