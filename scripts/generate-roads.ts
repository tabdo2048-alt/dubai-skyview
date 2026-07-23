// OSM-based Dubai main-road generator.
//
// Fetches the main road network (motorway / trunk / primary / secondary, incl.
// their _link ramps) inside DUBAI_BOUNDS from the Overpass API and emits it as a
// GeoJSON FeatureCollection of LineStrings to src/lib/roadsMain.generated.ts.
//
// Why GeoJSON (not the Mapbox Streets vector source): the "draw the line along
// its length" reveal (Mapbox line-trim-offset / line-gradient) requires the
// source to have lineMetrics, which is only available on GeoJSON sources. Baking
// the roads to GeoJSON lets roadsLayer animate a metro-style draw-on.
//
// Run (repo root):  npm run generate:roads   (add --refresh to re-fetch)

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Overpass JSON is untyped */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString } from "geojson";

const REFRESH = process.argv.includes("--refresh");
// Fetch across the map's pannable area (MAP_MAX_BOUNDS in src/lib/dubai.ts), not
// just the tighter DUBAI_BOUNDS, so routes stay complete to the edges the wider
// min-zoom view now reveals instead of ending mid-map.
const DUBAI_BOUNDS = { west: 54.53, south: 24.45, east: 56.02, north: 25.92 };

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "dubai-skyview-roads-generator/1.0 (OSM main-road build)";

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, "scripts", ".cache");
const OUT_FILE = join(REPO_ROOT, "src", "lib", "roadsMain.generated.ts");

async function overpass(name: string, query: string): Promise<any> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${name}.json`);
  if (!REFRESH && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  let lastErr: unknown;
  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 2; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      const json = await res.json();
      if (!json.elements || json.elements.length === 0) throw new Error(`empty from ${url}`);
      writeFileSync(cacheFile, JSON.stringify(json));
      console.log(`  fetched ${name} (${json.elements.length} ways) via ${url}`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`  ${name} attempt ${attempt} failed: ${(err as Error).message}`);
    }
  }
  throw lastErr;
}

// Normalize a highway tag to a color class: links share their parent's class.
function toClass(h: string): string {
  return h.replace(/_link$/, "");
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

async function main() {
  const { west, south, east, north } = DUBAI_BOUNDS;
  const bbox = `${south},${west},${north},${east}`;
  const query =
    `[out:json][timeout:180];` +
    `way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link|secondary_link)$"](${bbox});` +
    `out geom;`;

  console.log("Fetching main roads from Overpass…");
  const osm = await overpass("roads-main", query);

  const features: Feature<LineString, { class: string; name: string | null; ref: string | null }>[] = [];
  for (const el of osm.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((g: any) => [round(g.lon), round(g.lat)] as [number, number]);
    // Drop consecutive duplicate points, then simplify lightly (keeps shape).
    const dedup: [number, number][] = [];
    for (const c of coords) {
      const p = dedup[dedup.length - 1];
      if (!p || p[0] !== c[0] || p[1] !== c[1]) dedup.push(c);
    }
    if (dedup.length < 2) continue;
    let line: [number, number][] = dedup;
    try {
      const s = turf.simplify(turf.lineString(dedup), { tolerance: 0.00008, highQuality: false });
      const sc = s.geometry.coordinates as [number, number][];
      if (sc.length >= 2) line = sc.map(([x, y]) => [round(x), round(y)]);
    } catch {
      /* keep dedup */
    }
    const tags = el.tags ?? {};
    features.push({
      type: "Feature",
      properties: {
        class: toClass(tags.highway),
        name: tags["name:en"] ?? tags.name ?? null,
        ref: tags.ref ?? null,
      },
      geometry: { type: "LineString", coordinates: line },
    });
  }

  const fc: FeatureCollection = { type: "FeatureCollection", features };
  const totalPts = features.reduce((n, f) => n + (f.geometry.coordinates as any[]).length, 0);
  console.log(`  ${features.length} roads, ${totalPts} points`);

  const body =
    `// AUTO-GENERATED by scripts/generate-roads.ts — do not hand-edit.\n` +
    `// Dubai main roads (motorway/trunk/primary/secondary + links) from OpenStreetMap\n` +
    `// (© OpenStreetMap contributors, ODbL) via Overpass, bbox ${bbox} (S,W,N,E).\n` +
    `// Rerun: npm run generate:roads -- --refresh\n\n` +
    `import type { FeatureCollection, LineString } from "geojson";\n\n` +
    `export const ROADS_MAIN_GEOJSON: FeatureCollection<LineString, { class: string; name: string | null; ref: string | null }> =\n` +
    JSON.stringify(fc) +
    ` as unknown as FeatureCollection<LineString, { class: string; name: string | null; ref: string | null }>;\n`;

  writeFileSync(OUT_FILE, body);
  console.log(`Wrote ${OUT_FILE} (${(body.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
