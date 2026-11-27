"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, type ActionState } from "@/lib/forms";
import { approveApplication, declineApplication } from "@/lib/services/applications";
import { enqueue, scheduleFlush } from "@/lib/mail/outbox";
import { inviteMail } from "@/lib/mail/templates";
import { env } from "@/lib/env";
import { sha256Hex } from "@/lib/crypto";

export async function approveApplicationAction(slug: string, id: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "applications.review");
    const actor = { membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id };
    const r = await withTenant(ctx.tenant.id, (tx) => approveApplication(tx, actor, z.uuid().parse(id)));
    if (!r) return failure("That application has already been decided.");
    const sponsor = r.application.sponsorMembershipId
      ? (await withTenant(ctx.tenant.id, (tx) => tx.select({ n: schema.memberProfiles.displayName }).from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, r.application.sponsorMembershipId!))))[0]?.n ?? null
      : null;
    const mail = inviteMail({ url: `${env().APP_URL}/invite/${r.invite.token}`, tenantName: ctx.tenant.name, inviter: sponsor, note: null, days: 14 });
    await enqueue({ tenantId: ctx.tenant.id, to: r.application.email, ...mail, category: "essential", dedupeKey: `invite:${r.invite.id}:${sha256Hex(r.invite.token).slice(0, 12)}` });
    await withTenant(ctx.tenant.id, (tx) => tx.update(schema.invites).set({ emailedAt: new Date() }).where(eq(schema.invites.id, r.invite.id)));
    await scheduleFlush();
    revalidatePath(`/${slug}/admin/applications`);
    return success("Approved. The invitation has been emailed.");
  });
}

export async function declineApplicationAction(slug: string, id: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "applications.review");
    const a = await withTenant(ctx.tenant.id, (tx) => declineApplication(tx, { membershipId: ctx.membership.id, tenantId: ctx.tenant.id }, z.uuid().parse(id)));
    revalidatePath(`/${slug}/admin/applications`);
    return a ? success("Declined. The nominee is not contacted.") : failure("That application has already been decided.");
  });
}
