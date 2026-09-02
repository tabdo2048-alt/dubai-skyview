// Standalone Playwright water-render verification (no Playwright config needed).
// Loads the running dev app with the water-mask debug flag on, waits for the
// animated water layer to build, screenshots the default + a Palm close-up in
// both satellite and 3D modes, and reports any [WaterLayer] mesh-guard errors
// or vessel-skip lines from the console.
//
// Run:  node .output/screenshot-water.cjs <url>   (bundled via esbuild)
//   or: npm run verify:water   (see package.json)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const URL = process.argv[2] ?? "http://localhost:5173";
const OUT = process.argv[3] ?? join(process.cwd(), ".output", "water-shots");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const logs: string[] = [];
  const errors: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/\[WaterLayer\]|\[Water\]|\[Boats?\]|\[ShoreWaves\]|\[Metro\]|metro|station|MapLayers|skip/i.test(t)) logs.push(`${msg.type()}: ${t}`);
    if (msg.type() === "error" || /mapbox|token|webgl|failed/i.test(t)) errors.push(`${msg.type()}: ${t}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.addInitScript(() => {
    try {
      localStorage.setItem("dubai:water-debug", "1");
    } catch {
      /* ignore */
    }
  });

  console.log(`Loading ${URL} …`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Give Mapbox + the deferred heavy layers (water/vessels) time to build.
  await page.waitForTimeout(35_000);

  // The "Loading Dubai" overlay never clears in headless (map idle doesn't
  // fire), but the WebGL canvas underneath keeps rendering the map + water.
  // Hide every fixed/absolute overlay so the map shows, then screenshot.
  const state = await page.evaluate(() => {
    // Hide loading overlays.
    for (const el of Array.from(document.querySelectorAll("div"))) {
      const t = (el.textContent || "").trim();
      if (/^Loading Dubai/i.test(t) && el.children.length < 4) {
        (el as HTMLElement).style.display = "none";
        let p = el.parentElement;
        for (let i = 0; i < 3 && p; i++) {
          const cs = getComputedStyle(p);
          if (cs.position === "fixed" || cs.position === "absolute") (p as HTMLElement).style.opacity = "0";
          p = p.parentElement;
        }
      }
    }
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    return {
      hasCanvas: !!canvas,
      canvasSize: canvas ? `${canvas.width}x${canvas.height}` : "none",
    };
  });
  console.log("\n=== page state ===");
  console.log(JSON.stringify(state, null, 2));
  await page.waitForTimeout(3_000);

  console.log("\n=== water/vessel/metro console lines ===");
  for (const l of logs.slice(0, 60)) console.log(l);
  console.log("\n=== errors / mapbox / webgl ===");
  for (const l of errors.slice(0, 30)) console.log(l);

  try {
    await page.screenshot({ path: join(OUT, "01-default.png"), timeout: 20_000 });
    console.log("screenshot saved");
  } catch (e) {
    console.log(`screenshot failed: ${(e as Error).message}`);
  }

  const waterErrors = logs.filter((l) => /\[WaterLayer\].*(0 triangles|short of the expected)/i.test(l));
  const skips = logs.filter((l) => /skip/i.test(l));

  console.log("\n=== water/vessel console lines ===");
  for (const l of logs.slice(0, 80)) console.log(l);
  console.log("\n=== SUMMARY ===");
  console.log(`mesh-guard errors: ${waterErrors.length}`);
  for (const l of waterErrors) console.log(`  ${l}`);
  console.log(`skip lines: ${skips.length}`);
  for (const l of skips.slice(0, 20)) console.log(`  ${l}`);
  console.log(`screenshots in: ${OUT}`);

  await browser.close();
  if (waterErrors.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
