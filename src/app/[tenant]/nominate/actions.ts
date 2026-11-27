"use server";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, zodState, type ActionState } from "@/lib/forms";
import { applicationSchema, submitApplication } from "@/lib/services/applications";
import { hit } from "@/lib/rate-limit";

export async function nominateAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "sponsor.nominate");
    if (!ctx.settings.sponsorshipEnabled) return failure("Sponsorship is switched off for this community.");
    if (!(await hit("nominate", ctx.membership.id, { limit: 5, windowSeconds: 86_400 }))) return failure("You've nominated a few people today already. Please try again tomorrow.");
    const p = applicationSchema.safeParse(Object.fromEntries(form));
    if (!p.success) return zodState(p.error);
    // Identical response whether or not the person is already known (no membership oracle for the nominator).
    await withTenant(ctx.tenant.id, (tx) => submitApplication(tx, { tenantId: ctx.tenant.id, membershipId: ctx.membership.id }, p.data));
    revalidatePath(`/${slug}/nominate`);
    return success("Thank you. An admin will review your nomination and, if approved, send the invitation.");
  });
}
