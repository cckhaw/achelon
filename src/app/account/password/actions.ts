"use server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { setPassword } from "@/lib/system/auth";
import { failure, type ActionState } from "@/lib/forms";

export async function setPasswordAction(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return failure("Please sign in again.");
  const r = await setPassword(user, String(form.get("password") ?? ""), form.has("current") ? String(form.get("current")) : undefined);
  if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined };
  redirect("/?password=set");
}
