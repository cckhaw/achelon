"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { emailSchema } from "@/lib/validation";
import { failure, success, type ActionState } from "@/lib/forms";
import { clientIp, hit, RULES } from "@/lib/rate-limit";
import { loginWithPassword, redeemLoginToken, requestMagicLink } from "@/lib/system/auth";
import { endSession, startSession } from "@/lib/session";
import { flush } from "@/lib/mail/outbox";
import { t } from "@/lib/i18n";

/**
 * One form, three intents. "password" signs in with email + password; "link" and "reset" email a one-time link (reset
 * lands on the set-password page). Every failure and the link request answer the same way for any address (D-7, D-54).
 */
export async function signInAction(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const intent = String(form.get("intent") ?? "password");
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };

  if (intent === "link" || intent === "reset") {
    await requestMagicLink(email.data, await clientIp(), intent === "reset" ? "reset" : "login");
    after(() => flush().catch(() => undefined));
    return success(intent === "reset" ? t("login.sent.reset") : t("login.sent"));
  }

  const password = String(form.get("password") ?? "");
  if (!password) return { ok: false, error: "Enter your password, or ask for an email link instead.", fieldErrors: { password: "Enter your password" } };
  const r = await loginWithPassword(email.data, password, await clientIp());
  if ("error" in r) return failure(r.error === "throttled" ? "Too many attempts. Please wait a few minutes, or use an email link instead." : "That email and password don't match. You can also ask for an email link.");
  await startSession(r.userId);
  redirect("/");
}

export async function confirmLoginAction(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") ?? "").slice(0, 200);
  if (!(await hit("verify-ip", await clientIp(), RULES.verifyIp))) return failure("Too many attempts. Please wait a few minutes.");
  const r = token ? await redeemLoginToken(token) : null;
  if (!r) redirect("/login?error=link");
  await startSession(r.userId, { viaLink: true });
  redirect(r.purpose === "reset" ? "/account/password" : "/");
}

export async function signOutAction() {
  await endSession();
  redirect("/login");
}
