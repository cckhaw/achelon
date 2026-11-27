"use client";
import { useActionState } from "react";
import { confirmLoginAction } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmLoginAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="btn btn-block" pendingLabel="Signing in…">Continue</SubmitButton>
    </form>
  );
}
