"use client";
import { useActionState } from "react";
import { nominateAction } from "@/app/[tenant]/nominate/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function NominateForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(nominateAction.bind(null, slug), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate key={state?.ok ? "done" : "form"}>
      {state?.ok ? <FormMessage state={state} /> : null}
      <Field label="Their name" name="name" error={e.name}><input id="name" name="name" className="input" required maxLength={80} {...describedBy("name", e.name)} /></Field>
      <Field label="Their email" name="email" error={e.email} hint="We only use it to send the invitation if an admin approves."><input id="email" name="email" type="email" inputMode="email" autoCapitalize="none" className="input" required {...describedBy("email", e.email, true)} /></Field>
      <Field label="Company (optional)" name="company"><input id="company" name="company" className="input" maxLength={100} /></Field>
      <Field label="Why would they be a good fit?" name="message" error={e.message}><textarea id="message" name="message" className="textarea" required minLength={10} maxLength={800} {...describedBy("message", e.message)} /></Field>
      {!state?.ok ? <FormMessage state={state?.fieldErrors ? { error: state.error } : state} /> : null}
      <SubmitButton className="btn btn-block" pendingLabel="Sending…">Submit nomination</SubmitButton>
    </form>
  );
}
