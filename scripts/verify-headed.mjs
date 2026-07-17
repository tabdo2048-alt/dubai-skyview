// Headed real-Chrome verification: launches the installed Chrome (channel:chrome,
// headless:false) so Mapbox satellite tiles + WebGL actually load (headless
// Mapbox stalls on the loading overlay). Switches mode, enables the water mask,
// flies to named basins at bearing0/pitch0, screenshots each, prints console
// water/triangulation/boat summary.
//
// Usage: node scripts/verify-headed.mjs --mode satellite --mask on --views full,palm,marina,creek,canal,jebelali --out .output/shots/headed-sat
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const APP_URL = arg("url", "http://localhost:8080");
const MODE = arg("mode", "satellite");
const MASK = arg("mask", "off") === "on";
const TRAIN = arg("train", "off") === "on";
const SETTLE = parseInt(arg("settle", "3000"), 10);
const OUT = arg("out", join(process.cwd(), ".output", "shots", "headed"));
const VIEWS = arg("views", "full,palm,marina,creek,canal,jebelali").split(",");

const VIEWPOINTS = {
  full: { center: [55.22, 25.15], zoom: 9.5 },
  palm: { center: [55.138, 25.102], zoom: 12.3 },
  marina: { center: [55.142, 25.078], zoom: 13.0 },
  creek: { center: [55.315, 25.235], zoom: 12.6 },
  canal: { center: [55.262, 25.19], zoom: 13.0 },
  jebelali: { center: [55.05, 24.98], zoom: 11.2 },
  industrial: { center: [55.13, 24.86], zoom: 11.0 },
  corner_nw: { center: [54.92, 25.52], zoom: 9.6 },
  corner_ne: { center: [55.62, 25.52], zoom: 9.6 },
  corner_sw: { center: [54.92, 24.82], zoom: 9.6 },
  corner_se: { center: [55.62, 24.82], zoom: 9.6 },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false, channel: "chrome", args: ["--start-maximized"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const logs = [], errors = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/\[WaterLayer\]|\[Water\]|\[Boats?\]|\[ShoreWaves\]|\[Metro\]|vessel|triangulat|short of/i.test(t)) logs.push(`${m.type()}: ${t}`);
    if (m.type() === "error") errors.push(t);
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.addInitScript(() => { try { localStorage.setItem("dubai:water-debug", "1"); } catch {} });

  console.log(`Loading ${APP_URL} mode=${MODE} mask=${MASK} train=${TRAIN}`);
  await page.goto(APP_URL, { waitUntil: "commit", timeout: 120000 });
  await page.waitForTimeout(2000);
  if (MODE === "3d") { try { await page.getByRole("button", { name: /3D View/i }).click({ timeout: 20000 }); } catch (e) { console.log("3D click fail", e.message); } }
  if (TRAIN) { try { await page.getByRole("button", { name: /Train/i }).click({ timeout: 20000 }); } catch (e) { console.log("Train click fail", e.message); } }

  const mapVar = MODE === "3d" ? "__mapView3d" : "__mapViewSat";
  await page.waitForFunction((v) => !!window[v], mapVar, { timeout: 180000, polling: 1000 }).catch(() => console.log("map-handle timeout"));
  await page.waitForFunction((v) => window[v]?.isStyleLoaded?.(), mapVar, { timeout: 90000, polling: 500 }).catch(() => console.log("style-load timeout"));
  await page.waitForTimeout(9000);
  if (MASK) await page.evaluate(() => window.__setWaterMaskDebug && window.__setWaterMaskDebug(true));
  await page.waitForTimeout(1500);

  for (const name of VIEWS) {
    const vp = VIEWPOINTS[name];
    if (!vp) { console.log("unknown view", name); continue; }
    await page.evaluate(({ v, mapVar }) => {
      const m = window[mapVar]; if (!m) return;
      m.jumpTo({ center: v.center, zoom: v.zoom, bearing: 0, pitch: 0 });
      m.triggerRepaint();
    }, { v: vp, mapVar });
    await page.waitForTimeout(SETTLE);
    const file = join(OUT, `${MODE}-${MASK ? "mask-" : ""}${name}.png`);
    try { await page.screenshot({ path: file, timeout: 30000 }); console.log("shot:", file); } catch (e) { console.log("shot fail", name, e.message); }
  }

  const guard = logs.filter((l) => /0 triangles|short of the expected/i.test(l));
  console.log("\n=== SUMMARY mode=" + MODE + " ===");
  console.log("triangulation-guard errors:", guard.length);
  for (const l of guard) console.log("  " + l);
  console.log("boat/vessel lines:", logs.filter((l) => /boat|vessel/i.test(l)).length);
  console.log("-- water/metro logs --"); for (const l of logs.slice(0, 30)) console.log("  " + l);
  console.log("-- page errors --"); for (const e of errors.slice(0, 15)) console.log("  " + e);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
