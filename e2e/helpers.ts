import type { Page } from "@playwright/test";
import { loginPath } from "./fixtures";

export async function signInAs(page: Page, email: string) {
  await page.goto(await loginPath(email));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Console errors and failed requests collected during a test; assert it is empty at the end. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}
