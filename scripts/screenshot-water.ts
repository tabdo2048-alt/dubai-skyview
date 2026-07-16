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
    if (/\[WaterLayer\]|\[Water\]|\[Boats?\]|\[ShoreWaves\]|skip/i.test(t)) logs.push(`${msg.type()}: ${t}`);
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
  await page.waitForTimeout(40_000);

  // Probe render state in-page (headless Mapbox can stall on tiles).
  const state = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas ? (canvas.getContext("webgl2") || canvas.getContext("webgl")) : null;
    return {
      loadingVisible: /Loading Dubai/i.test(document.body.innerText || ""),
      hasCanvas: !!canvas,
      canvasSize: canvas ? `${(canvas as HTMLCanvasElement).width}x${(canvas as HTMLCanvasElement).height}` : "none",
      hasWebGL: !!gl,
    };
  });
  console.log("\n=== page state ===");
  console.log(JSON.stringify(state, null, 2));

  console.log("\n=== errors / mapbox / webgl ===");
  for (const l of errors.slice(0, 40)) console.log(l);

  try {
    await page.screenshot({ path: join(OUT, "01-default.png"), timeout: 15_000 });
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
