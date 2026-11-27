import { expect, test } from "@playwright/test";
import { cleanup, createRun, loginPath, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

let run: Run;
test.beforeAll(async () => { run = await createRun(); });
test.afterAll(async () => { await cleanup(run); });

test("set a password after an emailed link, then sign in with it; change needs the current one; reset by link", async ({ page, browser, baseURL }) => {
  const errors = watchErrors(page);
  await signInAs(page, run.memberEmail);
  await page.goto(`/${run.slug}`);
  await expect(page.getByText("Sign in faster next time.")).toBeVisible();
  await page.getByRole("link", { name: "Set a password" }).click();
  await expect(page.getByRole("heading", { name: "Set a password" })).toBeVisible();
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();
  await page.getByLabel("New password").fill("first long e2e passphrase");
  await page.getByRole("switch", { name: "Show password" }).check();
  await expect(page.getByLabel("New password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL(/password=set/);
  await expect(page.getByText("Sign in faster next time.")).toHaveCount(0);

  // A fresh browser signs in with email + password.
  const ctx = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const q = await ctx.newPage();
  await q.goto("/login");
  await q.getByLabel("Email address").fill(run.memberEmail);
  await q.getByLabel("Password", { exact: true }).fill("first long e2e passphrase");
  await q.getByRole("button", { name: "Sign in", exact: true }).click();
  await q.waitForURL(new RegExp(`/${run.slug}$`));

  // Changing it from an ordinary session needs the current password.
  await q.goto("/account/password");
  await expect(q.getByLabel("Current password")).toBeVisible();
  await q.getByLabel("Current password").fill("wrong wrong wrong");
  await q.getByLabel("New password").fill("second long e2e passphrase");
  await q.getByRole("button", { name: "Save password" }).click();
  await expect(q.getByText(/current password isn't right/i).first()).toBeVisible();
  await q.getByLabel("Current password").fill("first long e2e passphrase");
  await q.getByRole("button", { name: "Save password" }).click();
  await q.waitForURL(/password=set/);
  // ...which signed the first browser out.
  await page.goto(`/${run.slug}/settings`);
  await expect(page).toHaveURL(/\/login/);

  // Forgot password: the reset link lands on the set-password page with no current password asked.
  const r = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const z = await r.newPage();
  await z.goto("/login");
  await z.getByLabel("Email address").fill(run.memberEmail);
  await z.getByRole("button", { name: "Forgot password?" }).click();
  await expect(z.getByText(/set or reset your password is on its way/i)).toBeVisible();
  const path = await loginPath(run.memberEmail); // (the real mail goes to the outbox; mint an equivalent link for the browser)
  await z.goto(path);
  await z.getByRole("button", { name: "Continue" }).click();
  expect(errors).toEqual([]);
  await ctx.close(); await r.close();
});
