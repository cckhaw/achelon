"use client";
import { useActionState } from "react";
import { requestLoginAction } from "@/app/actions/auth";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { t } from "@/lib/i18n";

export function LoginForm() {
  const [state, action] = useActionState(requestLoginAction, undefined);
  if (state?.ok) return <p className="form-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field label={t("login.email")} name="email" error={state?.fieldErrors?.email}>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="input" {...describedBy("email", state?.fieldErrors?.email)} />
      </Field>
      <FormMessage state={state?.fieldErrors ? undefined : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Sending…">{t("login.submit")}</SubmitButton>
    </form>
  );
}
