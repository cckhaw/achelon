import type { Metadata } from "next";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { listRaces } from "@/lib/services/races";
import { groupRaces } from "@/lib/services/race-board";
import { PageHeader } from "@/components/ui/NavBar";
import { SheetButton } from "@/components/ui/Sheet";
import { Badge, EmptyState, Group, Row } from "@/components/ui";
import { DeclareRaceForm, JoinRaceButton, MyRaceControls } from "@/components/forms/RaceForms";
import { viewerFormat } from "@/lib/viewer";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Race board" };

export default async function RacesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "races.view");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const today = new Date().toISOString().slice(0, 10);
  const { races, clubRaces } = await withTenant(ctx.tenant.id, async (tx) => ({
    races: await listRaces(tx, ctx.viewer, { from: today }),
    clubRaces: await tx.select({ id: schema.events.id, title: schema.events.title }).from(schema.events).where(and(eq(schema.events.type, "external_race"), eq(schema.events.status, "published"), gte(schema.events.startsAt, sql`now()`))).orderBy(asc(schema.events.startsAt)),
  }));
  const groups = groupRaces(races);
  const mine = races.filter((r) => r.mine);
  const day = (d: string) => formatDate(new Date(d + "T12:00:00Z"), "UTC", fmt.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const base = `/${ctx.tenant.slug}`;

  return (
    <>
      <PageHeader title="Race board" subtitle="Races members are entering. Join one, or add your own." action={<SheetButton label="Add race" title="Add a race" icon="plus" className="btn btn-sm"><DeclareRaceForm slug={ctx.tenant.slug} races={clubRaces.map((r) => ({ id: r.id, title: r.title }))} /></SheetButton>} />
      {groups.length ? groups.map((g) => {
        const iAmIn = g.entries.some((e) => e.mine);
        const source = g.entries.find((e) => !e.mine) ?? g.entries[0];
        return (
          <Group key={g.key} id={g.key.replace(/\W/g, "")} title={day(g.raceDate)}>
            <Row title={<>{g.raceName} {iAmIn ? <Badge>You&apos;re going</Badge> : null}</>} sub={[g.location, g.distances.join(" / ")].filter(Boolean).join(" · ") || undefined} href={g.externalEventId ? `${base}/events/${g.externalEventId}` : undefined} />
            {g.entries.map((e) => <Row key={e.id} title={e.memberName} sub={e.mine ? "You" : undefined} value={e.distance ?? undefined} />)}
            {!iAmIn ? <div style={{ padding: "0.5rem 1rem 0.75rem" }}><JoinRaceButton slug={ctx.tenant.slug} sourceId={source.id} /></div> : null}
          </Group>
        );
      }) : <div className="mt-6"><EmptyState icon="races" title="No races yet" body="Add the next race you're entering and others can join you." /></div>}

      {mine.length ? (
        <Group title="My races" id="mine" footer="Goal times are only ever visible to you.">
          {mine.map((r) => (
            <div key={r.id}>
              <Row title={r.raceName} sub={`${day(r.raceDate)}${r.goalTime ? ` · goal ${r.goalTime}` : ""}`} value={r.visibleTo === "members" ? "Members" : "Only me"} />
              <MyRaceControls slug={ctx.tenant.slug} id={r.id} visibleTo={r.visibleTo} />
            </div>
          ))}
        </Group>
      ) : null}
    </>
  );
}
