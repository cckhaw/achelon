// Renders scripts/assets/icon.svg to the PNG icons the PWA needs (uses the preinstalled Chromium via Playwright).
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("scripts/assets/icon.svg", "utf8");
const browser = await chromium.launch();
async function render(size, out, { padded = false } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const inner = padded ? `<div style="position:absolute;inset:${size * 0.1}px">${svg.replace("<svg ", `<svg width="${size * 0.8}" height="${size * 0.8}" `)}</div>` : svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<body style="margin:0;background:${padded ? "#ffd60a" : "transparent"};width:${size}px;height:${size}px;position:relative;overflow:hidden">${inner}</body>`);
  writeFileSync(out, await page.screenshot({ omitBackground: !padded, type: "png" }));
  await page.close();
}
await render(180, "public/apple-touch-icon.png", { padded: true });
await render(192, "public/icon-192.png");
await render(512, "public/icon-512.png");
await render(512, "public/icon-maskable-512.png", { padded: true });
await browser.close();
console.log("icons written");
