// One-off palette audit: pairwise CIEDE2000 among the signature road colors,
// and each road vs the metro/zone/gold-accent palettes it must not collide with.
// Run: node scripts/auditRoadColors.mjs   (delete after — analysis only)

const ROADS = {
  szr: "#4F46E5", ummsuqeim: "#EAB308", alkhail: "#8B5CF6", hessa: "#06B6D4",
  mbz: "#2563EB", expo: "#EC4899", hamdan: "#16A34A", emirates: "#F97316",
  alain: "#DC2626", lehbab: "#14B8A6",
};

// Other palettes on the same map (roads must stay distinct from these too).
const METRO = {
  m_red: "#E63946", m_green: "#2ECC71", m_blue: "#2D9CDB", m_yellow: "#F2C94C",
  m_pink: "#D85B8C", m_cyan: "#26C6DA", m_tram: "#F2994A", m_future: "#B66DFF",
};
const ZONE = { z_RY: "#E6B800", z_STR: "#0FB5AE", z_HH: "#8B5CF6" };
const UI = { gold: "#C9A84C" };
// Rough basemap water blues (satellite sea + 3D standard water).
const WATER = { water1: "#12324f", water2: "#1b4a73" };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToXyz([r, g, b]) {
  let [R, G, B] = [r, g, b].map((v) => {
    v /= 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  });
  R *= 100; G *= 100; B *= 100;
  return [
    R * 0.4124 + G * 0.3576 + B * 0.1805,
    R * 0.2126 + G * 0.7152 + B * 0.0722,
    R * 0.0193 + G * 0.1192 + B * 0.9505,
  ];
}
function xyzToLab([x, y, z]) {
  const ref = [95.047, 100.0, 108.883];
  let [X, Y, Z] = [x / ref[0], y / ref[1], z / ref[2]];
  [X, Y, Z] = [X, Y, Z].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const lab = (hex) => xyzToLab(rgbToXyz(hexToRgb(hex)));

// CIEDE2000
function deltaE00(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const avgLp = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI + (Math.atan2(b1, a1p) < 0 ? 360 : 0);
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI + (Math.atan2(b2, a2p) < 0 ? 360 : 0);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  let avghp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) avghp += h1p + h2p < 360 ? 360 : -360;
    avghp /= 2;
  }
  const T = 1 - 0.17 * Math.cos(((avghp - 30) * Math.PI) / 180)
    + 0.24 * Math.cos((2 * avghp * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * avghp + 6) * Math.PI) / 180)
    - 0.20 * Math.cos(((4 * avghp - 63) * Math.PI) / 180);
  const dRo = 30 * Math.exp(-(((avghp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2);
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin((2 * dRo * Math.PI) / 180) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

const labs = {};
for (const [k, v] of Object.entries({ ...ROADS })) labs[k] = lab(v);

// Road-vs-road pairs
const roadKeys = Object.keys(ROADS);
const pairs = [];
for (let i = 0; i < roadKeys.length; i++)
  for (let j = i + 1; j < roadKeys.length; j++) {
    const a = roadKeys[i], b = roadKeys[j];
    pairs.push({ a, b, de: deltaE00(labs[a], labs[b]) });
  }
pairs.sort((x, y) => x.de - y.de);
console.log("=== ROAD vs ROAD (CIEDE2000), ascending ===");
for (const p of pairs) console.log(`${p.de.toFixed(1).padStart(5)}  ${p.a} (${ROADS[p.a]})  vs  ${p.b} (${ROADS[p.b]})${p.de < 20 ? "  <-- TOO CLOSE" : ""}`);

// Road-vs-other-palette collisions
const others = { ...METRO, ...ZONE, ...UI, ...WATER };
const otherLabs = {};
for (const [k, v] of Object.entries(others)) otherLabs[k] = lab(v);
const cross = [];
for (const rk of roadKeys)
  for (const [ok, ov] of Object.entries(others)) {
    const de = deltaE00(labs[rk], otherLabs[ok]);
    if (de < 15) cross.push({ rk, ok, ov, de });
  }
cross.sort((x, y) => x.de - y.de);
console.log("\n=== ROAD vs OTHER PALETTES, ΔE<15 (potential confusion) ===");
for (const c of cross) console.log(`${c.de.toFixed(1).padStart(5)}  ${c.rk} (${ROADS[c.rk]})  vs  ${c.ok} (${c.ov})`);
console.log(`\nmin road-road ΔE = ${pairs[0].de.toFixed(1)}`);
