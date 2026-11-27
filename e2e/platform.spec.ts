import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanup, createOperator, createRun, removeCommunity, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

/** Needs PLATFORM_ADMIN_EMAILS=platform-operator@e2e.invalid on the server (local and CI only, never production). */
test.skip(Boolean(process.env.E2E_BASE_URL), "operator fixtures are not used against production");

let run: Run;
let operator: string;
test.beforeAll(async () => { run = await createRun(); operator = await createOperator(run); });
test.afterAll(async () => { await removeCommunity(`e2e-new-${run.id}%`); await cleanup(run); });

test("the platform area is invisible to everyone but operators", async ({ page }) => {
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/login/);
  await signInAs(page, run.adminEmail); // owner of a community, but not a platform operator
  expect((await page.goto("/platform"))?.status()).toBe(404);
  expect((await page.goto(`/platform/${run.slug}`))?.status()).toBe(404);
  await page.goto(`/${run.slug}/me`);
  await expect(page.getByRole("link", { name: "Platform" })).toHaveCount(0);
});

test("an operator creates a community, adds an owner, and suspends and reactivates one", async ({ page, browser, baseURL }) => {
  const errors = watchErrors(page);
  await signInAs(page, operator);
  await page.goto(`/${run.slug}/me`);
  await page.getByRole("link", { name: "Platform" }).click();
  await expect(page.getByRole("heading", { name: "Communities", level: 1 })).toBeVisible();

  // Create: the URL name follows the community name until edited; validation keeps what was typed.
  await page.getByRole("button", { name: "New community" }).click();
  const dlg = page.getByRole("dialog");
  const slug = `e2e-new-${run.id}`;
  await dlg.getByLabel("Community name").fill(`E2E New ${run.id}`);
  await dlg.getByLabel("URL name").fill("login");
  await dlg.getByLabel("First owner's email").fill(`newowner-${run.id}@e2e.invalid`);
  await dlg.getByRole("button", { name: "Create community" }).click();
  await expect(dlg.getByText("That name is reserved")).toBeVisible();
  await expect(dlg.getByLabel("First owner's email")).toHaveValue(`newowner-${run.id}@e2e.invalid`);
  await dlg.getByLabel("URL name").fill(slug);
  await dlg.getByRole("button", { name: "Create community" }).click();
  await page.waitForURL(new RegExp(`/platform/${slug}\\?created=1`));
  await expect(page.getByText(/Community created/)).toBeVisible();
  await expect(page.getByText(`newowner-${run.id}@e2e.invalid`).first()).toBeVisible();

  // Add a second owner.
  await page.getByLabel("Add an owner").fill(`second-${run.id}@e2e.invalid`);
  await page.getByRole("button", { name: "Add owner" }).click();
  await expect(page.getByText(/Owner added/)).toBeVisible();

  // The operator screens meet the same accessibility bar as the rest of the app.
  for (const path of ["/platform", `/platform/${slug}`]) {
    await page.goto(path);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${path}: ${v.id}`)).toEqual([]);
  }

  // Suspend the run's community: its members get a 404; reactivating restores access.
  await page.goto(`/platform/${run.slug}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Suspend community" }).click();
  await expect(page.getByText(/Suspended\./)).toBeVisible();
  const ctx = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const m = await ctx.newPage();
  await signInAs(m, run.memberEmail);
  expect((await m.goto(`/${run.slug}`))?.status()).toBe(404);
  await page.getByRole("button", { name: "Reactivate community" }).click();
  await expect(page.getByText("Reactivated.")).toBeVisible();
  expect((await m.goto(`/${run.slug}`))?.status()).toBe(200);
  expect(errors, errors.join("\n")).toEqual([]);
  await ctx.close();
});
