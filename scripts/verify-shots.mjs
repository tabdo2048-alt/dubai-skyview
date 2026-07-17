// Flexible Playwright verification harness for the Dubai SkyView map.
// Drives the live dev app, switches map mode, optionally enables the water-mask
// debug outlines / Train toggle, flies to named viewpoints at bearing0/pitch0,
// and screenshots each. Prints a console summary (triangulation guard errors,
// boat/vessel lines, mapbox/webgl errors).
//
// Usage:
//   node scripts/verify-shots.mjs --url http://localhost:8080 --mode satellite \
//        --mask on --out .output/shots/sat --views full,palm,marina,creek,canal,jebelali
//
// Flags: --mode satellite|3d  --mask on|off  --train on|off  --views a,b,c
//        --out <dir>  --url <url>  --settle <ms>

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const APP_URL = arg("url", "http://localhost:8080");
const MODE = arg("mode", "satellite"); // satellite | 3d
const MASK = arg("mask", "off") === "on";
const TRAIN = arg("train", "off") === "on";
const SETTLE = parseInt(arg("settle", "2600"), 10);
const OUT = arg("out", join(process.cwd(), ".output", "shots", MODE));
const VIEWS = arg("views", "full,palm,marina,creek,canal,jebelali").split(",");

// Named viewpoints — flat (bearing 0, pitch 0) so no camera angle masks a data bug.
const VIEWPOINTS = {
  full: { center: [55.22, 25.15], zoom: 9.5 },
  palm: { center: [55.138, 25.102], zoom: 12.3 },
  marina: { center: [55.142, 25.078], zoom: 13.0 },
  creek: { center: [55.315, 25.235], zoom: 12.6 },
  canal: { center: [55.262, 25.19], zoom: 13.0 },
  jebelali: { center: [55.05, 24.98], zoom: 11.2 },
  industrial: { center: [55.13, 24.9], zoom: 11.5 },
  corner_nw: { center: [54.92, 25.52], zoom: 9.6 },
  corner_ne: { center: [55.62, 25.52], zoom: 9.6 },
  corner_sw: { center: [54.92, 24.82], zoom: 9.6 },
  corner_se: { center: [55.62, 24.82], zoom: 9.6 },
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const logs = [];
  const errors = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/\[WaterLayer\]|\[Water\]|\[Boats?\]|\[ShoreWaves\]|\[Metro\]|vessel|skip|triangulat/i.test(t))
      logs.push(`${msg.type()}: ${t}`);
    if (msg.type() === "error" || /mapbox|token|webgl|failed|error/i.test(t))
      errors.push(`${msg.type()}: ${t}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.addInitScript(() => {
    try {
      localStorage.setItem("dubai:water-debug", "1");
    } catch {}
  });

  // Block external font/CDN hosts that can hang headless page loads; the map
  // (mapbox tiles) is what we need, not webfonts.
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).host;
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(host)) return route.abort();
    return route.continue();
  });

  console.log(`Loading ${APP_URL} (mode=${MODE}, mask=${MASK}, train=${TRAIN}) …`);
  await page.goto(APP_URL, { waitUntil: "commit", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Switch mode if needed by clicking the toolbar button.
  if (MODE === "3d") {
    try {
      await page.getByRole("button", { name: /3D View/i }).click({ timeout: 15_000 });
    } catch (e) {
      console.log("could not click 3D View button:", e.message);
    }
  }
  if (TRAIN) {
    try {
      await page.getByRole("button", { name: /Train/i }).click({ timeout: 15_000 });
    } catch (e) {
      console.log("could not click Train button:", e.message);
    }
  }

  // Wait for the map handle to exist (Vite dev cold-compile of the huge module
  // graph — 1.5MB generated geometry + three.js + mapbox — can take a while on
  // the first load of a fresh dev server), then for the style to finish loading.
  const mapVar = MODE === "3d" ? "__mapView3d" : "__mapViewSat";
  await page
    .waitForFunction((v) => !!window[v], mapVar, { timeout: 180_000, polling: 1000 })
    .catch(() => console.log("map-handle wait timed out"));
  await page
    .waitForFunction(
      (v) => !!window[v] && window[v].isStyleLoaded && window[v].isStyleLoaded(),
      mapVar,
      { timeout: 60_000, polling: 500 },
    )
    .catch(() => console.log("style-load wait timed out"));
  // Let the deferred heavy layers (water mesh per basin) build + first frames render.
  await page.waitForTimeout(12000);

  // Enable the water-mask debug outlines (cyan outer rings, red holes, green mesh).
  if (MASK) {
    await page.evaluate(() => window.__setWaterMaskDebug && window.__setWaterMaskDebug(true));
  }

  // Hide the "Loading Dubai" overlay (idle may not fire headless).
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("div"))) {
      const t = (el.textContent || "").trim();
      if (/^Loading Dubai/i.test(t) && el.children.length < 4) {
        el.style.display = "none";
        let p = el.parentElement;
        for (let i = 0; i < 4 && p; i++) {
          const cs = getComputedStyle(p);
          if (cs.position === "fixed" || cs.position === "absolute") p.style.opacity = "0";
          p = p.parentElement;
        }
      }
    }
  });

  for (const name of VIEWS) {
    const vp = VIEWPOINTS[name];
    if (!vp) {
      console.log(`unknown view: ${name}`);
      continue;
    }
    await page.evaluate(
      ({ v, mapVar }) => {
        const m = window[mapVar];
        if (!m) return;
        m.jumpTo({ center: v.center, zoom: v.zoom, bearing: 0, pitch: 0 });
        m.triggerRepaint();
      },
      { v: vp, mapVar },
    );
    await page.waitForTimeout(SETTLE);
    const file = join(OUT, `${MODE}-${MASK ? "mask-" : ""}${name}.png`);
    try {
      await page.screenshot({ path: file, timeout: 30_000, animations: "disabled", caret: "hide" });
      console.log(`shot: ${file}`);
    } catch (e) {
      console.log(`screenshot ${name} failed: ${e.message}`);
    }
  }

  const guardErrors = logs.filter((l) => /0 triangles|short of the expected/i.test(l));
  console.log("\n=== SUMMARY ===");
  console.log(`mode=${MODE} mask=${MASK} train=${TRAIN}`);
  console.log(`triangulation-guard errors: ${guardErrors.length}`);
  for (const l of guardErrors) console.log("  " + l);
  console.log("\n-- water/boat/metro console lines (first 40) --");
  for (const l of logs.slice(0, 40)) console.log("  " + l);
  console.log("\n-- errors/mapbox/webgl (first 25) --");
  for (const l of errors.slice(0, 25)) console.log("  " + l);
  console.log(`\nshots in: ${OUT}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
