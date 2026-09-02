// Roads diagnosis: for each signature route, fetch the ref-based reference from
// Overpass (wide bbox), join into chains, and compare length + max deviation
// against the repo's current geometry in roadsMain.generated.ts.
// Run: node scripts/diagnoseRoads.mjs   (network; caches to scripts/.cache/diag-*.json)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// route key -> how the reference is selected. Most have a numeric ref; szr/expo
// are name-driven in the repo but E11/E77 give the true corridor length.
const ROUTES = [
  { key: "szr", name: "Sheikh Zayed Road", ref: "E11", repoRef: null, repoName: /^sheikh zayed road/i },
  { key: "ummsuqeim", name: "Umm Suqeim Street", ref: "D63", repoRef: /^D\s*63$/i, repoName: /^umm suqeim street/i },
  { key: "alkhail", name: "Al Khail Road", ref: "E44", repoRef: /^E\s*44$/i, repoName: /^al khail road$/i },
  { key: "hessa", name: "Hessa Street", ref: "D61", repoRef: /^D\s*61$/i, repoName: /^hessa street/i },
  { key: "mbz", name: "Mohammed Bin Zayed Road", ref: "E311", repoRef: /^E\s*311$/i, repoName: /mohammed bin zayed/i },
  { key: "hamdan", name: "Zayed Bin Hamdan Road", ref: "D54", repoRef: /^D\s*54$/i, repoName: /zayed bin hamdan/i },
  { key: "emirates", name: "Emirates Road", ref: "E611", repoRef: /^E\s*611$/i, repoName: /^emirates road$/i },
  { key: "alain", name: "Dubai–Al Ain Road", ref: "E66", repoRef: /^E\s*66$/i, repoName: /dubai\s*-\s*al ain road/i },
  { key: "lehbab", name: "Lehbab Road", ref: "E77", repoRef: /^E\s*77$/i, repoName: /lahbab road/i },
];

// Fetch bbox — beyond the display bounds so edge ways come back whole, but not
// so large Overpass times out (504) on busy refs.
const BBOX = "24.55,54.60,25.95,56.00"; // S,W,N,E
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const CACHE = join(process.cwd(), "scripts", ".cache");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(ref) {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, `diag-${ref}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const q = `[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"]["ref"~"(^|;)${ref}(;|$)"](${BBOX});out geom;`;
  let last;
  for (let a = 0; a < MIRRORS.length * 2; a++) {
    try {
      const res = await fetch(MIRRORS[a % MIRRORS.length], {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "dubai-skyview-roads-diagnosis/1.0",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(q),
      });
      if (res.status === 429) { await sleep(8000); throw new Error("HTTP 429 (rate)"); }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (!j.elements) throw new Error("no elements");
      writeFileSync(f, JSON.stringify(j));
      return j;
    } catch (e) { last = e; console.warn(`  ${ref} attempt ${a}: ${e.message}`); }
  }
  throw last;
}

const R = 6371, toRad = (d) => (d * Math.PI) / 180;
const hav = ([lo1, la1], [lo2, la2]) => {
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
const lineLen = (c) => c.reduce((s, p, i) => (i ? s + hav(c[i - 1], p) : 0), 0);
const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

function joinChains(ways) {
  const segs = ways.map((w) => ({ c: w.slice(), used: false }));
  const chains = [];
  for (const s of segs) {
    if (s.used) continue;
    s.used = true;
    let ch = s.c.slice(), ext = true;
    while (ext) {
      ext = false;
      const head = key(ch[0]), tail = key(ch[ch.length - 1]);
      for (const t of segs) {
        if (t.used) continue;
        const a = key(t.c[0]), b = key(t.c[t.c.length - 1]);
        if (b === head) { ch = t.c.slice(0, -1).concat(ch); t.used = ext = true; }
        else if (a === head) { ch = t.c.slice().reverse().slice(0, -1).concat(ch); t.used = ext = true; }
        else if (a === tail) { ch = ch.concat(t.c.slice(1)); t.used = ext = true; }
        else if (b === tail) { ch = ch.concat(t.c.slice().reverse().slice(1)); t.used = ext = true; }
      }
    }
    chains.push(ch);
  }
  return chains;
}

// distance (m) from point p to the nearest vertex among ref ways (approx).
function nearestRefDist(p, refPts) {
  let best = Infinity;
  for (const q of refPts) {
    const d = hav(p, q) * 1000;
    if (d < best) best = d;
    if (best < 5) break;
  }
  return best;
}

// Load repo geometry, bucket by route (ref first, then name — repo's rule).
const txt = readFileSync(join(process.cwd(), "src/lib/roadsMain.generated.ts"), "utf8");
const fc = JSON.parse(txt.slice(txt.indexOf('{"type":"FeatureCollection"'), txt.lastIndexOf("} as unknown") + 1));
function repoRouteOf(props) {
  const refs = typeof props.ref === "string" ? props.ref.split(";").map((s) => s.trim()) : [];
  const byRef = ROUTES.find((r) => r.repoRef && refs.some((p) => r.repoRef.test(p)));
  if (byRef) return byRef.key;
  const nm = props.name;
  const byName = typeof nm === "string" ? ROUTES.find((r) => r.repoName.test(nm)) : null;
  return byName ? byName.key : null;
}
const repoWays = new Map(ROUTES.map((r) => [r.key, []]));
for (const f of fc.features) {
  const k = repoRouteOf(f.properties);
  if (k) repoWays.get(k).push(f.geometry.coordinates);
}

async function main() {
  console.log(`fetch bbox ${BBOX}\n`);
  console.log("route        repo_km  ref_km   %len  repo_chains  ref_chains  maxDev_m  p95Dev_m");
  console.log("-".repeat(90));
  for (const r of ROUTES) {
    let ref;
    try { ref = await overpass(r.ref); } catch (e) { console.log(`${r.key}: fetch failed ${e.message}`); continue; }
    await sleep(3000); // be polite to Overpass between routes
    const refWays = ref.elements.filter((e) => e.type === "way" && e.geometry?.length >= 2)
      .map((e) => e.geometry.map((g) => [+g.lon.toFixed(5), +g.lat.toFixed(5)]));
    const refChains = joinChains(refWays);
    const refKm = refChains.reduce((s, c) => s + lineLen(c), 0);
    const refPts = refWays.flat();

    const rw = repoWays.get(r.key);
    const repoChains = joinChains(rw);
    const repoKm = repoChains.reduce((s, c) => s + lineLen(c), 0);

    // deviation: sample repo vertices, nearest ref vertex
    const sample = rw.flat().filter((_, i) => i % 2 === 0);
    const devs = sample.map((p) => nearestRefDist(p, refPts)).sort((a, b) => a - b);
    const maxDev = devs.length ? devs[devs.length - 1] : 0;
    const p95 = devs.length ? devs[Math.floor(devs.length * 0.95)] : 0;

    const pct = refKm ? (100 * repoKm / refKm).toFixed(0) : "—";
    console.log(
      `${r.key.padEnd(12)} ${repoKm.toFixed(1).padStart(6)} ${refKm.toFixed(1).padStart(7)} ${String(pct).padStart(5)}  ${String(repoChains.length).padStart(10)}  ${String(refChains.length).padStart(9)}  ${maxDev.toFixed(0).padStart(7)}  ${p95.toFixed(0).padStart(7)}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
