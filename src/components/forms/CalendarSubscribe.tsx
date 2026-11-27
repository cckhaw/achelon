"use client";
import { useActionState } from "react";
import { revokeCalendarAction, rotateCalendarAction } from "@/app/[tenant]/calendar/actions";
import { FormMessage } from "@/components/ui";
import { CopyField } from "@/components/ui/CopyField";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function CalendarSubscribe({ slug, status }: { slug: string; status: "none" | "active" | "revoked" }) {
  const [made, make] = useActionState(rotateCalendarAction.bind(null, slug), undefined);
  const [gone, revoke] = useActionState(revokeCalendarAction.bind(null, slug), undefined);
  const url = made?.data?.url;
  return (
    <div className="grid gap-4">
      <p>Subscribe once and EEN events and races appear in Calendar on your iPhone, Mac or Google Calendar, and stay up to date.</p>
      {url ? (
        <>
          <FormMessage state={made} />
          <a className="btn btn-block" href={made!.data!.webcal}>Subscribe on this device</a>
          <CopyField value={url} label="Private calendar link" />
          <p className="t-foot muted">Or in the Calendar app: Add Subscribed Calendar, then paste this link. Anyone with the link can see your calendar, so keep it to yourself.</p>
        </>
      ) : (
        <>
          <p className="muted t-sub">{status === "active" ? "Your private link is active. For your security it can't be shown again; make a new one to see it (the old link stops working)." : status === "revoked" ? "Your link is switched off." : "You don't have a link yet."}</p>
          <form action={make}><FormMessage state={made} /><SubmitButton className="btn btn-block" pendingLabel="Creating…">{status === "active" ? "Make a new private link" : "Create my private link"}</SubmitButton></form>
        </>
      )}
      {status === "active" || url ? (
        <form action={revoke} className="grid gap-2"><FormMessage state={gone} /><SubmitButton className="btn btn-danger" pendingLabel="Switching off…">Switch the link off</SubmitButton></form>
      ) : null}
    </div>
  );
}
