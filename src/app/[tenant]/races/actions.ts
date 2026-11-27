"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, zodState, type ActionState } from "@/lib/forms";
import { declareRace, joinRace, raceSchema, removeRace, setRaceVisibility } from "@/lib/services/races";

export async function declareRaceAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "races.declare");
    const p = raceSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return zodState(p.error);
    await withTenant(ctx.tenant.id, (tx) => declareRace(tx, { tenantId: ctx.tenant.id, membershipId: ctx.membership.id }, p.data));
    revalidatePath(`/${slug}/races`);
    revalidatePath(`/${slug}`);
    return success("Race added.");
  });
}

export async function joinRaceAction(slug: string, sourceId: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "races.declare");
    const ok = await withTenant(ctx.tenant.id, (tx) => joinRace(tx, { tenantId: ctx.tenant.id, membershipId: ctx.membership.id, role: ctx.membership.role }, z.uuid().parse(sourceId)));
    revalidatePath(`/${slug}/races`);
    return ok ? success("You're going too.") : failure("That race isn't available.");
  });
}

export async function removeRaceAction(slug: string, id: string): Promise<void> {
  const ctx = await requireMemberForAction(slug, "races.declare");
  await withTenant(ctx.tenant.id, (tx) => removeRace(tx, ctx.membership.id, z.uuid().parse(id)));
  revalidatePath(`/${slug}/races`);
}

export async function raceVisibilityAction(slug: string, id: string, visibleTo: "nobody" | "members"): Promise<void> {
  const ctx = await requireMemberForAction(slug, "races.declare");
  await withTenant(ctx.tenant.id, (tx) => setRaceVisibility(tx, ctx.membership.id, z.uuid().parse(id), visibleTo));
  revalidatePath(`/${slug}/races`);
}
