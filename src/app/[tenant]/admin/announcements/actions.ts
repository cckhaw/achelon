"use server";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { success, zodState, type ActionState } from "@/lib/forms";
import { announcementSchema, createAnnouncement } from "@/lib/services/announcements";
import { sendAnnouncement } from "@/lib/notifications";

export async function sendAnnouncementAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "announcements.send");
    const p = announcementSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return zodState(p.error);
    const id = await withTenant(ctx.tenant.id, (tx) => createAnnouncement(tx, { membershipId: ctx.membership.id, tenantId: ctx.tenant.id }, p.data));
    const n = await sendAnnouncement(ctx, { id, subject: p.data.subject, body: p.data.body, audience: p.data.audience });
    revalidatePath(`/${slug}/admin/announcements`);
    revalidatePath(`/${slug}/announcements`);
    return success(`Sent. ${n} ${n === 1 ? "person was" : "people were"} emailed (members who turned announcement emails off, or use the weekly digest, can still read it in the app).`);
  });
}
