"use client";
import { useActionState } from "react";
import { cancelEventAction, forceGoingAction, removeAttendeeAction } from "@/app/[tenant]/admin/events/actions";
import { FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function CancelEventForm({ slug, eventId }: { slug: string; eventId: string }) {
  const [state, action] = useActionState(cancelEventAction.bind(null, slug, eventId), undefined);
  return (
    <form onReset={(e) => e.preventDefault()} action={action} onSubmit={(e) => { if (!window.confirm("Cancel this event? Everyone signed up will be emailed.")) e.preventDefault(); }} className="grid gap-2">
      <FormMessage state={state} />
      <SubmitButton className="btn btn-danger" pendingLabel="Cancelling…">Cancel event</SubmitButton>
    </form>
  );
}

export function AttendeeActions({ slug, eventId, membershipId, status }: { slug: string; eventId: string; membershipId: string; status: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between" style={{ gap: "1.5rem", padding: "0 1rem 0.75rem" }}>
      {status === "waitlist" ? <form onReset={(e) => e.preventDefault()} action={async () => { await forceGoingAction(slug, eventId, membershipId); }}><button className="btn btn-tinted btn-sm">Move to going</button></form> : <span />}
      <form onReset={(e) => e.preventDefault()} action={async () => { await removeAttendeeAction(slug, eventId, membershipId); }} onSubmit={(e) => { if (!window.confirm("Remove this person from the event?")) e.preventDefault(); }}><button className="btn btn-danger btn-sm">Remove</button></form>
    </div>
  );
}
