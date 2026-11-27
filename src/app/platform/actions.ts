"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "@/lib/session";
import { isPlatformOperator } from "@/lib/platform-operator";
import { addOwner, createCommunity, setSuspended } from "@/lib/system/platform";
import { failure, success, type ActionState } from "@/lib/forms";
import { run } from "@/lib/action";
import { ForbiddenError } from "@/lib/context";

async function operator() {
  const user = await currentUser();
  if (!user || !isPlatformOperator(user.email)) throw new ForbiddenError();
  return user;
}

export async function createCommunityAction(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    await operator();
    const r = await createCommunity({ slug: String(form.get("slug") ?? ""), name: String(form.get("name") ?? ""), ownerEmail: String(form.get("ownerEmail") ?? ""), timezone: String(form.get("timezone") ?? "Asia/Kuala_Lumpur") });
    if (!r.ok) return { ok: false, error: r.field ? "Please fix the highlighted field." : r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined };
    revalidatePath("/platform");
    redirect(`/platform/${r.slug}?created=1`);
  });
}

export async function addOwnerAction(tenantId: string, slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    await operator();
    const r = await addOwner(z.uuid().parse(tenantId), String(form.get("ownerEmail") ?? ""));
    if (!r.ok) return { ok: false, error: r.field ? "Please fix the highlighted field." : r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined };
    revalidatePath(`/platform/${slug}`);
    return success("Owner added. They've been emailed a link to set a password.");
  });
}

export async function setSuspendedAction(tenantId: string, slug: string, suspended: boolean, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    await operator();
    const r = await setSuspended(z.uuid().parse(tenantId), suspended);
    if (!r.ok) return failure(r.error);
    revalidatePath(`/platform/${slug}`);
    revalidatePath("/platform");
    return success(suspended ? "Suspended. Nobody can open this community until you reactivate it." : "Reactivated.");
  });
}
