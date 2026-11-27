"use client";
import { useActionState } from "react";
import { deleteAccountAction, savePreferencesAction } from "@/app/[tenant]/me/actions";
import { Field, FormMessage, Group, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function PreferencesForm({ slug, prefs }: { slug: string; prefs: { eventAnnouncements: boolean; reminders: boolean; waitlist: boolean; digest: "off" | "weekly" } }) {
  const [state, action] = useActionState(savePreferencesAction.bind(null, slug), undefined);
  const toggles = [
    { name: "eventAnnouncements", title: "New events and announcements", sub: "When an admin publishes an event or sends a message.", on: prefs.eventAnnouncements },
    { name: "reminders", title: "Event reminders", sub: "About two days before an event you're going to.", on: prefs.reminders },
    { name: "waitlist", title: "Waitlist updates", sub: "When a spot opens for you.", on: prefs.waitlist },
  ];
  return (
    <form onReset={(e) => e.preventDefault()} action={action}>
      <Group title="Email" id="email" footer="Sign-in links, invitations and RSVP confirmations are always sent: they are part of using Achelon.">
        {toggles.map((t) => (
          <label className="row" key={t.name}>
            <span className="row-main"><span className="row-title block">{t.title}</span><span className="row-sub block">{t.sub}</span></span>
            <input type="checkbox" role="switch" className="switch" name={t.name} defaultChecked={t.on} />
          </label>
        ))}
        <label className="row">
          <span className="row-main"><span className="row-title block">Weekly digest</span><span className="row-sub block">One Monday email instead of separate ones.</span></span>
          <input type="checkbox" role="switch" className="switch" name="digest" value="weekly" defaultChecked={prefs.digest === "weekly"} />
        </label>
      </Group>
      <div className="mt-3"><FormMessage state={state} /></div>
      <div className="mt-3"><SubmitButton className="btn btn-tinted" pendingLabel="Saving…">Save preferences</SubmitButton></div>
    </form>
  );
}

export function DeleteAccountForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(deleteAccountAction.bind(null, slug), undefined);
  return (
    <form onReset={(e) => e.preventDefault()} action={action} className="grid gap-4">
      <p>This removes your access to every community straight away and erases your profile and sign-ups after 30 days. It can&apos;t be undone.</p>
      <Field label="Type DELETE to confirm" name="confirm" error={state?.fieldErrors?.confirm}>
        <input id="confirm" name="confirm" className="input" autoCapitalize="characters" autoComplete="off" {...describedBy("confirm", state?.fieldErrors?.confirm)} />
      </Field>
      <FormMessage state={state?.fieldErrors ? undefined : state} />
      <SubmitButton className="btn btn-danger" pendingLabel="Deleting…">Delete my account</SubmitButton>
    </form>
  );
}
