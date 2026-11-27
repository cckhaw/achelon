import { expect, test } from "@playwright/test";
import { cleanup, createPastRide, createRun, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

/** Runs against the mock provider (STRAVA_MODE=mock). With the feature off (production default) these are skipped. */
let run: Run;
test.beforeAll(async () => { run = await createRun(); });
test.afterAll(async () => { await cleanup(run); });

test("connect (mock) → verified sync → event results → disconnect erases", async ({ page }) => {
  const errors = watchErrors(page);
  const rideId = await createPastRide(run, run.memberEmail);
  await signInAs(page, run.memberEmail);
  await page.goto(`/${run.slug}/settings`);
  if (!(await page.getByRole("button", { name: "Connect Strava" }).count())) test.skip(true, "Strava is off in this environment");

  await expect(page.getByText(/Demo mode/)).toBeVisible();
  await page.getByRole("button", { name: "Connect Strava" }).click();
  await page.waitForURL(/strava=connected/);
  await expect(page.getByText("Strava is connected.")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  // The leaderboard on the finished ride shows the member's own result.
  await page.goto(`/${run.slug}/events/${rideId}`);
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByText("Marco Example (you)")).toBeVisible();

  // Opting out removes the result immediately.
  await page.goto(`/${run.slug}/settings`);
  await page.getByRole("switch", { name: "Show my results on event leaderboards" }).uncheck();
  await expect(page.getByText(/Your results are hidden/)).toBeVisible();
  await page.goto(`/${run.slug}/events/${rideId}`);
  await expect(page.getByRole("heading", { name: "Results" })).toHaveCount(0);

  // Disconnect wipes the connection.
  await page.goto(`/${run.slug}/settings`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Disconnect Strava" }).click();
  await expect(page.getByText(/Disconnected\. Your Strava tokens/)).toBeVisible();
  await page.goto(`/${run.slug}/settings`);
  await expect(page.getByRole("button", { name: "Connect Strava" })).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the OAuth callback rejects forged or foreign state", async ({ page, browser, baseURL }) => {
  await signInAs(page, run.memberEmail);
  await page.goto(`/${run.slug}/settings`);
  if (!(await page.getByRole("button", { name: "Connect Strava" }).count())) test.skip(true, "Strava is off in this environment");
  expect((await page.request.get("/api/strava/callback?code=mock-1&state=forged", { maxRedirects: 0 })).status()).toBe(404);
  expect((await page.request.get("/api/strava/callback?code=mock-1", { maxRedirects: 0 })).status()).toBe(404);

  // Start a flow as the member, then replay the state while signed in as someone else.
  const start = await page.request.get(`/api/strava/connect?tenant=${run.slug}&share=on`, { maxRedirects: 0 });
  expect(start.status()).toBe(303);
  const loc = start.headers()["location"];
  const state = new URL(loc).searchParams.get("state")!;
  const ctx = await browser.newContext({ baseURL });
  const other = await ctx.newPage();
  await signInAs(other, run.adminEmail);
  expect((await other.request.get(`/api/strava/callback?code=mock-9&state=${state}`, { maxRedirects: 0 })).status()).toBe(404);
  // Anonymous visitors can't start a flow either.
  const anon = await (await browser.newContext({ baseURL })).newPage();
  expect((await anon.request.get(`/api/strava/connect?tenant=${run.slug}`, { maxRedirects: 0 })).status()).toBe(404);
  await ctx.close();
});
