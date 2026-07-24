// OSM-based Dubai hospital importer.
//
// Fetches amenity=hospital inside Dubai from the Overpass API, filters it down to
// places that are genuinely hospitals, and writes them to the Supabase `hospitals`
// table (which feeds the map's Hospitals POI category — see src/hooks/use-pois.ts).
//
// Why OSM and not the Google Maps result list: Google's list is lazy-loaded, leads
// with Sponsored entries, mixes clinics in with hospitals, and the content is
// Google-licensed. Overpass returns name + coordinates for the whole emirate in one
// query under ODbL, and lets "is this really a hospital?" be an explicit tag/name
// filter rather than a judgement call per row.
//
// OSM's amenity=hospital is applied loosely in the UAE — plenty of clinics, dental
// and diagnostic centres carry it — so REJECT_NAME below does the real work. Every
// dropped row is printed so the filtering stays auditable.
//
// Run (repo root):
//   npm run generate:hospitals              # fetch + filter + write review file only
//   npm run generate:hospitals -- --replace # ALSO delete every existing row and insert these
//   (add --refresh to bypass the Overpass cache)

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Overpass JSON is untyped */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REFRESH = process.argv.includes("--refresh");
const REPLACE = process.argv.includes("--replace");

// Dubai emirate only. Deliberately tighter on the NE than the road/water bboxes:
// past ~25.34 lat / 55.58 lng you are in Sharjah, whose hospitals must not appear.
const DUBAI = { west: 54.85, south: 24.75, east: 55.58, north: 25.34 };

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "dubai-skyview-hospitals-generator/1.0 (OSM hospital import)";

const REPO_ROOT = process.cwd();
const CACHE_DIR = join(REPO_ROOT, "scripts", ".cache");
const REVIEW_FILE = join(REPO_ROOT, "scripts", "hospitals.review.json");
// Reviewable SQL, following the repo's existing supabase/seed_dubai_pois.sql
// pattern. Preferred over writing straight to Supabase because a full replace
// needs delete rights the anon key does not have under RLS.
const SEED_FILE = join(REPO_ROOT, "supabase", "seed_dubai_hospitals.sql");

// Hospitals confirmed present on Google Maps' "dubai hospitals" search. Used
// ONLY to report coverage gaps — never as a data source.
const GOOGLE_REFERENCE = [
  "Dubai Hospital",
  "Medeor Hospital Dubai",
  "International Modern Hospital",
  "Emirates Specialty Hospital",
  "American Hospital Dubai Science Park",
  "Zulekha Hospital Dubai",
  "Emirates Hospital Jumeirah",
  "Dubai London Hospital",
  "Al Zahra Hospital Dubai",
  "American Hospital Dubai",
];

// Must read as a hospital by name (English or Arabic)...
const ACCEPT_NAME = /\bhospitals?\b|مستشفى/i;
// ...and must not be one of the many non-hospitals OSM tags amenity=hospital.
const REJECT_NAME =
  /clinic|polyclinic|dental|diagnostic|pharmac|ayurved|aesthetic|home healthcare|training centre|building|bldg|service complex|herbal|osteopath|physiotherap|laborator/i;
// Hospitals in neighbouring emirates occasionally fall inside the bbox corner.
const OTHER_EMIRATE = /sharjah|ajman|abu dhabi|umm al|ras al kh|fujairah/i;

/**
 * The Dubai–Sharjah border is diagonal, so a rectangular bbox can't express it:
 * its NE corner scoops up Sharjah's Al Nahda / Al Qasimia hospitals (Al Qassimi,
 * Oriana, Euro Arabian, New Hope...), which are not in Dubai. Cut that wedge.
 * Dubai's own Al Qusais hospitals (e.g. Zulekha at 25.291) sit below it.
 */
const inSharjahWedge = (lat: number, lng: number) => lat > 25.305 && lng > 55.355;

type Hospital = { name: string; lat: number; lng: number };

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

/** Normalised key for dedupe. Folds a known OSM typo so the pair collapses. */
const norm = (s: string) => s.toLowerCase().replace(/hosptial/g, "hospital").replace(/[^a-z0-9]/g, "");

/** Single-quote a value for SQL by doubling any embedded quote. */
const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

function metresApart(a: Hospital, b: Hospital): number {
  return Math.hypot((a.lat - b.lat) * 111_000, (a.lng - b.lng) * 100_000);
}

async function main() {
  const bbox = `${DUBAI.south},${DUBAI.west},${DUBAI.north},${DUBAI.east}`;
  // `out center` so ways/relations (most hospitals are mapped as building polygons)
  // come back with a centroid instead of no coordinates at all.
  const query = `[out:json][timeout:90];
(
  node["amenity"="hospital"](${bbox});
  way["amenity"="hospital"](${bbox});
  relation["amenity"="hospital"](${bbox});
);
out center tags;`;

  console.log("Fetching Dubai hospitals from Overpass...");
  const raw = await overpass("hospitals", query);

  const dropped: string[] = [];
  const candidates: Hospital[] = [];
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

  // Dedupe: same normalised name, one name containing the other, or two entries
  // under ~150 m apart whose names start alike (the same site mapped twice).
  const hospitals: Hospital[] = [];
  for (const h of candidates) {
    const n = norm(h.name);
    const dup = hospitals.find((p) => {
      const m = norm(p.name);
      if (m === n || m.includes(n) || n.includes(m)) return true;
      return metresApart(p, h) < 150 && m.slice(0, 6) === n.slice(0, 6);
    });
    if (!dup) hospitals.push(h);
  }
  hospitals.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nDropped ${dropped.length} non-hospital entries (clinics, dental, etc.)`);
  console.log(`Kept ${hospitals.length} hospitals:`);
  for (const [i, h] of hospitals.entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. ${h.name}  [${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}]`);
  }

  writeFileSync(REVIEW_FILE, JSON.stringify(hospitals, null, 2));
  console.log(`\nReview file written: ${REVIEW_FILE}`);

  // --- Google cross-check: a coverage report, not a data source ---------------
  // "Extra" is expected and fine — Google's list is lazy-loaded and only showed a
  // handful of entries, so Overpass legitimately knows about more hospitals.
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w !== "dubai" && w !== "hospital").join("");
  const missing = GOOGLE_REFERENCE.filter((g) => {
    const gs = slug(g);
    return !hospitals.some((h) => {
      const hs = slug(h.name);
      return hs === gs || hs.includes(gs) || gs.includes(hs);
    });
  });
  console.log("\nGoogle cross-check:");
  console.log(`  matched ${GOOGLE_REFERENCE.length - missing.length}/${GOOGLE_REFERENCE.length}`);
  if (missing.length) {
    console.log("  MISSING from OSM (check by hand before seeding):");
    for (const m of missing) console.log(`    - ${m}`);
  }

  const sqlRows = hospitals
    .map((h) => `  (${esc(h.name)}, ${h.lat.toFixed(6)}, ${h.lng.toFixed(6)}, '{}')`)
    .join(",\n");
  writeFileSync(
    SEED_FILE,
    `-- Dubai hospitals, generated by scripts/generate-hospitals.ts from OpenStreetMap (ODbL).
-- Regenerate with: npm run generate:hospitals
-- Replaces the hospitals table only; tourism/schools rows are untouched.
BEGIN;
TRUNCATE TABLE public.hospitals;
INSERT INTO public.hospitals (name, lat, lng, images) VALUES
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
  // A full replace deletes rows, which the anon key normally cannot do under RLS.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and a key must be set to use --replace");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("\n! No SUPABASE_SERVICE_ROLE_KEY — falling back to the anon key.");
    console.warn("! If RLS blocks writes this will fail; that is expected, not a bug in this script.");
  }
  const supabase = createClient(url, key);

  const { count: before, error: countErr } = await supabase
    .from("hospitals")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;
  console.log(`\nReplacing table contents — ${before ?? 0} existing row(s) will be deleted.`);

  const { error: delErr } = await supabase.from("hospitals").delete().not("id", "is", null);
  if (delErr) throw delErr;

  const { error: insErr } = await supabase
    .from("hospitals")
    .insert(hospitals.map((h) => ({ name: h.name, lat: h.lat, lng: h.lng, images: [] })));
  if (insErr) throw insErr;

  const { count: after } = await supabase.from("hospitals").select("*", { count: "exact", head: true });
  console.log(`Done — hospitals table now holds ${after ?? 0} row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
