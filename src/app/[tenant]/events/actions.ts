"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { rsvp } from "@/lib/services/signups";
import { run } from "@/lib/action";
import { failure, success, type ActionState } from "@/lib/forms";
import { afterRsvp } from "@/lib/notifications";

const statusSchema = z.enum(["going", "maybe", "declined", "cancelled"]);

export async function rsvpAction(slug: string, eventId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "events.rsvp");
    const status = statusSchema.safeParse(form.get("status"));
    if (!status.success || !z.uuid().safeParse(eventId).success) return failure("Choose an option.");
    const note = form.has("note") ? String(form.get("note") ?? "").trim().slice(0, 200) || null : undefined;
    const r = await withTenant(ctx.tenant.id, (tx) => rsvp(tx, { tenantId: ctx.tenant.id, membershipId: ctx.membership.id, role: ctx.membership.role }, eventId, status.data, note));
    if (!r.ok) return failure(r.reason);
    await afterRsvp(ctx, eventId, r);
    revalidatePath(`/${slug}/events`, "layout");
    revalidatePath(`/${slug}`);
    return success(r.status === "going" ? "You're going." : r.status === "waitlist" ? "You're on the waitlist. We'll email you if a spot opens." : r.status === "maybe" ? "Marked as maybe." : r.status === "declined" ? "Noted: you can't make it." : "Your sign-up is cancelled.");
  });
}
