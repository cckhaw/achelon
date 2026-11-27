"use client";
import { useActionState } from "react";
import { addRecapAction } from "@/app/[tenant]/events/recap-actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function RecapForm({ slug, eventId }: { slug: string; eventId: string }) {
  const [state, action] = useActionState(addRecapAction.bind(null, slug, eventId), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate key={state?.ok ? "done" : "f"}>
      {state?.ok ? <FormMessage state={state} /> : null}
      <Field label="How did it go?" name="body" error={e.body}><textarea id="body" name="body" className="textarea" required maxLength={4000} {...describedBy("body", e.body)} /></Field>
      <Field label="Photo links (optional)" name="photos" error={e.photos} hint="One https:// link per line, up to 6. Photos stay where you host them."><textarea id="photos" name="photos" className="textarea" style={{ minHeight: "4rem" }} {...describedBy("photos", e.photos, true)} /></Field>
      {!state?.ok ? <FormMessage state={state?.fieldErrors ? { error: state.error } : state} /> : null}
      <SubmitButton className="btn btn-block" pendingLabel="Posting…">Post recap</SubmitButton>
    </form>
  );
}
