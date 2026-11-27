import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanup, createEventDirect, createRun, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

/**
 * Dark Mode and large-text (200%, the iOS accessibility maximum) checks of the main screens. Each screen must:
 * have no serious/critical axe findings (incl. colour contrast), not scroll sideways, and keep its last content
 * clear of the tab bar. Screenshots land in test-results/ and are uploaded as CI artifacts.
 */
let run: Run;
let eventId: string;
test.beforeAll(async () => { run = await createRun(); eventId = await createEventDirect(run, "Sunday sunrise ride"); });
test.afterAll(async () => { await cleanup(run); });

const SCREENS = ["", "/events", "/events/EVENT", "/calendar", "/calendar?view=agenda", "/directory", "/races", "/me", "/me/profile", "/settings", "/admin", "/admin/events/new", "/admin/insights", "/admin/invites"];

async function check(page: Page, path: string, label: string, shot: string) {
  await page.goto(`/${run.slug}${path.replace("EVENT", eventId)}`);
  await page.waitForLoadState("networkidle");
  if (label === "200%") { await page.addStyleTag({ content: "html { font-size: 200% !important; }" }); await page.waitForTimeout(150); }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} ${path}: horizontal overflow`).toBeLessThanOrEqual(1);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${label} ${path}`).toEqual([]);
  // Labels must never be crushed into a sliver by their neighbours (the 200% failure mode: one letter per line).
  const crushed = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".row-main, .row-title, .field-label, .btn, .badge")].filter((el) => {
    if (el.offsetParent === null) return false;
    const text = el.textContent!.trim();
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    const lines = Math.round(el.getBoundingClientRect().height / lh);
    return text.length >= 5 && lines >= 3 && text.length / lines < 3; // a handful of characters per line = crushed
  }).map((el) => el.textContent!.trim().slice(0, 30)));
  expect(crushed, `${label} ${path}: crushed labels`).toEqual([]);
  // The last piece of content must be reachable above the tab bar (bottom navigation never hides it).
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const clear = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".tabbar");
    if (!bar || getComputedStyle(bar).display === "none") return true;
    const main = document.querySelector("main");
    const last = main?.querySelector<HTMLElement>(":scope > div > :last-child") ?? main;
    return !last || last.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + 1;
  });
  expect(clear, `${label} ${path}: content hidden behind the tab bar`).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath(`${shot}-${path.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`) });
}

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  test("main screens are accessible, readable and un-clipped in Dark Mode", async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, run.adminEmail);
    for (const s of SCREENS) await check(page, s, "dark", "dark");
    await page.goto("/login");
    expect((await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("large text (200%)", () => {
  test("main screens survive the largest text size without clipping or overlap", async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, run.adminEmail);
    for (const s of SCREENS) await check(page, s, "200%", "large");
    // Essential content is not truncated: the tab labels and page title are fully visible text, not clipped by overflow.
    await page.goto(`/${run.slug}`);
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const label of ["Home", "Events", "Directory", "Calendar", "Me"]) await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
    const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("h1, h2, .row-title, .btn")].filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible").map((el) => el.textContent?.trim().slice(0, 40)));
    expect(clipped, "elements with clipped text").toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

/** The public front door: sign-in, link confirmation, invitation. Same bar as the app: light, dark and 200% text. */
const PUBLIC = ["/login", "/login?error=link", "/login/verify?token=not-a-real-token", "/invite/not-a-real-token"];
for (const scheme of ["light", "dark"] as const) {
  test.describe(`public pages, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const large of [false, true]) {
      test(`accessible and un-clipped${large ? " at 200% text" : ""}`, async ({ page }) => {
        const errors = watchErrors(page);
        for (const path of PUBLIC) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          if (large) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, `${scheme}${large ? " 200%" : ""} ${path}: horizontal overflow`).toBeLessThanOrEqual(1);
          const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
          expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), `${scheme} ${path}`).toEqual([]);
          const crushed = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("h1, h2, h3, .btn, .b-eyebrow, label")].filter((el) => {
            if (el.offsetParent === null) return false;
            const text = el.textContent!.trim();
            const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
            const lines = Math.round(el.getBoundingClientRect().height / lh);
            return text.length >= 5 && lines >= 3 && text.length / lines < 3;
          }).map((el) => el.textContent!.trim().slice(0, 30)));
          expect(crushed, `${scheme} ${path}: crushed text`).toEqual([]);
          await page.screenshot({ path: test.info().outputPath(`public-${scheme}${large ? "-large" : ""}-${path.replace(/[^a-z0-9]+/gi, "_")}.png`) });
        }
        expect(errors, errors.join("\n")).toEqual([]);
      });
    }
  });
}
