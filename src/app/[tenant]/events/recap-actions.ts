"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, zodState, type ActionState } from "@/lib/forms";
import { addRecap, deleteRecap, recapSchema } from "@/lib/services/recaps";

export async function addRecapAction(slug: string, eventId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "recaps.write");
    const p = recapSchema.safeParse({ body: form.get("body"), photos: form.get("photos") ?? "" });
    if (!p.success) return zodState(p.error);
    const r = await withTenant(ctx.tenant.id, (tx) => addRecap(tx, { tenantId: ctx.tenant.id, membershipId: ctx.membership.id, role: ctx.membership.role }, z.uuid().parse(eventId), p.data));
    if (!r.ok) return failure(r.reason);
    revalidatePath(`/${slug}/events/${eventId}`);
    return success("Recap posted.");
  });
}

export async function deleteRecapAction(slug: string, eventId: string, id: string): Promise<void> {
  const ctx = await requireMemberForAction(slug, "recaps.write");
  await withTenant(ctx.tenant.id, (tx) => deleteRecap(tx, { membershipId: ctx.membership.id, role: ctx.membership.role }, z.uuid().parse(id)));
  revalidatePath(`/${slug}/events/${eventId}`);
}
