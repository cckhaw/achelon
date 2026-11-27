import { expect, test } from "@playwright/test";
import pg from "pg";
import { cleanup, createRun, type Run } from "./fixtures";
import { signInAs, watchErrors } from "./helpers";

/** Reads the local email outbox, so it only runs against a local/CI database (production scrubs mail bodies). */
test.skip(Boolean(process.env.E2E_BASE_URL), "needs the dev outbox");

let run: Run;
test.beforeAll(async () => { run = await createRun(); });
test.afterAll(async () => { await cleanup(run); });

async function outbox(to: string, subjectLike: string) {
  const p = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER ?? "postgresql://achelon:achelon@localhost:5432/achelon", max: 1 });
  try {
    for (let i = 0; i < 20; i++) {
      const { rows } = await p.query("SELECT subject, body_text FROM email_outbox WHERE to_email = $1 AND subject ILIKE $2 ORDER BY created_at DESC", [to, subjectLike]);
      if (rows.length) return rows;
      await new Promise((r) => setTimeout(r, 400));
    }
    return [];
  } finally {
    await p.end();
  }
}

test("race board: declare, join, privacy of goal time", async ({ page, browser, baseURL }) => {
  const errors = watchErrors(page);
  await signInAs(page, run.adminEmail);
  await page.goto(`/${run.slug}/races`);
  await page.getByRole("button", { name: "Add race" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Race", { exact: true }).fill(`Test Half ${run.id}`);
  await dlg.getByLabel("Date").fill("2031-03-14");
  await dlg.getByLabel("Goal time (optional)").fill("1:40:00");
  await dlg.getByRole("button", { name: "Add race" }).click();
  await expect(dlg.getByText("Race added.")).toBeVisible();
  await dlg.getByRole("button", { name: "Done" }).click();
  await page.goto(`/${run.slug}/races`);
  await expect(page.getByText("goal 1:40:00")).toBeVisible();

  const ctx = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const m = await ctx.newPage();
  await signInAs(m, run.memberEmail);
  await m.goto(`/${run.slug}/races`);
  await expect(m.getByText(`Test Half ${run.id}`)).toBeVisible();
  await expect(m.getByText("1:40:00")).toHaveCount(0);           // goal time is private to its owner
  await m.getByRole("button", { name: "I'm going too" }).click();
  await expect(m.getByText("You're going").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Marco Example")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
  await ctx.close();
});

test("announcement is posted in-app and emailed; nomination → approval → invitation email", async ({ page, browser, baseURL }) => {
  await signInAs(page, run.adminEmail);
  await page.goto(`/${run.slug}/admin/announcements`);
  await page.getByLabel("Subject").fill(`Welcome ${run.id}`);
  await page.getByLabel("Message").fill("Season **kick-off** next month.\n\n- Rides\n- Runs");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Send announcement" }).click();
  await expect(page.getByText(/^Sent\./)).toBeVisible();
  const mail = await outbox(run.memberEmail, `Welcome ${run.id}`);
  expect(mail.length).toBe(1);
  expect(mail[0].body_text).toContain("kick-off");

  const ctx = await browser.newContext({ ...(test.info().project.use as object), baseURL });
  const m = await ctx.newPage();
  await signInAs(m, run.memberEmail);
  await m.goto(`/${run.slug}/announcements`);
  await expect(m.getByRole("heading", { name: `Welcome ${run.id}` })).toBeVisible();
  await expect(m.locator("strong", { hasText: "kick-off" })).toBeVisible();

  // Member nominates; the response never reveals whether the person is already known.
  const nominee = `newbie-${run.id}-nom@e2e.invalid`;
  await m.goto(`/${run.slug}/nominate`);
  await m.getByLabel("Their name").fill("Nora Nominee");
  await m.getByLabel("Their email").fill(nominee);
  await m.getByLabel("Why would they be a good fit?").fill("Strong rider, thoughtful, based in Leeds.");
  await m.getByRole("button", { name: "Submit nomination" }).click();
  await expect(m.getByText(/An admin will review/)).toBeVisible();

  await page.goto(`/${run.slug}/admin/applications`);
  await expect(page.getByText("Nora Nominee")).toBeVisible();
  await expect(page.getByText("Sponsored by Marco Example")).toBeVisible();
  await page.getByRole("button", { name: "Approve and invite" }).click();
  // The nomination moves to "Decided" once approved.
  await expect(page.getByRole("heading", { name: "Decided" })).toBeVisible();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  const inv = await outbox(nominee, "%invited to%");
  expect(inv.length).toBeGreaterThan(0);
  expect(inv[0].body_text).toMatch(/\/invite\/[\w-]+/);
  expect(inv[0].body_text).toContain("Marco Example has invited you");
  await ctx.close();
});

test("event page shows recap form only to people who were there", async ({ page }) => {
  await signInAs(page, run.adminEmail);
  const p = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER ?? "postgresql://achelon:achelon@localhost:5432/achelon", max: 1 });
  const r = await p.query("INSERT INTO events (tenant_id, type, title, starts_at, timezone, status) VALUES ($1,'een_ride','Past ride', now() - interval '2 days','UTC','published') RETURNING id", [run.tenantId]);
  await p.end();
  await page.goto(`/${run.slug}/events/${r.rows[0].id}`);
  await page.getByRole("button", { name: "Write a recap" }).click();
  await page.getByRole("dialog").getByLabel("How did it go?").fill("Lovely morning, 12 riders, no punctures.");
  await page.getByRole("dialog").getByRole("button", { name: "Post recap" }).click();
  await expect(page.getByRole("dialog").getByText("Recap posted.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.getByText("Lovely morning")).toBeVisible();
});
