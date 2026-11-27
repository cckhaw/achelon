"use client";
import { useActionState, useState } from "react";
import { addOwnerAction, createCommunityAction, setSuspendedAction } from "@/app/platform/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { SubmitButton } from "@/components/ui/SubmitButton";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function CreateCommunityForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [state, action] = useActionState(createCommunityAction, undefined);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const e = state?.fieldErrors ?? {};
  return (
    <form onReset={(ev) => ev.preventDefault()} action={action} className="grid gap-4" noValidate>
      <Field label="Community name" name="name" error={e.name}>
        <input id="name" name="name" className="input" required maxLength={80} onChange={(ev) => { if (!touched) setSlug(slugify(ev.target.value)); }} {...describedBy("name", e.name)} />
      </Field>
      <Field label="URL name" name="slug" error={e.slug} hint={`Lowercase letters, numbers and dashes. The community lives at /${slug || "url-name"}. It can't be changed later.`}>
        <input id="slug" name="slug" className="input" required value={slug} onChange={(ev) => { setTouched(true); setSlug(slugify(ev.target.value)); }} autoCapitalize="none" spellCheck={false} {...describedBy("slug", e.slug, true)} />
      </Field>
      <Field label="First owner's email" name="ownerEmail" error={e.ownerEmail} hint="They get an email with a link to set a password and sign in.">
        <input id="ownerEmail" name="ownerEmail" type="email" inputMode="email" autoCapitalize="none" className="input" required {...describedBy("ownerEmail", e.ownerEmail, true)} />
      </Field>
      <Field label="Default time zone" name="timezone" error={e.timezone} hint="Malaysia (GMT+8) unless you change it. The owner can change it later.">
        <TimezoneSelect defaultValue={defaultTimezone} {...describedBy("timezone", e.timezone, true)} />
      </Field>
      <FormMessage state={state?.fieldErrors ? { error: state.error } : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Creating…">Create community</SubmitButton>
    </form>
  );
}

export function AddOwnerForm({ tenantId, slug }: { tenantId: string; slug: string }) {
  const [state, action] = useActionState(addOwnerAction.bind(null, tenantId, slug), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form onReset={(ev) => ev.preventDefault()} action={action} className="grid gap-3" noValidate>
      <Field label="Add an owner" name="ownerEmail" error={e.ownerEmail} hint="Existing members are promoted. New people get an email to set a password.">
        <input id="ownerEmail" name="ownerEmail" type="email" inputMode="email" autoCapitalize="none" className="input" required {...describedBy("ownerEmail", e.ownerEmail, true)} />
      </Field>
      <FormMessage state={state?.fieldErrors ? { error: state.error } : state} />
      <SubmitButton className="btn btn-tinted" pendingLabel="Adding…">Add owner</SubmitButton>
    </form>
  );
}

export function SuspendForm({ tenantId, slug, suspended }: { tenantId: string; slug: string; suspended: boolean }) {
  const [state, action] = useActionState(setSuspendedAction.bind(null, tenantId, slug, !suspended), undefined);
  return (
    <form onReset={(ev) => ev.preventDefault()} action={action} onSubmit={(ev) => { if (!suspended && !window.confirm("Suspend this community? Nobody, including its owners, can open it until you reactivate it.")) ev.preventDefault(); }} className="grid gap-2">
      <FormMessage state={state} />
      <SubmitButton className={suspended ? "btn btn-tinted" : "btn btn-danger"} pendingLabel="Working…">{suspended ? "Reactivate community" : "Suspend community"}</SubmitButton>
    </form>
  );
}
