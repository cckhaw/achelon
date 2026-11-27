import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { getEvent } from "@/lib/services/events";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, Group, Row } from "@/components/ui";
import { MapsLink, typeLabel } from "@/components/EventBits";
import { Markdown } from "@/components/Markdown";
import { RsvpForm } from "@/components/forms/RsvpForm";
import { viewerFormat } from "@/lib/viewer";
import { canChangeRsvp } from "@/lib/rsvp";

export const metadata: Metadata = { title: "Event" };

export default async function EventPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireMember(tenant, "events.view");
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await withTenant(ctx.tenant.id, (tx) => getEvent(tx, ctx.viewer, id));
  if (!data) notFound();
  const { event: e, counts, attendees, mine, myWaitRank, showNames } = data;
  const base = `/${ctx.tenant.slug}`;
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const when = fmt.event(e.startsAt, e.timezone);
  const full = e.capacity !== null && counts.going >= e.capacity;
  const open = canChangeRsvp({ status: e.status, cutoff: e.rsvpCutoffAt, startsAt: e.startsAt, requested: "going" });
  const going = attendees.filter((a) => a.status === "going");
  const waiting = attendees.filter((a) => a.status === "waitlist");

  return (
    <>
      <PageHeader title={e.title} back={{ href: `${base}/events`, label: "Events" }} action={ctx.can("events.manage") ? <Link href={`${base}/admin/events/${e.id}`} className="btn btn-plain">Manage</Link> : null} />
      <p className="flex flex-wrap gap-1 mb-4">
        <Badge>{typeLabel(e.type)}</Badge>
        {e.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : null}
        {e.status === "draft" ? <Badge tone="muted">Draft: only admins can see this</Badge> : null}
        {e.visibility === "founding_only" ? <Badge tone="muted">Founding members</Badge> : null}
        {e.visibility === "invite_list" ? <Badge tone="muted">By invitation</Badge> : null}
      </p>

      <Group>
        <Row title="When" sub={when.local ? <>Event time: {when.local}</> : undefined} value={<span style={{ textAlign: "right", display: "block" }}>{when.primary}</span>} />
        {e.endsAt ? <Row title="Ends" value={fmt.event(e.endsAt, e.timezone).primary} /> : null}
        {e.locationName || e.locationAddress ? <Row title="Where" sub={e.locationAddress ?? undefined} value={<span style={{ textAlign: "right", display: "block" }}>{e.locationName}</span>} /> : null}
        {e.distanceKm ? <Row title="Distance" value={`${Number(e.distanceKm)} km`} /> : null}
        {e.paceOrLevelNote ? <Row title="Pace / level" value={<span style={{ textAlign: "right", display: "block" }}>{e.paceOrLevelNote}</span>} /> : null}
        {e.capacity !== null ? <Row title="Places" value={`${counts.going} of ${e.capacity} taken`} /> : <Row title="Going" value={String(counts.going)} />}
      </Group>
      <p className="mt-3 flex flex-wrap gap-x-4">
        <MapsLink name={e.locationName} address={e.locationAddress} lat={e.locationLat} lng={e.locationLng} />
        {e.routeUrl ? <a href={e.routeUrl} target="_blank" rel="noopener noreferrer nofollow">Route</a> : null}
        {e.externalUrl ? <a href={e.externalUrl} target="_blank" rel="noopener noreferrer nofollow">Event website</a> : null}
        <a href={`${base}/events/${e.id}/ics`} download>Add to calendar</a>
      </p>

      {e.status === "published" ? (
        <section aria-labelledby="rsvp-h" className="mt-6">
          <h2 id="rsvp-h" className="t-headline mb-2">Your answer</h2>
          <RsvpForm slug={ctx.tenant.slug} eventId={e.id} mine={mine} waitRank={myWaitRank} full={full} closedReason={open.ok ? null : open.reason} />
        </section>
      ) : null}

      {e.description ? <div className="card mt-6" style={{ padding: "1rem 1.25rem" }}><Markdown source={e.description} /></div> : null}

      <Group title={showNames ? `Who's going (${counts.going})` : "Who's going"} id="who" footer={!showNames ? "The organiser shows attendee counts only for this event." : counts.maybe ? `${counts.maybe} more ${counts.maybe === 1 ? "is" : "are"} considering it.` : undefined}>
        {!showNames ? <Row title={`${counts.going} going`} sub={counts.waitlist ? `${counts.waitlist} on the waitlist` : undefined} /> : going.length ? going.map((a) => <Row key={a.membershipId} title={a.name} sub={a.note ?? undefined} />) : <div className="row muted">Nobody yet. Be the first.</div>}
      </Group>
      {showNames && waiting.length ? (
        <Group title={`Waitlist (${waiting.length})`} id="wait">
          {waiting.map((a, i) => <Row key={a.membershipId} title={a.name} value={`#${i + 1}`} />)}
        </Group>
      ) : null}
    </>
  );
}
