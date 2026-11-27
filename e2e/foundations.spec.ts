import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanup, createEventDirect, createRun, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

let run: Run;
test.beforeAll(async () => { run = await createRun(); });
test.afterAll(async () => { await cleanup(run); });

test("login is neutral, member area is private, admin creates an invite that a newcomer accepts", async ({ page, browser, baseURL }) => {
  const errors = watchErrors(page);

  // Anonymous: everything member-only is closed, login reveals nothing.
  await page.goto(`/${run.slug}`);
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/login");
  await page.getByLabel("Email address").fill("nobody-here@e2e.invalid");
  await page.getByRole("button", { name: /email me a link/i }).click();
  await expect(page.getByText(/If that address belongs to a member/)).toBeVisible();
  expect((await page.request.get("/robots.txt")).status()).toBe(200);
  expect(await (await page.request.get("/robots.txt")).text()).toContain("Disallow: /");
  const hdr = (await page.request.get("/login")).headers();
  expect(hdr["x-robots-tag"]).toContain("noindex");
  expect(hdr["content-security-policy"]).toContain("nonce-");

  // Owner signs in and invites someone.
  await signInAs(page, run.adminEmail);
  await expect(page).toHaveURL(new RegExp(`/${run.slug}`));
  await page.goto(`/${run.slug}/admin/invites`);
  await page.getByRole("button", { name: "New invite" }).click();
  const newbie = `newbie-${run.id}@e2e.invalid`;
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Email (optional)").fill(newbie);
  await sheet.getByRole("button", { name: "Create invitation" }).click();
  const link = await sheet.getByLabel("Invitation link").inputValue();
  expect(link).toContain("/invite/");

  // The newcomer opens it in a clean browser, sets a profile and chooses visibility.
  const ctx2 = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const p2 = await ctx2.newPage();
  const errors2 = watchErrors(p2);
  await p2.goto(new URL(link).pathname);
  await expect(p2.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await p2.getByLabel("Name", { exact: true }).fill("Nia Newcomer");
  await p2.locator("#company").fill("Example Networks");
  await p2.locator("#city").fill("Leeds");
  await p2.getByLabel("Cycling").check();
  await p2.locator("#vis_company").selectOption("members");
  await p2.getByRole("switch", { name: /I agree/ }).check();
  await p2.getByRole("button", { name: /^Join/ }).click();
  await p2.waitForURL(new RegExp(`/${run.slug}\\?welcome=1`));
  await expect(p2.getByText(/Welcome aboard/)).toBeVisible();

  // The same link can't be reused.
  const p3 = await (await browser.newContext({ ...(test.info().project.use as object), baseURL })).newPage();
  await p3.goto(new URL(link).pathname);
  await expect(p3.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();

  // Directory shows the newcomer, honouring visibility (company shared, job title not).
  await p2.goto(`/${run.slug}/directory`);
  await expect(p2.getByText("Erin Example")).toBeVisible();
  await p2.goto(`/${run.slug}/me/profile`);
  await expect(p2.locator("#vis_job_title")).toHaveValue("admins");

  // Owner sees the new member in admin.
  await page.goto(`/${run.slug}/admin/members`);
  await expect(page.getByText("Nia Newcomer")).toBeVisible();

  // Owner (admin) sees company; a fellow member sees it only because the newcomer shared it.
  await page.goto(`/${run.slug}/directory?q=example+networks`);
  await expect(page.getByText("Nia Newcomer")).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
  expect(errors2, errors2.join("\n")).toEqual([]);
  await ctx2.close();
});

test("main screens have no serious accessibility violations", async ({ page }) => {
  await signInAs(page, run.adminEmail);
  const ev = await createEventDirect(run);
  for (const path of ["", "/directory", "/me", "/me/profile", "/settings", "/events", `/events/${ev}`, "/calendar", "/calendar?view=agenda", "/admin", "/admin/members", "/admin/invites", "/admin/settings", "/admin/events", "/admin/events/new", `/admin/events/${ev}`, "/admin/import", "/admin/audit"]) {
    await page.goto(`/${run.slug}${path}`);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${path || "/"}: ${v.id} (${v.nodes.length})`), JSON.stringify(bad.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html).slice(0, 2) })))).toEqual([]);
  }
});
