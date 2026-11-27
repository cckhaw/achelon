"use client";
import { useActionState } from "react";
import { declareRaceAction, joinRaceAction, raceVisibilityAction, removeRaceAction } from "@/app/[tenant]/races/actions";
import { Field, FormMessage, describedBy } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function DeclareRaceForm({ slug, races }: { slug: string; races: { id: string; title: string }[] }) {
  const [state, action] = useActionState(declareRaceAction.bind(null, slug), undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate key={state?.ok ? "done" : "f"}>
      {state?.ok ? <FormMessage state={state} /> : null}
      <Field label="Race" name="raceName" error={e.raceName}><input id="raceName" name="raceName" className="input" required maxLength={120} {...describedBy("raceName", e.raceName)} /></Field>
      <Field label="Date" name="raceDate" error={e.raceDate}><input id="raceDate" name="raceDate" type="date" className="input" required {...describedBy("raceDate", e.raceDate)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where" name="location"><input id="location" name="location" className="input" maxLength={120} /></Field>
        <Field label="Distance" name="distance"><input id="distance" name="distance" className="input" maxLength={40} placeholder="21.1 km" /></Field>
      </div>
      <Field label="Goal time (optional)" name="goalTime" hint="Only you can see this."><input id="goalTime" name="goalTime" className="input" maxLength={20} placeholder="1:45:00" {...describedBy("goalTime", undefined, true)} /></Field>
      {races.length ? (
        <Field label="Club race (optional)" name="externalEventId" hint="Link to a race your admins listed, so people find each other.">
          <select id="externalEventId" name="externalEventId" className="select" defaultValue=""><option value="">None</option>{races.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>
        </Field>
      ) : null}
      <Field label="Who can see I'm going" name="visibleTo">
        <select id="visibleTo" name="visibleTo" className="select" defaultValue="members"><option value="members">All members</option><option value="nobody">Only me</option></select>
      </Field>
      {!state?.ok ? <FormMessage state={state?.fieldErrors ? { error: state.error } : state} /> : null}
      <SubmitButton className="btn btn-block" pendingLabel="Adding…">Add race</SubmitButton>
    </form>
  );
}

export function JoinRaceButton({ slug, sourceId }: { slug: string; sourceId: string }) {
  const [state, action] = useActionState(joinRaceAction.bind(null, slug, sourceId), undefined);
  return (
    <form action={action} className="grid gap-1">
      <FormMessage state={state?.ok ? undefined : state} />
      <SubmitButton className="btn btn-tinted btn-sm" pendingLabel="Adding…">I&apos;m going too</SubmitButton>
    </form>
  );
}

export function MyRaceControls({ slug, id, visibleTo }: { slug: string; id: string; visibleTo: "nobody" | "members" }) {
  return (
    <div className="flex flex-wrap items-center justify-between" style={{ gap: "1.5rem", padding: "0 1rem 0.75rem" }}>
      <form action={async () => { await raceVisibilityAction(slug, id, visibleTo === "members" ? "nobody" : "members"); }}>
        <button className="btn btn-tinted btn-sm">{visibleTo === "members" ? "Make private" : "Show to members"}</button>
      </form>
      <form action={async () => { await removeRaceAction(slug, id); }} onSubmit={(e) => { if (!window.confirm("Remove this race?")) e.preventDefault(); }}>
        <button className="btn btn-danger btn-sm">Remove</button>
      </form>
    </div>
  );
}
