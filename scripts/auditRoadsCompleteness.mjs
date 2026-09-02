// Roads completeness audit (analysis only — no network, reads the baked data).
// For each signature route: how many disconnected chains its ways form (gaps),
// total length, shortest chain (stray fragments), and duplicate/overlapping ways.
// Run: node scripts/auditRoadsCompleteness.mjs
//
// A route that should be one continuous road but reports N>1 chains has gaps —
// usually Overpass ways clipped at the bbox edge, or link ramps splitting it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Same ref/name matchers as roadsLayer.ts ROUTES (keep in sync).
const ROUTES = [
  { key: "szr", name: "Sheikh Zayed Road", match: /^sheikh zayed road/i, ref: null },
  { key: "ummsuqeim", name: "Umm Suqeim Street", match: /^umm suqeim street/i, ref: /^D\s*63$/i },
  { key: "alkhail", name: "Al Khail Road", match: /^al khail road$/i, ref: /^E\s*44$/i },
  { key: "hessa", name: "Hessa Street", match: /^hessa street/i, ref: /^D\s*61$/i },
  { key: "mbz", name: "Mohammed Bin Zayed Road", match: /mohammed bin zayed/i, ref: /^E\s*311$/i },
  { key: "expo", name: "Expo Road", match: /^expo road$/i, ref: null },
  { key: "hamdan", name: "Zayed Bin Hamdan Road", match: /zayed bin hamdan/i, ref: /^D\s*54$/i },
  { key: "emirates", name: "Emirates Road", match: /^emirates road$/i, ref: /^E\s*611$/i },
  { key: "alain", name: "Dubai–Al Ain Road", match: /dubai\s*-\s*al ain road/i, ref: /^E\s*66$/i },
  { key: "lehbab", name: "Lehbab Road", match: /lahbab road/i, ref: /^E\s*77$/i },
];

// Load the baked GeoJSON out of the .ts wrapper.
const txt = readFileSync(join(process.cwd(), "src/lib/roadsMain.generated.ts"), "utf8");
const start = txt.indexOf('{"type":"FeatureCollection"');
const end = txt.lastIndexOf("} as unknown");
const fc = JSON.parse(txt.slice(start, end + 1));
console.log(`Loaded ${fc.features.length} road features.\n`);

function routeOf(props) {
  const ref = typeof props.ref === "string" ? props.ref.split(";").map((s) => s.trim()) : [];
  const byRef = ROUTES.find((r) => r.ref && ref.some((p) => r.ref.test(p)));
  if (byRef) return byRef.key;
  const nm = props.name;
  const byName = typeof nm === "string" ? ROUTES.find((r) => r.match.test(nm)) : null;
  return byName ? byName.key : null;
}

const R = 6371; // km
const toRad = (d) => (d * Math.PI) / 180;
function haversine([lo1, la1], [lo2, la2]) {
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const lineLen = (c) => c.reduce((s, p, i) => (i ? s + haversine(c[i - 1], p) : 0), 0);
const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

// Greedy chain-joining by shared endpoints (either direction).
function joinChains(ways) {
  const segs = ways.map((w) => ({ c: w.slice(), used: false }));
  const chains = [];
  for (const s of segs) {
    if (s.used) continue;
    s.used = true;
    let chain = s.c.slice();
    let extended = true;
    while (extended) {
      extended = false;
      const head = key(chain[0]), tail = key(chain[chain.length - 1]);
      for (const t of segs) {
        if (t.used) continue;
        const a = key(t.c[0]), b = key(t.c[t.c.length - 1]);
        if (b === head) { chain = t.c.slice(0, -1).concat(chain); t.used = true; extended = true; }
        else if (a === head) { chain = t.c.slice().reverse().slice(0, -1).concat(chain); t.used = true; extended = true; }
        else if (a === tail) { chain = chain.concat(t.c.slice(1)); t.used = true; extended = true; }
        else if (b === tail) { chain = chain.concat(t.c.slice().reverse().slice(1)); t.used = true; extended = true; }
      }
    }
    chains.push(chain);
  }
  return chains;
}

const buckets = new Map();
for (const r of ROUTES) buckets.set(r.key, []);
for (const f of fc.features) {
  const k = routeOf(f.properties);
  if (k) buckets.get(k).push(f.geometry.coordinates);
}

// Duplicate/overlapping way detection: identical endpoint-pair signatures.
function dupCount(ways) {
  const seen = new Map();
  let dups = 0;
  for (const w of ways) {
    const sig = [key(w[0]), key(w[w.length - 1])].sort().join("|");
    seen.set(sig, (seen.get(sig) ?? 0) + 1);
  }
  for (const v of seen.values()) if (v > 1) dups += v - 1;
  return dups;
}

console.log("route        ways  chains  total_km  longest_km  shortest_chain_km  dups");
console.log("-".repeat(82));
const FRAG_KM = 0.5;
for (const r of ROUTES) {
  const ways = buckets.get(r.key);
  if (ways.length === 0) { console.log(`${r.key.padEnd(12)}   0    —        —         —          —                  —   MISSING`); continue; }
  const chains = joinChains(ways);
  const lens = chains.map(lineLen).sort((a, b) => b - a);
  const total = lens.reduce((s, x) => s + x, 0);
  const frags = lens.filter((l) => l < FRAG_KM).length;
  console.log(
    `${r.key.padEnd(12)} ${String(ways.length).padStart(3)}  ${String(chains.length).padStart(5)}  ${total.toFixed(1).padStart(8)}  ${lens[0].toFixed(1).padStart(9)}  ${lens[lens.length - 1].toFixed(2).padStart(16)}  ${String(dupCount(ways)).padStart(4)}` +
    (chains.length > 1 ? `   ⚠ ${chains.length} chains (gaps)` : "") +
    (frags ? ` ⚠ ${frags} frag<${FRAG_KM}km` : ""),
  );
}
