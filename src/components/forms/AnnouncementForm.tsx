"use client";
import { useActionState } from "react";
import { sendAnnouncementAction } from "@/app/[tenant]/admin/announcements/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function AnnouncementForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(sendAnnouncementAction.bind(null, slug), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} onSubmit={(ev) => { if (!window.confirm("Send this announcement now? Emails go out immediately and can't be recalled.")) ev.preventDefault(); }} className="grid gap-4" noValidate key={state?.ok ? "sent" : "draft"}>
      {state?.ok ? <FormMessage state={state} /> : null}
      <Field label="Subject" name="subject" error={e.subject}><input id="subject" name="subject" className="input" required maxLength={140} {...describedBy("subject", e.subject)} /></Field>
      <Field label="Message" name="body" error={e.body} hint="**bold**, *italic*, [links](https://…) and “- ” lists work."><textarea id="body" name="body" className="textarea" style={{ minHeight: "10rem" }} required maxLength={5000} {...describedBy("body", e.body, true)} /></Field>
      <Field label="Send to" name="audience">
        <select id="audience" name="audience" className="select" defaultValue="all_members"><option value="all_members">All members</option><option value="founding_only">Founding members</option><option value="admins">Admins only</option></select>
      </Field>
      {!state?.ok ? <FormMessage state={state?.fieldErrors ? { error: state.error } : state} /> : null}
      <SubmitButton className="btn btn-block" pendingLabel="Sending…">Send announcement</SubmitButton>
    </form>
  );
}
