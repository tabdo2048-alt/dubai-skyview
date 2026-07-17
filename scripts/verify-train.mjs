// Focused T4 check: enable Train, wait for the reveal, then report the actual
// etihad-rail layer visibility, rendered-feature count, and where the path's
// endpoints land on screen — plus a clean coast screenshot. Real Chrome.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), ".output", "shots", "train-probe");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, channel: "chrome", args: ["--start-maximized"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));

await page.goto("http://localhost:8080", { waitUntil: "commit", timeout: 120000 });
await page.waitForFunction(() => !!window.__mapViewSat, null, { timeout: 180000, polling: 1000 }).catch(() => console.log("map handle timeout"));
await page.waitForFunction(() => window.__mapViewSat?.isStyleLoaded?.(), null, { timeout: 90000, polling: 500 }).catch(() => console.log("style timeout"));
await page.waitForTimeout(6000);

// Enable Train via the toolbar button.
try { await page.getByRole("button", { name: /^Train$/i }).click({ timeout: 20000 }); } catch (e) { console.log("train click:", e.message); }
await page.waitForTimeout(6000); // let the draw reveal complete

// Frame the Jebel Ali coast segment (clear of the inland clouds), flat.
await page.evaluate(() => {
  const m = window.__mapViewSat;
  m.jumpTo({ center: [55.13, 24.95], zoom: 11.2, bearing: 0, pitch: 0 });
  m.triggerRepaint();
});
await page.waitForTimeout(4000);

const report = await page.evaluate(() => {
  const m = window.__mapViewSat;
  const out = {};
  for (const suffix of ["reveal", "glow", "guide"]) {
    const id = `metro-etihad-rail-${suffix}`;
    const lyr = m.getLayer(id);
    out[id] = lyr ? (m.getLayoutProperty(id, "visibility") ?? "visible") : "MISSING";
  }
  const feats = m.queryRenderedFeatures({ layers: ["metro-etihad-rail-reveal"] });
  out.renderedRevealFeatures = feats.length;
  const src = m.getSource("metro-etihad-rail");
  out.hasSource = !!src;
  // Project a few path endpoints to screen to confirm they're in-frame.
  const pts = [[55.0903, 25.01523], [55.18694, 24.86844], [54.98259, 24.69856]];
  out.projected = pts.map((p) => { const s = m.project(p); return [Math.round(s.x), Math.round(s.y)]; });
  out.center = m.getCenter();
  return out;
});
console.log("TRAIN REPORT:", JSON.stringify(report, null, 2));

await page.screenshot({ path: join(OUT, "train-coast.png") });
console.log("shot:", join(OUT, "train-coast.png"));
await browser.close();
