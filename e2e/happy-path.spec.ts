import { expect, test } from "@playwright/test";
import { cleanup, createRun, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

/**
 * The brief's happy path, runnable against local, CI and production (no mailbox needed):
 * invite accepted → profile set → event created → RSVP → the member's iCal feed contains the event.
 */
let run: Run;
test.beforeAll(async () => { run = await createRun(); });
test.afterAll(async () => { await cleanup(run); });

const pad = (n: number) => String(n).padStart(2, "0");
function localInDays(days: number, hh = 7, mm = 30) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hh)}:${pad(mm)}`;
}

test("invite → profile → event → RSVP → iCal", async ({ page, browser, baseURL }) => {
  const errors = watchErrors(page);
  const title = `E2E Sunday ride ${run.id}`;

  // Admin creates and publishes an event.
  await signInAs(page, run.adminEmail);
  await page.goto(`/${run.slug}/admin/events/new`);
  await page.locator("#title").fill(title);
  await page.locator("#description").fill("Easy pace. **Coffee after.**");
  await page.locator("#start").fill(localInDays(10));
  await page.locator("#locationName").fill("Hyde Park Corner");
  await page.locator("#capacity").fill("2");
  await page.locator("#status").selectOption("published");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Event created.")).toBeVisible();

  // Admin invites a newcomer; the newcomer accepts in a clean browser context.
  await page.goto(`/${run.slug}/admin/invites`);
  await page.getByRole("button", { name: "New invite" }).click();
  const newbie = `newbie-${run.id}@e2e.invalid`;
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Email (optional)").fill(newbie);
  await sheet.getByRole("button", { name: "Create invitation" }).click();
  const link = await sheet.getByLabel("Invitation link").inputValue();

  const ctx2 = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const p = await ctx2.newPage();
  const errors2 = watchErrors(p);
  await p.goto(new URL(link).pathname);
  await p.getByLabel("Name", { exact: true }).fill("Nia Newcomer");
  await p.locator("#city").fill("Leeds");
  await p.getByLabel("Cycling").check();
  await p.getByRole("switch", { name: /I agree/ }).check();
  await p.getByRole("button", { name: /^Join/ }).click();
  await p.waitForURL(new RegExp(`/${run.slug}\\?welcome=1`));

  // The event is on Home; RSVP; the answer sticks.
  await expect(p.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await p.getByRole("link", { name: new RegExp(title) }).click();
  await expect(p.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await p.getByRole("button", { name: "Going" }).click();
  await expect(p.getByText("You're going.").first()).toBeVisible();
  await p.reload();
  await expect(p.getByRole("button", { name: "Going", pressed: true })).toBeVisible();
  await expect(p.getByRole("link", { name: "Add to calendar" })).toBeVisible();

  // Calendar: subscribe, then the private feed contains the event.
  await p.goto(`/${run.slug}/calendar?view=agenda`);
  await expect(p.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await p.getByRole("button", { name: "Subscribe" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Create my private link" }).click();
  const feedUrl = await p.getByLabel("Private calendar link").inputValue();
  expect(feedUrl).toMatch(/\/cal\/[\w-]+\.ics$/);
  const ics = await p.request.get(new URL(feedUrl).pathname);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain(`SUMMARY:${title}`);
  expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  expect(body).toContain("You're going.");
  // A made-up token reveals nothing.
  expect((await p.request.get("/cal/not-a-real-token-not-a-real-token.ics")).status()).toBe(404);

  // The admin sees the sign-up and can export the attendee list.
  await page.goto(`/${run.slug}/admin/events`);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByText("Nia Newcomer")).toBeVisible();
  const csv = await page.request.get(page.url().replace(/\?.*$/, "") + "/export");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Nia Newcomer");

  expect(errors, errors.join("\n")).toEqual([]);
  expect(errors2, errors2.join("\n")).toEqual([]);
  await ctx2.close();
});

test("waitlist: a full event queues the next person and promotes them when someone leaves", async ({ page, browser, baseURL }) => {
  const title = `E2E Small ride ${run.id}`;
  await signInAs(page, run.adminEmail);
  await page.goto(`/${run.slug}/admin/events/new`);
  await page.locator("#title").fill(title);
  await page.locator("#start").fill(localInDays(12));
  await page.locator("#capacity").fill("1");
  await page.locator("#status").selectOption("published");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Event created.")).toBeVisible();
  const eventPath = new URL(page.url()).pathname.replace("/admin", "");

  // The member takes the only seat; the admin lands on the waitlist.
  const ctx = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const m = await ctx.newPage();
  await signInAs(m, run.memberEmail);
  await m.goto(eventPath);
  await m.getByRole("button", { name: "Going" }).click();
  await expect(m.getByText("You're going.").first()).toBeVisible();

  await page.goto(eventPath);
  await page.getByRole("button", { name: "Join waitlist" }).click();
  await expect(page.getByText(/on the waitlist/).first()).toBeVisible();

  await m.getByRole("button", { name: "Cancel my place" }).click();
  await expect(m.getByText("Your sign-up is cancelled.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Going", pressed: true })).toBeVisible();
  await ctx.close();
});
