"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { emailSchema } from "@/lib/validation";
import { failure, success, type ActionState } from "@/lib/forms";
import { clientIp, hit, RULES } from "@/lib/rate-limit";
import { redeemLoginToken, requestMagicLink } from "@/lib/system/auth";
import { endSession, startSession } from "@/lib/session";
import { flush } from "@/lib/mail/outbox";
import { t } from "@/lib/i18n";

/** Neutral by design: the same message whether or not the address belongs to a member (D-7). */
export async function requestLoginAction(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  await requestMagicLink(parsed.data, await clientIp());
  after(() => flush().catch(() => undefined));
  return success(t("login.sent"));
}

export async function confirmLoginAction(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const token = String(form.get("token") ?? "").slice(0, 200);
  if (!(await hit("verify-ip", await clientIp(), RULES.verifyIp))) return failure("Too many attempts. Please wait a few minutes.");
  const r = token ? await redeemLoginToken(token) : null;
  if (!r) redirect("/login?error=link");
  await startSession(r.userId);
  redirect("/");
}

export async function signOutAction() {
  await endSession();
  redirect("/login");
}
