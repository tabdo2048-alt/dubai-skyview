// One-off converter: reads the reference project's KML metro data + the
// TrainNetworkOverlay's TRAIN_LINES and emits data in this project's format
// (metro.ts MetroLine[] and a train network). Run: node scripts/convert-network.mjs
import fs from "node:fs";

const REF = "C:/Users/ashraf/Downloads/Mpaskkk-main/Mpaskkk/src/components/map";

// --- Load KML metro lines (has explicit `path` polylines + stations) ---
function loadExport(file, exportName) {
  let src = fs.readFileSync(`${REF}/${file}`, "utf8");
  // Grab the array literal assigned to the export.
  const re = new RegExp(`export const ${exportName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`Could not find ${exportName} in ${file}`);
  // Evaluate the array literal as JS (it's plain object/array syntax).
  // eslint-disable-next-line no-eval
  return eval(`(${m[1].replace(/;\s*$/, "")})`);
}

const kmlLines = loadExport("metroKmlData.ts", "KML_RAIL_LINES");

// Group KML segments by color into consolidated lines. Each color -> one line,
// concatenating segment paths and unioning stations (dedup by name).
const byColor = new Map();
for (const seg of kmlLines) {
  const key = seg.color;
  if (!byColor.has(key)) byColor.set(key, { color: key, names: new Set(), path: [], stations: new Map() });
  const grp = byColor.get(key);
  grp.names.add(seg.name.replace(/\s*\d+$/, "")); // "Red Line 1" -> "Red Line"
  for (const p of seg.path || []) grp.path.push([round(p.lng), round(p.lat)]);
  for (const s of seg.stations || []) {
    if (!grp.stations.has(s.name)) {
      grp.stations.set(s.name, {
        id: s.id,
        name: s.name,
        coord: [round(s.longitude), round(s.latitude)],
        interchange: !!s.is_interchange,
      });
    }
  }
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

const COLOR_META = {
  "#EF4444": { id: "red", name: "Red Line", status: "operational", kind: "metro" },
  "#22C55E": { id: "green", name: "Green Line", status: "operational", kind: "metro" },
  "#FDE047": { id: "yellow", name: "Yellow Line", status: "planned-2030", kind: "metro" },
  "#2563EB": { id: "blue", name: "Blue Line", status: "under-construction", kind: "metro" },
  "#F472B6": { id: "pink", name: "Pink Line", status: "planned-2030", kind: "metro" },
  "#D9F99D": { id: "etihad", name: "Etihad Rail", status: "planned-2030", kind: "rail" },
};

const allLines = [];
for (const [color, grp] of byColor) {
  const meta = COLOR_META[color] || { id: `line-${color.slice(1)}`, name: [...grp.names][0], status: "operational", kind: "metro" };
  // If the line has no explicit path, connect the stations in order.
  const path = grp.path.length > 1 ? grp.path : [...grp.stations.values()].map((s) => s.coord);
  allLines.push({
    id: meta.id,
    name: meta.name,
    color,
    status: meta.status,
    kind: meta.kind,
    path,
    stations: [...grp.stations.values()],
  });
}
const metroLines = allLines.filter((l) => l.kind === "metro");

// --- Train (regional rail) network from TrainNetworkOverlay's TRAIN_LINES ---
const TRAIN_LINES = [
  { id: "coastal", name: "Coastal / Jebel Ali Line", color: "#ef4444", stations: [["Jebel Ali Port", 25.0109, 55.0618], ["Jebel Ali Industrial", 25.0358, 55.1169], ["Dubai Marina", 25.0809, 55.1403], ["Al Sufouh", 25.1121, 55.1756], ["Umm Suqeim", 25.1497, 55.2069], ["Jumeirah", 25.2026, 55.2488], ["Satwa", 25.2268, 55.2787], ["Bur Dubai", 25.2596, 55.2962], ["Deira", 25.2697, 55.3095], ["Al Mamzar", 25.3096, 55.3424]] },
  { id: "airport-connector", name: "Airport Connector", color: "#a855f7", stations: [["Al Maktoum Airport (DWC)", 24.8894, 55.1614], ["Dubai South", 24.9157, 55.1902], ["Jebel Ali Industrial", 25.0358, 55.1169], ["Al Barsha", 25.1117, 55.2034], ["Business Bay", 25.1841, 55.2652], ["Zabeel", 25.2261, 55.3031], ["Dubai Intl Airport (DXB)", 25.2532, 55.3657]] },
  { id: "central-yellow", name: "Central Yellow Line", color: "#fde047", stations: [["Dubai Marina", 25.0809, 55.1403], ["Al Barsha", 25.1117, 55.2034], ["Meydan", 25.1662, 55.3002], ["Ras Al Khor", 25.1944, 55.3522], ["Dubai Festival City", 25.2215, 55.3499], ["Mirdif", 25.2217, 55.4247], ["Al Warqa", 25.2053, 55.4217]] },
  { id: "academic-city", name: "Academic City / Silicon Oasis", color: "#22c55e", stations: [["Dubai Silicon Oasis", 25.1249, 55.3816], ["Academic City", 25.1133, 55.4249], ["International City", 25.1677, 55.4073], ["Warsan", 25.1674, 55.4243], ["Al Warqa", 25.2053, 55.4217], ["Mirdif", 25.2217, 55.4247], ["Al Qusais", 25.2749, 55.3831]] },
  { id: "outer-growth", name: "Outer Growth Line", color: "#38bdf8", stations: [["DWC Logistics", 24.8894, 55.1614], ["Dubai Investment Park", 24.9889, 55.1487], ["Arabian Ranches", 25.0522, 55.2708], ["Dubai Land", 25.0854, 55.3195], ["Dubai Silicon Oasis", 25.1249, 55.3816], ["Academic City", 25.1133, 55.4249]] },
  { id: "northern-urban", name: "Northern Urban Line", color: "#f97316", stations: [["Bur Dubai", 25.2596, 55.2962], ["Dubai Creek", 25.2431, 55.3294], ["Dubai Festival City", 25.2215, 55.3499], ["Ras Al Khor", 25.1944, 55.3522], ["International City", 25.1677, 55.4073], ["Warsan", 25.1674, 55.4243]] },
];

const railLines = TRAIN_LINES.map((l) => {
  const stations = l.stations.map(([name, lat, lng], i) => ({
    id: `${l.id}-${i}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    name,
    coord: [round(lng), round(lat)],
    interchange: false,
  }));
  return { id: l.id, name: l.name, color: l.color, status: "planned-2030", path: stations.map((s) => s.coord), stations };
});

// Emit a TS snippet for the metro network.
function emitLine(l) {
  const path = l.path.map((c) => `    [${c[0]}, ${c[1]}],`).join("\n");
  const stations = l.stations
    .map(
      (s) =>
        `    { id: ${JSON.stringify(s.id)}, name: ${JSON.stringify(s.name)}, coord: [${s.coord[0]}, ${s.coord[1]}]${s.interchange ? ", interchange: true" : ""} },`,
    )
    .join("\n");
  return `  {
    id: ${JSON.stringify(l.id)},
    name: ${JSON.stringify(l.name)},
    color: ${JSON.stringify(l.color)},
    status: ${JSON.stringify(l.status)},
    path: [
${path}
    ],
    stations: [
${stations}
    ],
  },`;
}

const metroOut = `// AUTO-GENERATED from the reference KML + train network. Do not edit by hand.
// Regenerate with: node scripts/convert-network.mjs
import type { MetroLine } from "./metro";

export const IMPORTED_METRO_LINES: MetroLine[] = [
${metroLines.map(emitLine).join("\n")}
];

export const IMPORTED_TRAIN_LINES: MetroLine[] = [
${railLines.map(emitLine).join("\n")}
];
`;

fs.writeFileSync("src/lib/metroNetwork.generated.ts", metroOut);
console.log(`Metro: ${metroLines.map((l) => `${l.id}(${l.stations.length}st,${l.path.length}pt)`).join(", ")}`);
console.log(`Train: ${railLines.map((l) => `${l.id}(${l.stations.length}st)`).join(", ")}`);
