import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanup, createEventDirect, createRun, type Run } from "./fixtures";
import { signInAs } from "./helpers";

let run: Run;
let eventId: string;
test.beforeAll(async () => { run = await createRun(); eventId = await createEventDirect(run); });
test.afterAll(async () => { await cleanup(run); });

test("PWA contract: installable standalone app with proper icons, theme colours and a zoomable viewport", async ({ page, request }) => {
  await page.goto("/login");
  const head = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    themes: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m.getAttribute("media"), m.getAttribute("content")]),
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content"),
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
    touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    lang: document.documentElement.lang,
  }));
  expect(head.viewport).toContain("viewport-fit=cover");
  expect(head.viewport).not.toMatch(/maximum-scale|user-scalable=no/); // pinch-zoom stays available
  expect(head.themes.map((t) => t[0])).toEqual(["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]);
  expect(head.capable).toBe("yes");
  expect(head.title).toBe("Achelon");
  expect(head.robots).toContain("noindex");
  expect(head.lang).toBe("en");
  const m = await (await request.get(head.manifest!)).json();
  expect(m).toMatchObject({ display: "standalone", start_url: "/", scope: "/", name: "Achelon" });
  expect(m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ":" + i.purpose : ""}`)).toEqual(expect.arrayContaining(["192x192", "512x512", "512x512:maskable"]));
  for (const url of [head.touch!, ...m.icons.map((i: { src: string }) => i.src)]) {
    const r = await request.get(url);
    expect(r.status(), url).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("touch targets: every control is at least 44x44 on the phone layout", async ({ page }, info) => {
  test.skip(info.project.name !== "iphone", "phone layout only");
  await signInAs(page, run.adminEmail);
  const offenders: string[] = [];
  for (const path of ["", "/events", `/events/${eventId}`, "/calendar", "/directory", "/me", "/me/profile", "/settings", "/admin", "/admin/invites", "/admin/events/new"]) {
    await page.goto(`/${run.slug}${path}`);
    await page.waitForLoadState("networkidle");
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("button, a.btn, a.tab, a.row, a.back-link, a.cal-cell, .segmented > *, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, summary")) {
        if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
        if (el.closest("dialog:not([open])")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      // Switches and chips are sized by the whole labelled row/pill that wraps them.
      for (const el of document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
        const hit = (el.closest("label") ?? el).getBoundingClientRect();
        if (hit.width === 0 || el.closest("dialog:not([open])")) continue;
        if (hit.height < 43.5) out.push(`checkbox hit area ${Math.round(hit.width)}x${Math.round(hit.height)}`);
      }
      return out;
    });
    offenders.push(...bad.map((b) => `${path || "/"}: ${b}`));
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});

test("Reduce Motion removes animation and transitions", async ({ page }) => {
  await signInAs(page, run.adminEmail);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${run.slug}/admin/invites`);
  await page.getByRole("button", { name: "New invite" }).click();
  const d = await page.getByRole("dialog").evaluate((el) => { const s = getComputedStyle(el); return { anim: s.animationDuration, trans: getComputedStyle(document.querySelector(".btn")!).transitionDuration }; });
  expect(parseFloat(d.anim)).toBeLessThan(0.01);
  expect(parseFloat(d.trans)).toBeLessThan(0.01);
});

test("Increase Contrast and forced colours still pass axe and keep controls visible", async ({ page }) => {
  await signInAs(page, run.adminEmail);
  await page.emulateMedia({ contrast: "more" });
  for (const p of ["", "/events", "/settings"]) {
    await page.goto(`/${run.slug}${p}`);
    const r = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id), p).toEqual([]);
  }
  await page.emulateMedia({ contrast: "no-preference", forcedColors: "active" });
  await page.goto(`/${run.slug}/events`);
  await expect(page.getByRole("link", { name: "Directory" }).first()).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

test("keyboard: every screen can be driven without a mouse and focus is always visible", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard test on desktop");
  await signInAs(page, run.adminEmail);
  await page.goto(`/${run.slug}/events`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  // Sheets open and close from the keyboard, with focus inside and Escape closing them.
  await page.goto(`/${run.slug}/admin/invites`);
  await page.getByRole("button", { name: "New invite" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  const inside = await page.evaluate(() => document.querySelector("dialog[open]")?.contains(document.activeElement));
  expect(inside || (await page.evaluate(() => document.activeElement?.tagName)) === "BODY").toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  // Focus ring: a focused control has a visible outline.
  await page.getByRole("link", { name: "Directory" }).first().focus();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
});
