"use server";
import { redirect } from "next/navigation";
import { profileSchema, emailSchema, formObject, parseVisibility } from "@/lib/validation";
import { zodState, failure, success, type ActionState } from "@/lib/forms";
import { clientIp, hit, RULES } from "@/lib/rate-limit";
import { acceptInvite } from "@/lib/system/invite-accept";
import { startSession } from "@/lib/session";
import { after } from "next/server";
import { flush } from "@/lib/mail/outbox";

export async function acceptInviteAction(token: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  if (!(await hit("invite-accept", await clientIp(), RULES.inviteAccept))) return failure("Too many attempts. Please wait a few minutes and try again.");
  if (form.get("consent") !== "on") return { ok: false, error: "Please confirm you agree to how your information is used.", fieldErrors: { consent: "Required" } };

  const parsed = profileSchema.safeParse(formObject(form, ["sports", "openTo"]));
  if (!parsed.success) return zodState(parsed.error);

  const rawEmail = form.get("email");
  const email = emailSchema.safeParse(rawEmail);
  // Email-bound invites ignore the field; link-only invites require a valid address.
  const r = await acceptInvite(token.slice(0, 200), { email: email.success ? email.data : "", profile: parsed.data, visibility: parseVisibility(form) });
  if (!r.ok) return failure("This invitation is no longer valid. Ask the person who invited you for a new one.");
  if (r.mode === "session") {
    await startSession(r.userId);
    redirect(`/${r.tenantSlug}?welcome=1`);
  }
  if (!email.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  after(() => flush().catch(() => undefined));
  return success("Check your email. We've sent a confirmation link to finish joining. It works once and expires in 15 minutes.");
}
