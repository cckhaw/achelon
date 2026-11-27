"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { profileSchema, formObject, parseVisibility } from "@/lib/validation";
import { saveProfile } from "@/lib/services/profiles";
import { run } from "@/lib/action";
import { success, zodState, failure, type ActionState } from "@/lib/forms";
import { deleteAccount } from "@/lib/system/account";
import { endSession } from "@/lib/session";

export async function saveProfileAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug);
    const parsed = profileSchema.safeParse(formObject(form, ["sports", "openTo"]));
    if (!parsed.success) return zodState(parsed.error);
    await withTenant(ctx.tenant.id, (tx) => saveProfile(tx, ctx.tenant.id, ctx.membership.id, parsed.data, parseVisibility(form)));
    revalidatePath(`/${slug}`, "layout");
    return success("Saved.");
  });
}

export async function savePreferencesAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug);
    const on = (k: string) => form.get(k) === "on";
    const digest = form.get("digest") === "weekly" ? "weekly" : "off";
    await withTenant(ctx.tenant.id, (tx) =>
      tx.insert(schema.notificationPreferences)
        .values({ membershipId: ctx.membership.id, tenantId: ctx.tenant.id, eventAnnouncements: on("eventAnnouncements"), reminders: on("reminders"), waitlist: on("waitlist"), digest })
        .onConflictDoUpdate({ target: schema.notificationPreferences.membershipId, set: { eventAnnouncements: on("eventAnnouncements"), reminders: on("reminders"), waitlist: on("waitlist"), digest, updatedAt: new Date() } }));
    return success("Email preferences saved.");
  });
}

export async function deleteAccountAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const ctx = await requireMemberForAction(slug).catch(() => null);
  if (!ctx) return failure("You're not signed in.");
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm.", fieldErrors: { confirm: "Type DELETE to confirm." } };
  await deleteAccount(ctx.user.id);
  await endSession();
  redirect("/login");
}

void eq;
