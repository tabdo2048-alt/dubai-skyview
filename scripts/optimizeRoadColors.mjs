// Optimize 10 road colors: maximize the MINIMUM pairwise CIEDE2000 among roads
// (legibility), while softly avoiding collisions with metro/zone/gold/water and
// keeping every color bright enough to read as a thin line on dark satellite.
// Random-restart hill climb over per-road (hue, L, C) in LCH. Deterministic seed.
// Run: node scripts/optimizeRoadColors.mjs   (analysis only)

import { deltaE00, lab } from "./_de.mjs";

function lchToRgbRaw(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = Math.cos(h) * C, b = Math.sin(h) * C;
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f3 = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const ref = [95.047, 100, 108.883];
  const X = ref[0] * f3(fx), Y = ref[1] * f3(fy), Z = ref[2] * f3(fz);
  let r = (X * 3.2406 - Y * 1.5372 - Z * 0.4986) / 100;
  let g = (-X * 0.9689 + Y * 1.8758 + Z * 0.0415) / 100;
  let bl = (X * 0.0557 - Y * 0.204 + Z * 1.057) / 100;
  return [r, g, bl];
}
function inGamut([r, g, b]) {
  return [r, g, b].every((v) => v >= -0.002 && v <= 1.002);
}
function lchToHex(L, C, h) {
  const gam = (v) => {
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  const [r, g, b] = lchToRgbRaw(L, C, h).map(gam);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
// Highest in-gamut chroma for a given L,h (so colors stay as vivid as possible).
function maxChroma(L, h) {
  let C = 5;
  for (let c = 5; c <= 132; c += 1) {
    if (inGamut(lchToRgbRaw(L, c, h))) C = c; else break;
  }
  return C;
}

const OTHERS = {
  m_red: "#E63946", m_green: "#2ECC71", m_blue: "#2D9CDB", m_yellow: "#F2C94C",
  m_pink: "#D85B8C", m_cyan: "#26C6DA", m_tram: "#F2994A", m_future: "#B66DFF",
  z_RY: "#E6B800", z_STR: "#0FB5AE", z_HH: "#8B5CF6", gold: "#C9A84C",
  water1: "#12324F", water2: "#1B4A73",
};
const oLabs = Object.values(OTHERS).map(lab);

// deterministic PRNG
let seed = 20260723;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const N = 10;
const Lmin = 62, Lmax = 78; // tighter, bright band so nothing goes pale/muddy

function palToLabs(hues, Ls) {
  return hues.map((h, i) => lab(lchToHex(Ls[i], maxChroma(Ls[i], h), h)));
}
function chromaOf(labc) {
  return Math.hypot(labc[1], labc[2]);
}
function score(hues, Ls) {
  const labs = palToLabs(hues, Ls);
  let minRR = Infinity;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) minRR = Math.min(minRR, deltaE00(labs[i], labs[j]));
  // cross penalty: any road within 12 of another palette color costs.
  let pen = 0;
  for (const rl of labs)
    for (const ol of oLabs) {
      const d = deltaE00(rl, ol);
      if (d < 12) pen += (12 - d) * 0.8;
    }
  // Mild vividness floor: only truly muddy (very low chroma) colors are punished.
  // On dark satellite, light tones read fine — separation matters far more.
  let vivid = 0;
  for (const rl of labs) vivid += Math.min(0, chromaOf(rl) - 38) * 0.15;
  return minRR - pen + vivid;
}

let best = null;
for (let restart = 0; restart < 60; restart++) {
  let hues = Array.from({ length: N }, () => rnd() * 360);
  let Ls = Array.from({ length: N }, () => Lmin + rnd() * (Lmax - Lmin));
  let s = score(hues, Ls);
  let step = 40;
  for (let it = 0; it < 4000; it++) {
    const i = Math.floor(rnd() * N);
    const nh = [...hues], nL = [...Ls];
    if (rnd() < 0.7) nh[i] = (nh[i] + (rnd() - 0.5) * step + 360) % 360;
    else nL[i] = Math.max(Lmin, Math.min(Lmax, nL[i] + (rnd() - 0.5) * step * 0.4));
    const ns = score(nh, nL);
    if (ns > s) { hues = nh; Ls = nL; s = ns; }
    if (it % 500 === 499) step *= 0.7;
  }
  if (!best || s > best.s) best = { s, hues: [...hues], Ls: [...Ls] };
}

// Road order coast->inland; assign optimized colors by sorting hues so the
// legend still sweeps a sensible spectrum.
const ROAD_ORDER = ["szr","ummsuqeim","alkhail","hessa","mbz","expo","hamdan","emirates","alain","lehbab"];
const idx = best.hues.map((h, i) => i).sort((a, b) => best.hues[a] - best.hues[b]);
const assigned = {};
ROAD_ORDER.forEach((k, n) => {
  const i = idx[n];
  assigned[k] = lchToHex(best.Ls[i], maxChroma(best.Ls[i], best.hues[i]), best.hues[i]);
});

console.log(`best score ${best.s.toFixed(1)}`);
console.log("\n=== assigned palette (road: hex) ===");
for (const k of ROAD_ORDER) console.log(`${k.padEnd(10)} ${assigned[k]}`);

const keys = Object.keys(assigned);
const labs = Object.fromEntries(keys.map((k) => [k, lab(assigned[k])]));
let minRR = Infinity, worst = "";
for (let i = 0; i < keys.length; i++)
  for (let j = i + 1; j < keys.length; j++) {
    const d = deltaE00(labs[keys[i]], labs[keys[j]]);
    if (d < minRR) { minRR = d; worst = `${keys[i]} vs ${keys[j]}`; }
  }
console.log(`\nmin road-road ΔE = ${minRR.toFixed(1)} (${worst})`);
console.log("road-road pairs < 22:");
for (let i = 0; i < keys.length; i++)
  for (let j = i + 1; j < keys.length; j++) {
    const d = deltaE00(labs[keys[i]], labs[keys[j]]);
    if (d < 22) console.log(`  ${d.toFixed(1).padStart(5)} ${keys[i]} vs ${keys[j]}`);
  }
console.log("\ncross ΔE < 12:");
let minCross = Infinity;
for (const rk of keys)
  for (const [ok, ov] of Object.entries(OTHERS)) {
    const d = deltaE00(labs[rk], lab(ov));
    minCross = Math.min(minCross, d);
    if (d < 12) console.log(`  ${d.toFixed(1).padStart(5)} ${rk} (${assigned[rk]}) vs ${ok} (${ov})`);
  }
console.log(`min cross ΔE = ${minCross.toFixed(1)}`);
