import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { getEvent } from "@/lib/services/events";
import { racersForEvent } from "@/lib/services/races";
import { listRecaps } from "@/lib/services/recaps";
import { leaderboard } from "@/lib/strava/service";
import { getProvider } from "@/lib/strava/provider";
import { hasLeaderboard, paceOf, speedOf } from "@/lib/strava/leaderboard";
import { RecapForm } from "@/components/forms/RecapForm";
import { SheetButton } from "@/components/ui/Sheet";
import { deleteRecapAction } from "@/app/[tenant]/events/recap-actions";
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
  const [racers, recaps] = await withTenant(ctx.tenant.id, async (tx) => [data.event.type === "external_race" && ctx.can("races.view") ? await racersForEvent(tx, ctx.viewer, id) : [], await listRecaps(tx, id)] as const);
  const started = data.event.startsAt <= new Date();
  const board = getProvider() && started && hasLeaderboard(data.event.type) ? await leaderboard(ctx.tenant.id, ctx.viewer, id) : [];
  const canRecap = started && data.event.status === "published" && ctx.can("recaps.write") && (ctx.can("events.manage") || data.mine === "going");
  const { event: e, counts, attendees, mine, myWaitRank, showNames } = data;
  const slug = ctx.tenant.slug;
  const base = `/${slug}`;
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

      {racers.length ? (
        <Group title="Members racing" id="racers" footer={<Link href={`${base}/races`}>Open the race board</Link>}>
          {racers.map((r) => <Row key={r.id} title={r.memberName} sub={r.distance ?? undefined} />)}
        </Group>
      ) : null}

      <Group title={showNames ? `Who's going (${counts.going})` : "Who's going"} id="who" footer={!showNames ? "The organiser shows attendee counts only for this event." : counts.maybe ? `${counts.maybe} more ${counts.maybe === 1 ? "is" : "are"} considering it.` : undefined}>
        {!showNames ? <Row title={`${counts.going} going`} sub={counts.waitlist ? `${counts.waitlist} on the waitlist` : undefined} /> : going.length ? going.map((a) => <Row key={a.membershipId} title={a.name} sub={a.note ?? undefined} />) : <div className="row muted">Nobody yet. Be the first.</div>}
      </Group>
      {showNames && waiting.length ? (
        <Group title={`Waitlist (${waiting.length})`} id="wait">
          {waiting.map((a, i) => <Row key={a.membershipId} title={a.name} value={`#${i + 1}`} />)}
        </Group>
      ) : null}
    
      {board.length ? (
        <Group title="Results" id="results" footer="From members' connected Strava accounts. Members choose whether to appear here.">
          {board.map((r, i) => (
            <Row key={r.membershipId} leading={<span className="t-headline" style={{ width: "1.75rem", textAlign: "center" }}>{i + 1}</span>} title={<>{r.name}{r.mine ? " (you)" : ""}</>} sub={`${(r.distanceM / 1000).toFixed(1)} km · ${Math.floor(r.movingTimeS / 3600)}:${String(Math.floor((r.movingTimeS % 3600) / 60)).padStart(2, "0")}:${String(r.movingTimeS % 60).padStart(2, "0")}`} value={e.type === "een_ride" ? `${speedOf(r).toFixed(1)} km/h` : `${Math.floor(paceOf(r) / 60)}:${String(paceOf(r) % 60).padStart(2, "0")} /km`} />
          ))}
        </Group>
      ) : null}

      {started && e.status === "published" ? (
        <section aria-labelledby="recaps-h" className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 id="recaps-h" className="t-title">Recaps</h2>
            {canRecap ? <SheetButton label="Write a recap" title="Write a recap" icon="plus" className="btn btn-tinted btn-sm"><RecapForm slug={ctx.tenant.slug} eventId={e.id} /></SheetButton> : null}
          </div>
          {recaps.length ? recaps.map(({ r, author }) => (
            <article key={r.id} className="card mb-3" style={{ padding: "1rem 1.25rem" }}>
              <p className="t-foot muted mb-2">{author ?? "A member"} · {fmt.date(r.createdAt)}</p>
              <Markdown source={r.bodyMarkdown} />
              {r.photoUrls.length ? <p className="mt-3 flex flex-wrap gap-x-4">{r.photoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow">Photo {i + 1}</a>)}</p> : null}
              {(r.authorMembershipId === ctx.membership.id || ctx.can("events.manage")) ? (
                <form action={deleteRecapAction.bind(null, slug, e.id, r.id)} className="mt-2"><button className="btn btn-plain" style={{ color: "var(--danger)" }}>Delete</button></form>
              ) : null}
            </article>
          )) : <p className="muted">No recaps yet.</p>}
        </section>
      ) : null}
    </>
  );
}
