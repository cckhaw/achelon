import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { Avatar, EmptyState, Group, Row } from "@/components/ui";
import { directoryFor } from "@/lib/services/profiles";
import { redirect } from "next/navigation";
import { listEvents } from "@/lib/services/events";
import { listRaces } from "@/lib/services/races";
import { DateTile, StatusBadge, typeLabel } from "@/components/EventBits";
import { viewerFormat } from "@/lib/viewer";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { tenant } = await params;
  const { welcome } = await searchParams;
  const ctx = await requireMember(tenant);
  const base = `/${ctx.tenant.slug}`;
  if (!ctx.can("directory.view")) redirect(`${base}/events`);
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);

  const { mine, next, newest, races } = await withTenant(ctx.tenant.id, async (tx) => {
    const upcoming = await listEvents(tx, ctx.viewer, { scope: "upcoming", limit: 40 });
    const visible = upcoming.filter((e) => e.status === "published");
    return {
      mine: visible.filter((e) => e.mine === "going" || e.mine === "waitlist").slice(0, 3),
      next: visible.filter((e) => e.mine !== "going" && e.mine !== "waitlist").slice(0, 4),
      newest: (await directoryFor(tx, ctx.viewer)).filter((m) => m.membershipId !== ctx.membership.id).sort((a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0)).slice(0, 5),
      races: await listRaces(tx, ctx.viewer, { from: new Date().toISOString().slice(0, 10) }),
    };
  });
  const eventRow = (e: (typeof mine)[number]) => (
    <Row key={e.id} href={`${base}/events/${e.id}`} leading={<DateTile month={formatDate(e.startsAt, fmt.tz, fmt.locale, { month: "short" })} day={formatDate(e.startsAt, fmt.tz, fmt.locale, { day: "numeric" })} />} title={e.title} sub={`${typeLabel(e.type)} · ${fmt.event(e.startsAt, e.timezone).primary}`} trailing={<StatusBadge item={e} />} />
  );
  const otherRaces = races.filter((r) => !r.mine).slice(0, 3);

  return (
    <>
      <PageHeader title={ctx.tenant.name} />
      {welcome ? <p className="form-ok mb-4" role="status">Welcome aboard. Your profile is set up; you can change it any time under Me.</p> : null}
      {mine.length ? <Group title="You're going to" id="mine">{mine.map(eventRow)}</Group> : null}
      {next.length ? <Group title="Coming up" id="next">{next.map(eventRow)}</Group> : !mine.length ? <div className="mt-6"><EmptyState title="Nothing scheduled yet" body="Upcoming rides, runs and races will appear here." icon="events" /></div> : null}
      {next.length || mine.length ? <p className="mt-3"><Link href={`${base}/events`}>All events</Link></p> : null}
      {otherRaces.length ? (
        <Group title="Members' races" id="races">
          {otherRaces.map((r) => <Row key={r.id} href={`${base}/races`} title={r.raceName} sub={`${r.memberName} · ${r.raceDate}`} />)}
        </Group>
      ) : null}
      <Group title="New members" id="new">
        {newest.length ? newest.map((m) => (
          <Row key={m.membershipId} href={`${base}/members/${m.membershipId}`} leading={<Avatar name={m.displayName} url={m.photoUrl} />} title={m.displayName} sub={[m.jobTitle, m.company, m.city].filter(Boolean).join(" · ") || undefined} />
        )) : <div className="row muted">No other members yet.</div>}
      </Group>
      <p className="mt-6"><Link href={`${base}/directory`}>Browse the directory</Link></p>
    </>
  );
}
