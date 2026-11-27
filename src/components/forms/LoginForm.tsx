"use client";
import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { t } from "@/lib/i18n";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, undefined);
  if (state?.ok) return <p className="form-ok" role="status">{state.message}</p>;
  const e = state?.fieldErrors ?? {};
  return (
    <form onReset={(e) => e.preventDefault()} action={action} className="grid gap-4" noValidate>
      <Field label={t("login.email")} name="email" error={e.email}>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="input" {...describedBy("email", e.email)} />
      </Field>
      <PasswordInput label={t("login.password")} error={e.password} required={false} />
      <FormMessage state={state?.fieldErrors ? undefined : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Signing in…">{t("login.signin")}</SubmitButton>
      <button type="submit" name="intent" value="reset" formNoValidate className="btn btn-plain btn-block" disabled={pending}>{t("login.forgot")}</button>
    </form>
  );
}
