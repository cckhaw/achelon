"use client";
import { useActionState } from "react";
import { rsvpAction } from "@/app/[tenant]/events/actions";
import { FormMessage } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { SignupStatus } from "@/db/constants";

export function RsvpForm({ slug, eventId, mine, waitRank, full, closedReason }: { slug: string; eventId: string; mine: SignupStatus | null; waitRank: number | null; full: boolean; closedReason: string | null }) {
  const [state, action, pending] = useActionState(rsvpAction.bind(null, slug, eventId), undefined);
  const leaving = mine === "going" || mine === "waitlist";
  const options: { value: string; label: string; selected: boolean }[] = [
    { value: "going", label: full && mine !== "going" ? "Join waitlist" : "Going", selected: mine === "going" || mine === "waitlist" },
    { value: "maybe", label: "Maybe", selected: mine === "maybe" },
    { value: "declined", label: "Can't make it", selected: mine === "declined" },
  ];
  const summary = mine === "going" ? "You're going." : mine === "waitlist" ? `You're on the waitlist${waitRank ? `, number ${waitRank}` : ""}. We'll email you if a spot opens.` : mine === "maybe" ? "You've said maybe." : mine === "declined" ? "You've said you can't make it." : null;

  return (
    <form action={action} className="grid gap-3">
      {summary ? <p className="t-sub" role="status">{summary}</p> : null}
      {closedReason && !leaving ? <p className="form-error" role="status">{closedReason}</p> : (
        <div className="segmented" role="group" aria-label="RSVP">
          {options.map((o) => (
            <button key={o.value} name="status" value={o.value} className="btn-seg" aria-pressed={o.selected} disabled={pending || (Boolean(closedReason) && o.value !== "declined")} data-active={o.selected}>
              {o.selected ? <Icon name="check" width={16} height={16} /> : null}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
      {leaving ? <button name="status" value="cancelled" className="btn btn-plain" style={{ justifySelf: "start" }} disabled={pending}>{mine === "waitlist" ? "Leave the waitlist" : "Cancel my place"}</button> : null}
      <FormMessage state={state} />
    </form>
  );
}
