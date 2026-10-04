// Renders docs/thesis/diagrams/*.svg to PNG (2x) so they can be pasted into Word.
//   pnpm --filter @collab/e2e exec node tools/render-diagrams.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const dir = path.resolve(import.meta.dirname, "../../docs/thesis/diagrams");
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
for (const file of readdirSync(dir).filter((name) => name.endsWith(".svg"))) {
  const svg = readFileSync(path.join(dir, file), "utf8");
  const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 2 });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: path.join(dir, file.replace(/\.svg$/, ".png")) });
  await page.close();
  console.log("rendered", file);
}
await browser.close();
