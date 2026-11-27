"use client";
import { useActionState } from "react";
import { setPasswordAction } from "@/app/account/password/actions";
import { FormMessage } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { MIN_PASSWORD } from "@/lib/password-policy";

export function SetPasswordForm({ needsCurrent }: { needsCurrent: boolean }) {
  const [state, action] = useActionState(setPasswordAction, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form onReset={(e) => e.preventDefault()} action={action} className="grid gap-4" noValidate>
      {needsCurrent ? <PasswordInput id="current" name="current" label="Current password" error={e.current} /> : null}
      <PasswordInput id="new-password" name="password" label="New password" autoComplete="new-password" error={e.password} hint={`At least ${MIN_PASSWORD} characters. A few random words work well.`} />
      <FormMessage state={e.current || e.password ? undefined : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Saving…">Save password</SubmitButton>
    </form>
  );
}
