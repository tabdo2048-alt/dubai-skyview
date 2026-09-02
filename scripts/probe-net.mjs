import { chromium } from "playwright";

const APP_URL = process.argv[2] ?? "http://localhost:8080";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const responses = [];
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => consoleLines.push(`PAGEERROR: ${e.message.slice(0, 200)}`));
page.on("response", (r) => {
  const u = r.url().replace(/access_token=[^&]+/, "tok").replace("http://localhost:8080", "");
  if (!/\.(png|jpg|css|woff2?|svg|ico)(\?|$)/.test(u)) responses.push(`${r.status()} ${r.request().method()} ${u.slice(0, 110)}`);
});

await page.goto(APP_URL, { waitUntil: "commit", timeout: 60_000 });
await page.waitForTimeout(20000);

// Try to read the react-query cache / config directly by calling the server fn from the page.
const cfgProbe = await page.evaluate(async () => {
  try {
    const res = await fetch("/_serverFn/src_lib_config_functions_ts--getMapConfig", { method: "GET" });
    return { tried: true, status: res.status };
  } catch (e) {
    return { tried: true, err: String(e).slice(0, 120) };
  }
});

console.log("=== NON-ASSET RESPONSES ===");
for (const r of responses.slice(0, 50)) console.log(r);
console.log("\ncfgProbe:", JSON.stringify(cfgProbe));
console.log("\n=== CONSOLE (first 80) ===");
for (const l of consoleLines.slice(0, 80)) console.log(l);

await browser.close();
