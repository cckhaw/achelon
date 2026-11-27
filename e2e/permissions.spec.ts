import { expect, test } from "@playwright/test";
import { cleanup, createEventDirect, createRun, type Run } from "./fixtures";
import { signInAs } from "./helpers";

let run: Run;
let eventId: string;
test.beforeAll(async () => { run = await createRun(); eventId = await createEventDirect(run, "Boundary ride"); });
test.afterAll(async () => { await cleanup(run); });

const adminPaths = ["/admin", "/admin/members", "/admin/invites", "/admin/events", "/admin/events/new", "/admin/announcements", "/admin/applications", "/admin/import", "/admin/settings", "/admin/audit"];

test("anonymous visitors get the login page for everything, and nothing is cached or indexable", async ({ page }) => {
  for (const p of ["", "/directory", "/events", "/admin", "/races"]) {
    await page.goto(`/${run.slug}${p}`);
    await expect(page).toHaveURL(/\/login/);
  }
  const r = await page.request.get(`/${run.slug}/admin/events/${eventId}/export`);
  expect(r.status()).toBe(404);
  for (const url of ["/login", "/invite/not-a-token"]) {
    const res = await page.request.get(url);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  }
});

test("a guest sees events only; members-only and admin pages are 404", async ({ page }) => {
  await signInAs(page, run.guestEmail);
  for (const p of ["/directory", "/races", "/announcements", "/nominate", ...adminPaths]) {
    expect((await page.goto(`/${run.slug}${p}`))?.status(), p).toBe(404);
  }
  // Guests can open the Events tab, but not an all_members event they aren't listed on.
  expect((await page.goto(`/${run.slug}/events`))?.status()).toBe(200);
  expect((await page.goto(`/${run.slug}/events/${eventId}`))?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Directory" })).toHaveCount(0);
});

test("a member can use member features but every admin page is 404", async ({ page }) => {
  await signInAs(page, run.memberEmail);
  for (const p of ["", "/directory", "/events", `/events/${eventId}`, "/calendar", "/races", "/announcements", "/nominate", "/me", "/settings"]) {
    expect((await page.goto(`/${run.slug}${p}`))?.status(), p).toBe(200);
  }
  for (const p of adminPaths) expect((await page.goto(`/${run.slug}${p}`))?.status(), p).toBe(404);
  expect((await page.request.get(`/${run.slug}/admin/events/${eventId}/export`)).status()).toBe(404);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("the owner reaches every admin page; another community's slug is a 404 for them", async ({ page }) => {
  await signInAs(page, run.adminEmail);
  for (const p of adminPaths) expect((await page.goto(`/${run.slug}${p}`))?.status(), p).toBe(200);
  expect((await page.goto(`/some-other-community`))?.status()).toBe(404);
  const csv = await page.request.get(`/${run.slug}/admin/events/${eventId}/export`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
});
