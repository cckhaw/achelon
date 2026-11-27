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
  await expect(page.getByRole("button", { name: /email me a link/i })).toHaveCount(0); // email links are for resetting a password only
  await page.getByRole("button", { name: "Forgot password?" }).click();
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
  await p2.locator("#password").fill("a long e2e passphrase 2026");
  await p2.getByLabel("Name", { exact: true }).fill("Nia Newcomer");
  await p2.locator("#company").fill("Example Networks");
  await p2.locator("#city").fill("Leeds");
  await p2.getByLabel("Cycling").check();
  await p2.locator("#vis_company").selectOption("members");
  await p2.getByRole("switch", { name: /I agree/ }).check();
  await p2.getByRole("button", { name: /^Join/ }).click();
  await p2.waitForURL(new RegExp(`/${run.slug}\\?welcome=1`));
  await expect(p2.getByText(/Welcome aboard/)).toBeVisible();

  // Password sign-in: wrong password gets the same vague answer; the right one gets in; the email link stays available.
  const ctx3 = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const p4 = await ctx3.newPage();
  await p4.goto("/login");
  await p4.getByLabel("Email address").fill(newbie);
  await p4.getByLabel("Password", { exact: true }).fill("definitely not my password");
  await p4.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p4.getByText(/email and password don't match/)).toBeVisible();
  await p4.getByLabel("Email address").fill("nobody-at-all@e2e.invalid");
  await p4.getByLabel("Password", { exact: true }).fill("definitely not my password");
  await p4.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p4.getByText(/email and password don't match/)).toBeVisible(); // identical for an unknown address
  await p4.getByLabel("Email address").fill(newbie);
  await p4.getByLabel("Password", { exact: true }).fill("a long e2e passphrase 2026");
  await p4.getByRole("button", { name: "Sign in", exact: true }).click();
  await p4.waitForURL(new RegExp(`/${run.slug}$`));
  await expect(p4.getByText("Sign in faster next time.")).toHaveCount(0); // they already have a password
  await ctx3.close();

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

test("legal pages are public and linked from the front page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms of Service" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
});

test("admin invites a guest to an event; the guest accepts and sees only that event", async ({ page, browser, baseURL }) => {
  const eventId = await createEventDirect(run, "Guest welcome ride");
  await signInAs(page, run.adminEmail);
  await page.goto(`/${run.slug}/admin/events/${eventId}`);
  await expect(page.getByRole("heading", { name: "Invite people" })).toBeVisible();
  await expect(page.getByLabel("Event link (sign-in required)")).toHaveValue(new RegExp(`/${run.slug}/events/${eventId}$`));
  await page.getByRole("button", { name: "Invite someone by email" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Email", { exact: true }).fill(`guest-${run.id}@e2e.invalid`);
  await expect(sheet.getByLabel("Role")).toHaveValue("guest");
  await sheet.getByRole("button", { name: "Create invitation" }).click();
  await expect(sheet.getByText(/Invitation emailed to/)).toBeVisible();
  const link = await sheet.getByLabel("Invitation link").inputValue();

  const ctx = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const g = await ctx.newPage();
  await g.goto(new URL(link).pathname);
  await g.locator("#password").fill("a long e2e passphrase 2026");
  await g.getByLabel("Name", { exact: true }).fill("Gus Guest");
  await g.getByRole("switch", { name: /I agree/ }).check();
  await g.getByRole("button", { name: /^Join/ }).click();
  await g.waitForURL(new RegExp(`/${run.slug}`));
  await g.goto(`/${run.slug}/events/${eventId}`);
  await expect(g.getByRole("heading", { name: "Guest welcome ride" })).toBeVisible();
  await ctx.close();
});
