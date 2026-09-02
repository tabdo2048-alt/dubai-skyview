#!/usr/bin/env node
// Rebuilds src/lib/metroImported.generated.ts from the "Dubai.al 2025-2030
// Public Transport Scheme" Google My Maps KML export
// (https://www.google.com/maps/d/u/0/viewer?mid=1_gUNTCMw_3ltChX8p5DHiDTr3o3n5Pc).
//
// Unlike the original (deleted) build-metro.mjs, this keeps every real
// station name the KML provides (Red/Green lines are named end-to-end) and
// orders every line's stations by arc-length projection onto its path,
// instead of leaving them in whatever order the source placemarks appear.
//
// Run: node scripts/build-metro.mjs [path/to/metro.kml]
//   - With no argument, fetches the KML live (requires a browser User-Agent —
//     Google's export endpoint 406s the default fetch/curl UA).
//   - With an argument, reads a previously-saved KML file instead (useful for
//     reproducibility — the map can change under us).

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KML_URL =
  "https://www.google.com/maps/d/kml?mid=1_gUNTCMw_3ltChX8p5DHiDTr3o3n5Pc&forcekml=1";
const OUT_PATH = join(__dirname, "../src/lib/metroImported.generated.ts");

const TRANSIT_FOLDERS = [
  "Red Line",
  "Green Line",
  "Yellow Line",
  "Blue Line",
  "Cyan Line",
  "Etihad Rail",
  "Pink Line",
];

// Status per folder feeds metro.ts's lineCategory()/legend grouping.
const FOLDER_STATUS = {
  "Red Line": "operational",
  "Green Line": "operational",
  "Blue Line": "under-construction",
  "Yellow Line": "planned-2030",
  "Cyan Line": "planned-2030",
  "Pink Line": "planned-2030",
  "Etihad Rail": "under-construction",
};

// Real station names + coordinates hand-curated in the now-retired
// metroAccurate.ts (RTA "Dubai Metro Guide" Dec 2025 edition). Used to
// backfill any KML station that's still placeholder-named ("Point N") but
// sits close to a known real station.
const REFERENCE_NAMES = [
  ["Centrepoint", 55.39598, 25.24796],
  ["Emirates", 55.38167, 25.25233],
  ["Airport Terminal 3", 55.36452, 25.24845],
  ["Airport Terminal 1", 55.35234, 25.24842],
  ["Al Garhoud", 55.33091, 25.25036],
  ["Deira City Centre", 55.33029, 25.25501],
  ["Al Rigga", 55.32394, 25.26324],
  ["Union", 55.31544, 25.26631],
  ["BurJuman", 55.30441, 25.25478],
  ["ADCB", 55.29816, 25.24449],
  ["Al Jafiliya", 55.29205, 25.23359],
  ["World Trade Centre", 55.28511, 25.22478],
  ["Emirates Towers", 55.27988, 25.21733],
  ["Financial Centre", 55.27559, 25.21113],
  ["Burj Khalifa / Dubai Mall", 55.26939, 25.20141],
  ["Business Bay", 55.26028, 25.19125],
  ["Onpassive", 55.24571, 25.17381],
  ["Equiti", 55.22807, 25.15601],
  ["Mall of the Emirates", 55.2003, 25.12128],
  ["Mashreq", 55.19099, 25.11487],
  ["Dubai Internet City", 55.17361, 25.10205],
  ["Al Khail", 55.158, 25.08886],
  ["Sobha Realty", 55.14754, 25.08],
  ["DMCC", 55.13905, 25.07128],
  ["Jabal Ali", 55.12695, 25.05789],
  ["Ibn Battuta", 55.11737, 25.04698],
  ["Energy", 55.10115, 25.02602],
  ["Danube", 55.0957, 25.00117],
  ["Life Pharmacy", 55.09111, 24.9776],
  ["The Gardens", 55.15226, 25.0464],
  ["Discovery Gardens", 55.14524, 25.03522],
  ["Al Furjan", 55.15215, 25.03052],
  ["Jumeirah Golf Estates", 55.16322, 25.01776],
  ["Dubai Investment Park", 55.15566, 25.00541],
  ["Expo 2020", 55.1458, 24.96362],
  ["Etisalat", 55.3786, 25.2961],
  ["Al Qusais", 55.382, 25.2847],
  ["Dubai Airport Free Zone", 55.3867, 25.2806],
  ["Al Nahda", 55.3736, 25.2865],
  ["Stadium", 55.3616, 25.287],
  ["Al Qiyadah", 55.3502, 25.2847],
  ["Abu Hail", 55.3429, 25.2775],
  ["Abu Baker Al Siddique", 55.3338, 25.2706],
  ["Salah Al Din", 55.3262, 25.2658],
  ["Baniyas Square", 55.3059, 25.2676],
  ["Gold Souq", 55.3014, 25.2706],
  ["Al Ras", 55.2976, 25.2684],
  ["Al Ghubaiba", 55.2932, 25.2621],
  ["Sharaf DG", 55.2977, 25.2565],
  ["Oud Metha", 55.3116, 25.2456],
  ["Dubai Healthcare City", 55.3209, 25.2336],
  ["Al Jadaf", 55.3282, 25.2261],
  ["Creek", 55.3343, 25.2185],
];
const REFERENCE_MATCH_DEG = 0.003; // ~300 m

function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeFolderName(name) {
  return name.replace(/С/g, "C").trim();
}

function extractFolders(kml) {
  const folders = [];
  const folderRe = /<Folder>([\s\S]*?)<\/Folder>/g;
  let m;
  while ((m = folderRe.exec(kml))) {
    const body = m[1];
    const nameMatch = body.match(/<name>([\s\S]*?)<\/name>/);
    const name = normalizeFolderName(decodeEntities(nameMatch ? nameMatch[1] : ""));
    folders.push({ name, body });
  }
  return folders;
}

function parseCoordinates(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const [lng, lat] = tuple.split(",").map(Number);
      return [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
    });
}

function extractPlacemarks(folderBody) {
  const placemarks = [];
  const placemarkRe = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let m;
  while ((m = placemarkRe.exec(folderBody))) {
    const body = m[1];
    const nameMatch = body.match(/<name>([\s\S]*?)<\/name>/);
    const name = decodeEntities(nameMatch ? nameMatch[1] : "");
    const lineMatch = body.match(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
    const pointMatch = body.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
    if (lineMatch) {
      placemarks.push({ kind: "line", name, coords: parseCoordinates(lineMatch[1]) });
    } else if (pointMatch) {
      placemarks.push({ kind: "point", name, coords: parseCoordinates(pointMatch[1]) });
    }
  }
  return placemarks;
}

const UAE_BBOX = { minLng: 51, maxLng: 57, minLat: 22, maxLat: 27 };
function assertInBbox(coords, context) {
  for (const [lng, lat] of coords) {
    if (lng < UAE_BBOX.minLng || lng > UAE_BBOX.maxLng || lat < UAE_BBOX.minLat || lat > UAE_BBOX.maxLat) {
      throw new Error(`${context}: coordinate [${lng},${lat}] outside UAE sanity bbox`);
    }
  }
}

function keyOf(pt) {
  return pt[0].toFixed(6) + "," + pt[1].toFixed(6);
}

// Greedy nearest-endpoint chaining: joins a folder's LineString segments into
// one or more contiguous chains (a folder yields >1 chain when its lines are
// genuinely disjoint corridors, e.g. Cyan, or have a branch, e.g. Red/Route 2020).
// Tolerance 0.015° (~1.5 km): the KML digitized each line as segments with small
// gaps at station platforms — 0.003 left the Red Line's Jabal Ali segment as a
// disconnected 16-pt orphan (1.7 km gap). 1.5 km closes those real-but-small
// gaps while keeping genuine branches (Red→Expo 9.4 km, Blue 19.5 km) and the
// mislabeled Green fragments (22 km away) as separate lines.
function stitchSegments(segments, epsDeg = 0.015) {
  const remaining = segments.map((s) => s.slice());
  const chains = [];
  while (remaining.length) {
    let chain = remaining.shift();
    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1];
      const head = chain[0];
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        if (dist(seg[0], tail) < epsDeg) {
          chain = chain.concat(seg.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (dist(seg[seg.length - 1], tail) < epsDeg) {
          chain = chain.concat(seg.slice(0, -1).reverse());
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (dist(seg[seg.length - 1], head) < epsDeg) {
          chain = seg.slice(0, -1).concat(chain);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (dist(seg[0], head) < epsDeg) {
          chain = seg.slice(1).reverse().concat(chain);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    chains.push(chain);
  }
  return chains;
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// Nearest point on a polyline to `coord`; returns { distDeg, fraction }.
function projectOntoPath(path, coord) {
  let cum = 0;
  const segLens = [];
  for (let i = 1; i < path.length; i++) {
    segLens.push(cum);
    cum += dist(path[i - 1], path[i]);
  }
  const total = cum || 1e-9;
  let best = { distSq: Infinity, along: 0 };
  let running = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((coord[0] - ax) * dx + (coord[1] - ay) * dy) / lenSq));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const distSq = (coord[0] - px) ** 2 + (coord[1] - py) ** 2;
    const segLen = Math.hypot(dx, dy);
    if (distSq < best.distSq) best = { distSq, along: running + segLen * t };
    running += segLen;
  }
  return { distDeg: Math.sqrt(best.distSq), fraction: total > 0 ? best.along / total : 0 };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function findReferenceName(coord) {
  let best = null;
  let bestDist = REFERENCE_MATCH_DEG;
  for (const [name, lng, lat] of REFERENCE_NAMES) {
    const d = dist(coord, [lng, lat]);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

async function loadKml(kmlPathArg) {
  if (kmlPathArg) {
    return readFileSync(kmlPathArg, "utf8");
  }
  const res = await fetch(KML_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`KML fetch failed: HTTP ${res.status}`);
  return res.text();
}

function buildLinesForFolder(folderName, placemarks) {
  const lineSegments = placemarks.filter((p) => p.kind === "line").map((p) => p.coords);
  const points = placemarks.filter((p) => p.kind === "point");
  for (const seg of lineSegments) assertInBbox(seg, `${folderName} LineString`);
  for (const pt of points) assertInBbox(pt.coords, `${folderName} Point "${pt.name}"`);

  const chains = stitchSegments(lineSegments);
  const idBase = slugify(folderName);
  const status = FOLDER_STATUS[folderName] ?? "planned-2030";

  // Assign each point to its nearest chain.
  const perChainPoints = chains.map(() => []);
  for (const pt of points) {
    let bestChain = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chains.length; i++) {
      const { distDeg } = projectOntoPath(chains[i], pt.coords[0]);
      if (distDeg < bestDist) {
        bestDist = distDeg;
        bestChain = i;
      }
    }
    perChainPoints[bestChain].push(pt);
  }

  const lines = chains.map((path, chainIdx) => {
    const id = chains.length > 1 ? `${idBase}-${chainIdx + 1}` : idBase;
    const chainPoints = perChainPoints[chainIdx]
      .map((pt) => ({
        name: pt.name,
        coord: pt.coords[0],
        fraction: projectOntoPath(path, pt.coords[0]).fraction,
      }))
      .sort((a, b) => a.fraction - b.fraction);

    // Dedupe stations within ~40m of each other on the same chain, keeping
    // the named one over a placeholder.
    const deduped = [];
    for (const s of chainPoints) {
      const prev = deduped[deduped.length - 1];
      if (prev && dist(prev.coord, s.coord) < 0.0004) {
        const prevIsPlaceholder = /^Point \d+$/.test(prev.name);
        if (prevIsPlaceholder && !/^Point \d+$/.test(s.name)) deduped[deduped.length - 1] = s;
        continue;
      }
      deduped.push(s);
    }

    const stations = deduped.map((s, i) => {
      let name = s.name;
      if (/^Point \d+$/.test(name)) {
        const ref = findReferenceName(s.coord);
        name = ref ?? `${folderName} Station ${i + 1}`;
      }
      return {
        id: `${id}-st-${i + 1}`,
        name,
        coord: s.coord,
      };
    });

    return {
      id,
      name: folderName,
      color: "#888888", // recolored by category in metro.ts
      status,
      path,
      stations,
    };
  });

  return lines;
}

async function main() {
  const kmlPathArg = process.argv[2];
  const kml = await loadKml(kmlPathArg);
  const folders = extractFolders(kml).filter((f) => TRANSIT_FOLDERS.includes(f.name));

  const foundNames = folders.map((f) => f.name);
  for (const required of TRANSIT_FOLDERS) {
    if (!foundNames.includes(required)) {
      throw new Error(`Missing expected folder "${required}" in KML — source may have changed`);
    }
  }

  const metroLines = [];
  const railLines = [];
  let totalStations = 0;
  for (const folder of folders) {
    const placemarks = extractPlacemarks(folder.body);
    const lines = buildLinesForFolder(folder.name, placemarks);
    for (const line of lines) totalStations += line.stations.length;
    if (folder.name === "Etihad Rail") {
      railLines.push(...lines);
    } else {
      metroLines.push(...lines);
    }
    console.log(
      `${folder.name}: ${lines.length} chain(s), ${lines.reduce((n, l) => n + l.stations.length, 0)} station(s)`,
    );
  }
  console.log(`Total: ${metroLines.length} metro lines, ${railLines.length} rail lines, ${totalStations} stations`);

  const placeholderCount = [...metroLines, ...railLines]
    .flatMap((l) => l.stations)
    .filter((s) => /^.+ Station \d+$/.test(s.name)).length;
  console.log(`Remaining generic-named stations: ${placeholderCount}`);

  const serializeLine = (line) => `  {
    id: ${JSON.stringify(line.id)},
    name: ${JSON.stringify(line.name)},
    color: "#888888", // recolored by category in metro.ts
    status: ${JSON.stringify(line.status)},
    path: [
${line.path.map((p) => `      [${p[0]}, ${p[1]}],`).join("\n")}
    ],
    stations: [
${line.stations.map((s) => `      { id: ${JSON.stringify(s.id)}, name: ${JSON.stringify(s.name)}, coord: [${s.coord[0]}, ${s.coord[1]}] },`).join("\n")}
    ],
  }`;

  const out = `// AUTO-GENERATED by scripts/build-metro.mjs from the "Dubai.al 2025-2030
// Public Transport Scheme" Google My Map KML export
// (https://www.google.com/maps/d/u/0/viewer?mid=1_gUNTCMw_3ltChX8p5DHiDTr3o3n5Pc).
// Regenerated ${new Date().toISOString().slice(0, 10)}. Do not edit by hand —
// re-run \`node scripts/build-metro.mjs\` instead.
//
// Real station names come straight from the KML placemarks (Red/Green lines
// are named end-to-end in the source). Stations with no real name in the
// source ("Point N" placeholders, on the speculative Yellow/Blue/Cyan/Pink
// 2040-plan lines) are backfilled from a curated reference list where a real
// RTA station sits within ~300m, otherwise named "<Line> Station <n>" in true
// travel order (ordered by arc-length projection onto the line's path, not
// source placemark order).
import type { MetroLine } from "./metro";

export const IMPORTED_METRO_LINES: MetroLine[] = [
${metroLines.map(serializeLine).join(",\n")},
];

export const IMPORTED_RAIL_LINES: MetroLine[] = [
${railLines.map(serializeLine).join(",\n")},
];
`;

  writeFileSync(OUT_PATH, out, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
