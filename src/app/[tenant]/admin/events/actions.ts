"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, type ActionState } from "@/lib/forms";
import { formObject } from "@/lib/validation";
import { parseEventForm } from "@/lib/event-validation";
import { cancelEvent, createEvent, updateEvent } from "@/lib/services/events";
import { adminForceGoing, adminRemoveAttendee } from "@/lib/services/signups";
import { afterEventPublished, afterEventCancelled, afterPromotions } from "@/lib/notifications";

const actorOf = (ctx: Awaited<ReturnType<typeof requireMemberForAction>>) => ({ membershipId: ctx.membership.id, role: ctx.membership.role, tenantId: ctx.tenant.id });

export async function saveEventAction(slug: string, eventId: string | null, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "events.manage");
    const parsed = parseEventForm(formObject(form, ["invitees"]), ctx.settings.allowedEventTypes);
    if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
    if (eventId && !z.uuid().safeParse(eventId).success) return failure("Event not found.");
    if (!eventId) {
      const id = await withTenant(ctx.tenant.id, (tx) => createEvent(tx, actorOf(ctx), parsed.value));
      if (parsed.value.status === "published") await afterEventPublished(ctx, id);
      revalidatePath(`/${slug}`, "layout");
      redirect(`/${slug}/admin/events/${id}?saved=1`);
    }
    const r = await withTenant(ctx.tenant.id, (tx) => updateEvent(tx, actorOf(ctx), eventId, parsed.value));
    if (!r) return failure("Event not found.");
    if (r.newlyPublished) await afterEventPublished(ctx, eventId);
    if (r.promoted.length) await afterPromotions(ctx, eventId, r.promoted);
    revalidatePath(`/${slug}`, "layout");
    return success("Event saved.");
  });
}

export async function cancelEventAction(slug: string, eventId: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "events.manage");
    const ev = await withTenant(ctx.tenant.id, (tx) => cancelEvent(tx, actorOf(ctx), z.uuid().parse(eventId)));
    if (!ev) return failure("Event not found.");
    await afterEventCancelled(ctx, ev.id);
    revalidatePath(`/${slug}`, "layout");
    return success("Event cancelled. Attendees have been told.");
  });
}

export async function removeAttendeeAction(slug: string, eventId: string, membershipId: string): Promise<void> {
  const ctx = await requireMemberForAction(slug, "events.manage");
  const r = await withTenant(ctx.tenant.id, (tx) => adminRemoveAttendee(tx, actorOf(ctx), z.uuid().parse(eventId), z.uuid().parse(membershipId)));
  if (r.promoted.length) await afterPromotions(ctx, eventId, r.promoted);
  revalidatePath(`/${slug}/admin/events/${eventId}`);
}

export async function forceGoingAction(slug: string, eventId: string, membershipId: string): Promise<void> {
  const ctx = await requireMemberForAction(slug, "events.manage");
  await withTenant(ctx.tenant.id, (tx) => adminForceGoing(tx, actorOf(ctx), z.uuid().parse(eventId), z.uuid().parse(membershipId)));
  revalidatePath(`/${slug}/admin/events/${eventId}`);
}
