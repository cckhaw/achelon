"use client";
import { useActionState, useState } from "react";
import { saveEventAction } from "@/app/[tenant]/admin/events/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ATTENDEE_VISIBILITIES, EVENT_VISIBILITIES, type EventType } from "@/db/constants";
import { t, type MessageKey } from "@/lib/i18n";

export interface EventFormValues {
  type: EventType; title: string; description: string; timezone: string; start: string; end: string; locationName: string; locationAddress: string;
  lat: string; lng: string; routeUrl: string; externalUrl: string; distanceKm: string; paceOrLevelNote: string; capacity: string; cutoff: string;
  visibility: (typeof EVENT_VISIBILITIES)[number]; attendeeVisibility: (typeof ATTENDEE_VISIBILITIES)[number]; status: "draft" | "published"; invitees: string[];
}

const VIS_LABEL = { all_members: "All members", founding_only: "Founding members only", invite_list: "Invite list" } as const;

export function EventForm({ slug, eventId, values, allowedTypes, members, locked }: { slug: string; eventId: string | null; values: EventFormValues; allowedTypes: EventType[]; members: { id: string; name: string }[]; locked?: boolean }) {
  const [state, action] = useActionState(saveEventAction.bind(null, slug, eventId), undefined);
  const [vis, setVis] = useState(values.visibility);
  const e = state?.fieldErrors ?? {};
  const f = (name: keyof EventFormValues, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} name={name} error={e[name]} hint={hint}>
      <input id={name} name={name} className="input" defaultValue={values[name] as string} {...describedBy(name, e[name], Boolean(hint))} {...props} />
    </Field>
  );
  return (
    <form action={action} className="grid gap-5" noValidate>
      <Field label="Type" name="type" error={e.type}>
        <select id="type" name="type" className="select" defaultValue={values.type}>{allowedTypes.map((x) => <option key={x} value={x}>{t(`eventType.${x}` as MessageKey)}</option>)}</select>
      </Field>
      {f("title", "Title", { required: true, maxLength: 120 })}
      <Field label="Description" name="description" error={e.description} hint="Plain text. **bold**, *italic*, [links](https://…) and “- ” lists work.">
        <textarea id="description" name="description" className="textarea" maxLength={4000} defaultValue={values.description} {...describedBy("description", e.description, true)} />
      </Field>
      {f("timezone", "Time zone", { autoCapitalize: "none", spellCheck: false }, "The event's own zone, e.g. Asia/Singapore. Times below are in this zone; members see them in their own zone too.")}
      <div className="grid gap-4 sm:grid-cols-2">
        {f("start", "Starts", { type: "datetime-local", required: true })}
        {f("end", "Ends (optional)", { type: "datetime-local" })}
      </div>
      {f("locationName", "Place name", { maxLength: 120 })}
      {f("locationAddress", "Address", { maxLength: 240 })}
      <div className="grid gap-4 sm:grid-cols-2">
        {f("lat", "Latitude (optional)", { inputMode: "decimal" })}
        {f("lng", "Longitude (optional)", { inputMode: "decimal" })}
      </div>
      {f("routeUrl", "Route link (optional)", { type: "url", inputMode: "url", autoCapitalize: "none" }, "An https:// link, e.g. Strava or Komoot.")}
      {f("externalUrl", "Event website (optional)", { type: "url", inputMode: "url", autoCapitalize: "none" })}
      <div className="grid gap-4 sm:grid-cols-2">
        {f("distanceKm", "Distance, km (optional)", { inputMode: "decimal" })}
        {f("capacity", "Capacity (optional)", { inputMode: "numeric" }, "Leave empty for unlimited. Extra sign-ups join a waitlist.")}
      </div>
      {f("paceOrLevelNote", "Pace or level note", { maxLength: 160 }, "e.g. “Social pace, 28 km/h, no one dropped”.")}
      {f("cutoff", "Sign-up cutoff (optional)", { type: "datetime-local" })}
      <Field label="Who can see it" name="visibility">
        <select id="visibility" name="visibility" className="select" value={vis} onChange={(ev) => setVis(ev.target.value as typeof vis)}>
          {EVENT_VISIBILITIES.map((v) => <option key={v} value={v}>{VIS_LABEL[v]}</option>)}
        </select>
      </Field>
      {vis === "invite_list" ? (
        <fieldset>
          <legend className="field-label">Invited people</legend>
          <div className="group" style={{ maxHeight: "16rem", overflowY: "auto" }}>
            {members.map((m) => (
              <label key={m.id} className="row"><input type="checkbox" name="invitees" value={m.id} defaultChecked={values.invitees.includes(m.id)} style={{ width: "1.5rem", height: "1.5rem" }} /><span className="row-main">{m.name}</span></label>
            ))}
          </div>
          {e.invitees ? <p className="field-error" role="alert">{e.invitees}</p> : null}
        </fieldset>
      ) : null}
      <Field label="Attendee list" name="attendeeVisibility" hint="“Counts only” hides names from members. Admins always see names.">
        <select id="attendeeVisibility" name="attendeeVisibility" className="select" defaultValue={values.attendeeVisibility}>
          {ATTENDEE_VISIBILITIES.map((v) => <option key={v} value={v}>{v === "names" ? "Show names" : "Counts only"}</option>)}
        </select>
      </Field>
      <Field label="Status" name="status" hint={locked ? "This event is cancelled." : "Draft events are visible to admins only. Publishing emails members who opted in."}>
        <select id="status" name="status" className="select" defaultValue={values.status} disabled={locked}>
          <option value="draft">Draft</option><option value="published">Published</option>
        </select>
      </Field>
      <FormMessage state={state?.fieldErrors ? { error: state.error } : state} />
      <SubmitButton className="btn btn-block" pendingLabel="Saving…">{eventId ? "Save event" : "Create event"}</SubmitButton>
    </form>
  );
}
