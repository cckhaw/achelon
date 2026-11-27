"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMemberForAction } from "@/lib/context";
import { run } from "@/lib/action";
import { failure, success, type ActionState } from "@/lib/forms";
import { disconnect, setShareResults, syncMember } from "@/lib/strava/service";
import { getProvider } from "@/lib/strava/provider";

export async function syncStravaAction(slug: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug);
    if (!getProvider()) return failure("Strava isn't available.");
    const r = await syncMember(ctx.tenant.id, ctx.membership.id);
    revalidatePath(`/${slug}`, "layout");
    if (!r) return failure("Your Strava connection needs to be renewed. Please connect again.");
    return success(`Synced ${r.activities} recent ${r.activities === 1 ? "activity" : "activities"}${r.results ? ` and ${r.results} event ${r.results === 1 ? "result" : "results"}` : ""}.`);
  });
}

export async function shareStravaAction(slug: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireMemberForAction(slug);
    const on = form.get("share") === "on";
    await setShareResults(ctx.tenant.id, ctx.membership.id, on);
    revalidatePath(`/${slug}`, "layout");
    return success(on ? "Your results will appear on event leaderboards." : "Your results are hidden and removed from leaderboards.");
  });
}

export async function disconnectStravaAction(slug: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  void _form;
  return run(async () => {
    const ctx = await requireMemberForAction(slug);
    await disconnect(ctx.tenant.id, ctx.membership.id);
    revalidatePath(`/${slug}`, "layout");
    redirect(`/${slug}/settings?strava=disconnected`);
  });
}
