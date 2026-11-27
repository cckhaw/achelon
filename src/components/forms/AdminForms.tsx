"use client";
import { useActionState } from "react";
import { changeRoleAction, createInviteAction, emailAllUnsentAction, importAction, resendInviteAction, revokeInviteAction, saveSettingsAction, setStatusAction, type ImportState } from "@/app/[tenant]/admin/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CopyField } from "@/components/ui/CopyField";
import { EVENT_TYPES, MEMBERSHIP_ROLES, type EventType, type MembershipRole } from "@/db/constants";
import { t, type MessageKey } from "@/lib/i18n";
import { IMPORT_TEMPLATE } from "@/lib/import-constants";

export function CreateInviteForm({ slug, roles, sponsors }: { slug: string; roles: MembershipRole[]; sponsors: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createInviteAction.bind(null, slug), undefined);
  const errors = state?.fieldErrors ?? {};
  return (
    <div className="grid gap-4">
      {state?.ok && state.data?.url ? (
        <div className="grid gap-3">
          <p className="form-ok" role="status">{state.message}</p>
          <CopyField value={state.data.url} />
        </div>
      ) : null}
      <form action={action} className="grid gap-4" noValidate key={state?.data?.url ?? "new"}>
        <Field label="Email (optional)" name="email" error={errors.email} hint="With an email, we send the invitation and only that address can use it. Leave empty to get a single-use link to share yourself.">
          <input id="email" name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="off" className="input" {...describedBy("email", errors.email, true)} />
        </Field>
        <Field label="Role" name="role">
          <select id="role" name="role" className="select" defaultValue="member">
            {roles.map((r) => <option key={r} value={r}>{t(`role.${r}` as MessageKey)}</option>)}
          </select>
        </Field>
        <Field label="Sponsor (optional)" name="sponsor" hint="The member vouching for this person.">
          <select id="sponsor" name="sponsor" className="select" defaultValue="">
            <option value="">No sponsor</option>
            {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)" name="note" error={errors.note} hint="Shown in the invitation email.">
          <input id="note" name="note" className="input" maxLength={300} {...describedBy("note", errors.note, true)} />
        </Field>
        {!state?.ok ? <FormMessage state={state} /> : null}
        <SubmitButton className="btn btn-block" pendingLabel="Creating…">Create invitation</SubmitButton>
      </form>
    </div>
  );
}

export function InviteRowActions({ slug, id, status, hasEmail }: { slug: string; id: string; status: string; hasEmail: boolean }) {
  const [state, action] = useActionState(resendInviteAction.bind(null, slug, id), undefined);
  if (status !== "pending" && status !== "expired") return null;
  return (
    <div className="grid gap-2" style={{ padding: "0 1rem 0.75rem" }}>
      {state?.ok && state.data?.url ? <CopyField value={state.data.url} label="New link" /> : null}
      <FormMessage state={state} />
      {/* Destructive action is spatially separated from the primary one (HIG) and asks first. */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: "1.5rem" }}>
        <form action={action}><SubmitButton className="btn btn-tinted btn-sm" pendingLabel="Working…">{hasEmail ? "Resend email" : "New link"}</SubmitButton></form>
        {status === "pending" ? (
          <form action={async () => { await revokeInviteAction(slug, id); }} onSubmit={(e) => { if (!window.confirm("Revoke this invitation? The link stops working immediately.")) e.preventDefault(); }}><button className="btn btn-danger btn-sm">Revoke</button></form>
        ) : null}
      </div>
    </div>
  );
}

export function EmailAllButton({ slug }: { slug: string }) {
  const [state, action] = useActionState(emailAllUnsentAction.bind(null, slug), undefined);
  return (
    <form action={action} className="grid gap-2">
      <FormMessage state={state} />
      <SubmitButton className="btn btn-tinted" pendingLabel="Sending…">Email all unsent invitations</SubmitButton>
    </form>
  );
}

export function ChangeRoleForm({ slug, id, current, allowed }: { slug: string; id: string; current: MembershipRole; allowed: MembershipRole[] }) {
  const [state, action] = useActionState(changeRoleAction.bind(null, slug, id), undefined);
  const options = allowed.includes(current) ? allowed : [current, ...allowed];
  return (
    <form action={action} className="grid gap-3">
      <Field label="Role" name="role">
        <select id="role" name="role" className="select" defaultValue={current}>
          {options.map((r) => <option key={r} value={r} disabled={!allowed.includes(r)}>{t(`role.${r}` as MessageKey)}</option>)}
        </select>
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="btn btn-tinted" pendingLabel="Saving…">Update role</SubmitButton>
    </form>
  );
}

export function StatusButton({ slug, id, status, label, tone = "tinted", confirmText }: { slug: string; id: string; status: "active" | "paused" | "left"; label: string; tone?: "tinted" | "danger"; confirmText?: string }) {
  const [state, action] = useActionState(setStatusAction.bind(null, slug, id, status), undefined);
  return (
    <form action={action} onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }} className="grid gap-2">
      <FormMessage state={state} />
      <SubmitButton className={`btn btn-${tone}`} pendingLabel="Working…">{label}</SubmitButton>
    </form>
  );
}

export function ImportForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<ImportState | undefined, FormData>(importAction.bind(null, slug), undefined);
  const p = state?.preview;
  return (
    <div className="grid gap-4">
      {state?.ok && state.message ? <p className="form-ok" role="status">{state.message}</p> : null}
      {!p ? (
        <form action={action} className="grid gap-4">
          <input type="hidden" name="mode" value="preview" />
          <Field label="CSV file" name="file" hint={<>Export from your CRM or Google Sheet. We look for columns named Email, Name, Company, Job Title, City, Country and Member Type or Founding. <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`} download="achelon-import-template.csv">Download a template</a>.</>}>
            <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" required />
          </Field>
          {state && !state.ok ? <FormMessage state={state} /> : null}
          <SubmitButton className="btn" pendingLabel="Checking…">Preview import</SubmitButton>
        </form>
      ) : (
        <form action={action} className="grid gap-4">
          <input type="hidden" name="mode" value="apply" />
          <input type="hidden" name="csv" value={state!.csv} />
          <p className="t-headline">Preview</p>
          <ul className="group" aria-label="Import summary">
            <li className="row"><span className="row-main">New invitations</span><strong>{p.counts.new}</strong></li>
            <li className="row"><span className="row-main">Already members</span><span>{p.counts.existing_member}</span></li>
            <li className="row"><span className="row-main">Already invited</span><span>{p.counts.pending_invite}</span></li>
            <li className="row"><span className="row-main">Duplicates in file</span><span>{p.counts.duplicate_in_file}</span></li>
            <li className="row"><span className="row-main">Rows with problems</span><span>{p.counts.invalid}</span></li>
          </ul>
          {p.rows.some((r) => r.status === "invalid") ? (
            <div>
              <p className="t-headline mb-2">Problems to fix</p>
              <ul className="group">
                {p.rows.filter((r) => r.status === "invalid").slice(0, 20).map((r) => <li key={r.line} className="row"><span className="row-main">Line {r.line}: {r.reason}</span></li>)}
              </ul>
            </div>
          ) : null}
          <p className="muted t-sub">Nothing has been saved yet. Applying creates invitations only; nobody is emailed until you send them from Invites.</p>
          <FormMessage state={state && !state.ok ? state : undefined} />
          {p.counts.new > 0 ? <SubmitButton className="btn" pendingLabel="Creating…">Create {p.counts.new} {p.counts.new === 1 ? "invitation" : "invitations"}</SubmitButton> : <p className="form-error">There is nothing new to import.</p>}
        </form>
      )}
    </div>
  );
}

export function SettingsForm({ slug, values }: { slug: string; values: { name: string; defaultTimezone: string; brand: string; types: EventType[]; sponsorship: boolean } }) {
  const [state, action] = useActionState(saveSettingsAction.bind(null, slug), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <Field label="Community name" name="name" error={e.name}>
        <input id="name" name="name" className="input" required maxLength={80} defaultValue={values.name} {...describedBy("name", e.name)} />
      </Field>
      <Field label="Default time zone" name="defaultTimezone" error={e.defaultTimezone} hint="Used for new events and for members who haven't set their own. For example Asia/Singapore.">
        <input id="defaultTimezone" name="defaultTimezone" className="input" defaultValue={values.defaultTimezone} autoCapitalize="none" spellCheck={false} {...describedBy("defaultTimezone", e.defaultTimezone, true)} />
      </Field>
      <Field label="Accent colour" name="brand">
        <select id="brand" name="brand" className="select" defaultValue={values.brand}>
          <option value="green">Green</option><option value="blue">Blue</option><option value="violet">Violet</option><option value="graphite">Graphite</option>
        </select>
      </Field>
      <fieldset>
        <legend className="field-label">Allowed event types</legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPES.map((x) => <label key={x} className="chip"><input type="checkbox" name="types" value={x} defaultChecked={values.types.includes(x)} /><span>{t(`eventType.${x}` as MessageKey)}</span></label>)}
        </div>
        {e.types ? <p className="field-error" role="alert">{e.types}</p> : null}
      </fieldset>
      <label className="row card">
        <span className="row-main"><span className="row-title block">Member sponsorship</span><span className="row-sub block">Members can nominate people to join. An admin approves each one.</span></span>
        <input type="checkbox" role="switch" className="switch" name="sponsorship" defaultChecked={values.sponsorship} />
      </label>
      <FormMessage state={e && Object.keys(e).length ? undefined : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export { MEMBERSHIP_ROLES };
