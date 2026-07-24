// OSM-based Dubai school/university importer.
//
// Fetches amenity=school / university / college inside Dubai from the Overpass
// API, filters it to genuine educational institutions, and writes them to the
// Supabase `schools` table (the map's Schools/Education POI category — see
// src/hooks/use-pois.ts). Same pipeline as scripts/generate-hospitals.ts.
//
// Why OSM, not the Google Maps result list: Google's list is lazy-loaded, leads
// with Sponsored entries and non-schools (a dance studio showed up top for
// "dubai schools"), and the content is Google-licensed. Overpass returns name +
// coordinates for the whole emirate in one ODbL query, and lets "is this really
// a school?" be an explicit tag/name filter. Every dropped row is printed.
//
// Run (repo root):
//   npm run generate:schools               # fetch + filter + write review file only
//   npm run generate:schools -- --replace  # ALSO delete every existing row and insert these
//   (add --refresh to bypass the Overpass cache)

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Overpass JSON is untyped */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REFRESH = process.argv.includes("--refresh");
const REPLACE = process.argv.includes("--replace");

// Dubai emirate only; tighter on the NE than the road/water bboxes so Sharjah
// (past ~25.34 lat / 55.58 lng) is excluded.
const DUBAI = { west: 54.85, south: 24.75, east: 55.58, north: 25.34 };

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "dubai-skyview-schools-generator/1.0 (OSM school import)";

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, "scripts", ".cache");
const REVIEW_FILE = join(REPO_ROOT, "scripts", "schools.review.json");
const SEED_FILE = join(REPO_ROOT, "supabase", "seed_dubai_schools.sql");

// Well-known Dubai schools/universities (from the landmark data + Google Maps),
// used ONLY to report coverage gaps — never as a data source.
const GOOGLE_REFERENCE = [
  "American University in Dubai",
  "University of Wollongong in Dubai",
  "Heriot-Watt University Dubai",
  "Middlesex University Dubai",
  "Canadian University Dubai",
  "GEMS Wellington International School",
  "Nord Anglia International School Dubai",
  "Swiss International Scientific School in Dubai",
  "GEMS Royal Dubai School",
  "Amity School Dubai",
];

// A real educational institution reads as one of these by name...
const ACCEPT_NAME =
  /\b(school|schools|university|college|academy|institute|kindergarten|madrasa)\b|مدرسة|جامعة|كلية/i;
// ...and must not be one of the many non-schools carrying amenity=school in OSM.
const REJECT_NAME =
  /driving|nursery|tuition|training centre|training center|music|dance|swimming|riding|karate|language centre|language center|coaching|typing/i;
// Neighbouring emirates occasionally fall inside the bbox corner.
const OTHER_EMIRATE = /sharjah|ajman|abu dhabi|umm al|ras al kh|fujairah/i;
// The Dubai–Sharjah border is diagonal; a rectangle can't express it, so cut two
// wedges. Dubai's own Academic City / Silicon Oasis schools sit far south
// (lat < 25.15) and legitimately reach lng ~55.42, so the eastern cut only
// applies to the northern Muwailih / Al Nahda Sharjah cluster (lat > 25.25),
// which is where Wesgreen / Skyline / Scholars / Star (lng > 55.44) leaked in.
const inSharjahWedge = (lat: number, lng: number) =>
  (lat > 25.305 && lng > 55.355) || (lat > 25.25 && lng > 55.43) || lng > 55.48;

type School = { name: string; lat: number; lng: number };

async function overpass(name: string, query: string): Promise<any> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `${name}.json`);
  if (!REFRESH && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  let lastErr: unknown;
  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 3; attempt++) {
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
      if (!json.elements?.length) throw new Error(`empty from ${url}`);
      writeFileSync(cacheFile, JSON.stringify(json));
      console.log(`  fetched ${name} (${json.elements.length} elements) via ${url}`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`  retry (${(err as Error).message})`);
    }
  }
  throw lastErr;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

function metresApart(a: School, b: School): number {
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 100_000);
}

async function main() {
  const bbox = `${DUBAI.south},${DUBAI.west},${DUBAI.north},${DUBAI.east}`;
  const query = `[out:json][timeout:90];
(
  node["amenity"~"^(school|university|college)$"](${bbox});
  way["amenity"~"^(school|university|college)$"](${bbox});
  relation["amenity"~"^(school|university|college)$"](${bbox});
);
out center tags;`;

  console.log("Fetching Dubai schools/universities from Overpass...");
  const raw = await overpass("schools", query);

  const dropped: string[] = [];
  const candidates: School[] = [];
  for (const el of raw.elements ?? []) {
    const tags = el.tags ?? {};
    const name: string | undefined = tags["name:en"] || tags.name;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || typeof lat !== "number" || typeof lng !== "number") continue;
    if (
      !ACCEPT_NAME.test(name) ||
      REJECT_NAME.test(name) ||
      OTHER_EMIRATE.test(name) ||
      inSharjahWedge(lat, lng)
    ) {
      dropped.push(name);
      continue;
    }
    candidates.push({ name: name.trim().replace(/,$/, ""), lat, lng });
  }

  const schools: School[] = [];
  for (const s of candidates) {
    const n = norm(s.name);
    const dup = schools.find((p) => {
      const m = norm(p.name);
      if (m === n || m.includes(n) || n.includes(m)) return true;
      return metresApart(p, s) < 150 && m.slice(0, 6) === n.slice(0, 6);
    });
    if (!dup) schools.push(s);
  }
  schools.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nDropped ${dropped.length} non-school entries (nurseries, driving/training, etc.)`);
  console.log(`Kept ${schools.length} schools/universities:`);
  for (const [i, s] of schools.entries()) {
    console.log(`  ${String(i + 1).padStart(3)}. ${s.name}  [${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}]`);
  }

  writeFileSync(REVIEW_FILE, JSON.stringify(schools, null, 2));
  console.log(`\nReview file written: ${REVIEW_FILE}`);

  const slug = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w !== "dubai" && w !== "school" && w !== "university").join("");
  const missing = GOOGLE_REFERENCE.filter((g) => {
    const gs = slug(g);
    return !schools.some((s) => {
      const ss = slug(s.name);
      return ss === gs || ss.includes(gs) || gs.includes(ss);
    });
  });
  console.log("\nGoogle/landmark cross-check:");
  console.log(`  matched ${GOOGLE_REFERENCE.length - missing.length}/${GOOGLE_REFERENCE.length}`);
  if (missing.length) {
    console.log("  MISSING from OSM (check by hand before seeding):");
    for (const m of missing) console.log(`    - ${m}`);
  }

  const sqlRows = schools
    .map((s) => `  (${esc(s.name)}, ${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}, '{}')`)
    .join(",\n");
  writeFileSync(
    SEED_FILE,
    `-- Dubai schools/universities, generated by scripts/generate-schools.ts from OpenStreetMap (ODbL).
-- Regenerate with: npm run generate:schools
-- Replaces the schools table only; tourism/hospitals rows are untouched.
BEGIN;
TRUNCATE TABLE public.schools;
INSERT INTO public.schools (name, lat, lng, images) VALUES
${sqlRows};
COMMIT;
`,
  );
  console.log(`SQL seed written:   ${SEED_FILE}`);

  if (!REPLACE) {
    console.log("\nDry run — database untouched. Re-run with --replace to write these rows.");
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and a key must be set to use --replace");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("\n! No SUPABASE_SERVICE_ROLE_KEY — falling back to the anon key.");
    console.warn("! If RLS blocks writes this will fail; that is expected, not a bug in this script.");
  }
  const supabase = createClient(url, key);

  const { count: before, error: countErr } = await supabase
    .from("schools")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;
  console.log(`\nReplacing table contents — ${before ?? 0} existing row(s) will be deleted.`);

  const { error: delErr } = await supabase.from("schools").delete().not("id", "is", null);
  if (delErr) throw delErr;

  const { error: insErr } = await supabase
    .from("schools")
    .insert(schools.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng, images: [] })));
  if (insErr) throw insErr;

  const { count: after } = await supabase.from("schools").select("*", { count: "exact", head: true });
  console.log(`Done — schools table now holds ${after ?? 0} row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
