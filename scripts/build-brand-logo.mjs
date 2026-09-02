// Build the KEYORA brand PNGs from the supplied logo artwork.
//
// The source file is a JPEG, so it has NO alpha channel — the transparency
// checkerboard is baked into the pixels as real light-gray/white squares, with a
// wide dead margin around the badge. Using it directly would show a gray
// checkerboard anywhere CSS can't clip it (most visibly the browser-tab favicon).
//
// This script finds the badge inside that margin, crops to it, and re-applies
// genuine rounded-corner transparency, writing:
//   public/brand/keyora-logo.png       512x512  (navbar, og:image)
//   public/brand/keyora-logo-180.png   apple-touch-icon
//   public/brand/keyora-logo-32.png    favicon
//
// Canvas work runs inside Chromium (playwright is already a devDependency, so no
// new image library). Re-run it if the artwork is ever replaced.
//
// Usage:
//   node scripts/build-brand-logo.mjs
//   node scripts/build-brand-logo.mjs --in path/to/logo.jpeg --out public/brand
//   node scripts/build-brand-logo.mjs --crop 155,140,715,740   # override detection

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const IN = arg("in", "C:/Users/ashraf/Downloads/WhatsApp Image 2026-08-14 at 2.10.20 PM.jpeg");
const OUT = arg("out", join(process.cwd(), "public", "brand"));
const CROP = arg("crop", null); // "x,y,w,h"
const SIZES = [512, 180, 32];
// The badge's own corner radius, as a fraction of its width. Matches rx=96 on the
// 456-wide box in the outgoing project-logo.svg.
const RADIUS_RATIO = 0.2;

const mime = basename(IN).toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const dataUrl = `data:${mime};base64,${readFileSync(IN).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><meta charset=utf-8><body></body>");

const result = await page.evaluate(
  async ({ dataUrl, sizes, radiusRatio, cropOverride }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const src = document.createElement("canvas");
    src.width = img.naturalWidth;
    src.height = img.naturalHeight;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0);
    const { data, width: W, height: H } = sctx.getImageData(0, 0, src.width, src.height);

    // A pixel is badge content if it is dark (the near-black face) or saturated
    // (the gold). The checkerboard is light AND neutral, so it fails both.
    const isContent = (i) => {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b);
      const spread = max - Math.min(r, g, b);
      return max < 200 || spread > 18;
    };

    // Row/column content profiles. A simple min/max bbox would be dragged out of
    // square by the artwork's soft drop shadow, so keep only rows and columns that
    // are mostly badge — the shadow never reaches half the badge's width.
    const rows = new Array(H).fill(0);
    const cols = new Array(W).fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!isContent((y * W + x) * 4)) continue;
        rows[y]++;
        cols[x]++;
      }
    }
    const span = (profile) => {
      const peak = Math.max(...profile);
      if (peak === 0) return null;
      const cut = peak * 0.5;
      let lo = 0;
      let hi = profile.length - 1;
      while (lo < profile.length && profile[lo] < cut) lo++;
      while (hi >= 0 && profile[hi] < cut) hi--;
      return hi >= lo ? { lo, hi } : null;
    };

    let bbox;
    let radius = radiusRatio; // fraction of the side; refined below when detected
    if (cropOverride) {
      const [x, y, w, h] = cropOverride.split(",").map(Number);
      bbox = { x, y, w, h, detected: false };
    } else {
      const xs = span(cols);
      const ys = span(rows);
      if (!xs || !ys) throw new Error("no badge pixels found — pass --crop x,y,w,h");
      // Square it off around the detected centre so the badge is never stretched.
      const side = Math.round(((xs.hi - xs.lo + 1) + (ys.hi - ys.lo + 1)) / 2);
      const cx = (xs.lo + xs.hi) / 2;
      const cy = (ys.lo + ys.hi) / 2;
      bbox = {
        x: Math.max(0, Math.round(cx - side / 2)),
        y: Math.max(0, Math.round(cy - side / 2)),
        w: side,
        h: side,
        detected: true,
        raw: { x: [xs.lo, xs.hi], y: [ys.lo, ys.hi] },
      };

      // Measure the badge's ACTUAL corner radius instead of guessing it: a few
      // rows below the top edge the badge is still narrower than its full width
      // by twice the corner inset, which gives the radius directly.
      const probeY = Math.min(H - 1, ys.lo + 3);
      let left = xs.lo;
      let right = xs.hi;
      while (left <= right && !isContent((probeY * W + left) * 4)) left++;
      while (right >= left && !isContent((probeY * W + right) * 4)) right--;
      const inset = Math.max(0, ((xs.hi - xs.lo + 1) - (right - left + 1)) / 2);
      const measured = inset / side;
      // Sanity-clamp: a rounded-square icon sits between a light round and a
      // circle. Outside that range trust the caller's ratio.
      radius = measured > 0.08 && measured < 0.45 ? measured : radiusRatio;
    }

    const pngs = {};
    for (const size of sizes) {
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      // Clip to the badge's own rounded square FIRST so the corners stay
      // transparent instead of inheriting checkerboard from the crop. The 1%
      // inset trims the JPEG ringing that haloes the gold border.
      const pad = size * 0.01;
      ctx.beginPath();
      ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, size * radius);
      ctx.clip();
      ctx.drawImage(src, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, size, size);

      // Belt and braces: anything still light AND neutral is leftover
      // checkerboard, never part of the mark (the badge is near-black, the K is
      // saturated gold). Punch it out.
      const px = ctx.getImageData(0, 0, size, size);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const max = Math.max(d[i], d[i + 1], d[i + 2]);
        const spread = max - Math.min(d[i], d[i + 1], d[i + 2]);
        if (max >= 200 && spread <= 18) d[i + 3] = 0;
      }
      ctx.putImageData(px, 0, 0);

      pngs[size] = out.toDataURL("image/png");
    }
    return { bbox, radius, source: { W, H }, pngs };
  },
  { dataUrl, sizes: SIZES, radiusRatio: RADIUS_RATIO, cropOverride: CROP },
);

await browser.close();

mkdirSync(OUT, { recursive: true });
const written = [];
for (const size of SIZES) {
  const name = size === 512 ? "keyora-logo.png" : `keyora-logo-${size}.png`;
  const buf = Buffer.from(result.pngs[size].split(",")[1], "base64");
  const path = join(OUT, name);
  writeFileSync(path, buf);
  written.push(`${name.padEnd(22)} ${size}x${size}  ${buf.length} bytes`);
}

const b = result.bbox;
console.log(`source     ${result.source.W}x${result.source.H}  ${IN}`);
console.log(
  `badge bbox ${b.x},${b.y} ${b.w}x${b.h}  (${b.detected ? "auto-detected" : "from --crop"})` +
    (b.raw ? `  x=${b.raw.x.join("..")} y=${b.raw.y.join("..")}` : ""),
);
console.log(`corner r   ${(result.radius * 100).toFixed(1)}% of side`);
console.log(`coverage   ${((b.w / result.source.W) * 100).toFixed(1)}% of source width`);
console.log(`out        ${OUT}`);
for (const line of written) console.log(`  ${line}`);
