"use server";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/db";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { success, type ActionState } from "@/lib/forms";
import { revokeCalendarToken, rotateCalendarToken } from "@/lib/services/calendar";
import { env } from "@/lib/env";

export async function rotateCalendarAction(slug: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "events.view");
    const token = await withTenant(ctx.tenant.id, (tx) => rotateCalendarToken(tx, ctx.tenant.id, ctx.membership.id));
    revalidatePath(`/${slug}/calendar`);
    const https = `${env().APP_URL}/cal/${token}.ics`;
    return success("Your private calendar link is ready. Copy it now: for your security it is shown only once.", { url: https, webcal: https.replace(/^https?:/, "webcal:") });
  });
}

export async function revokeCalendarAction(slug: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug, "events.view");
    await withTenant(ctx.tenant.id, (tx) => revokeCalendarToken(tx, ctx.membership.id));
    revalidatePath(`/${slug}/calendar`);
    return success("Your calendar link has been switched off.");
  });
}
