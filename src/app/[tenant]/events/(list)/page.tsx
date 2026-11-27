import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { listEvents } from "@/lib/services/events";
import { EVENT_TYPES, type EventType } from "@/db/constants";
import { PageHeader } from "@/components/ui/NavBar";
import { SheetButton } from "@/components/ui/Sheet";
import { EmptyState, Group, Row, Segmented } from "@/components/ui";
import { DateTile, StatusBadge, typeLabel } from "@/components/EventBits";
import { viewerFormat } from "@/lib/viewer";
import { formatDate } from "@/lib/time";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Events" };

type SP = { when?: string; type?: string; q?: string; going?: string };

export default async function EventsPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<SP> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const ctx = await requireMember(tenant, "events.view");
  const base = `/${ctx.tenant.slug}`;
  const when = sp.when === "past" ? "past" : "upcoming";
  const type = (EVENT_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as EventType) : undefined;
  const q = sp.q?.slice(0, 60) || undefined;
  const goingOnly = sp.going === "1";
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const events = await withTenant(ctx.tenant.id, (tx) => listEvents(tx, ctx.viewer, { scope: when, type, q, goingOnly }));
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ when, type, q, going: goingOnly ? "1" : undefined, ...o })) if (v) p.set(k, v);
    const s = p.toString();
    return `${base}/events${s ? `?${s}` : ""}`;
  };
  const active = [type, q, goingOnly ? "1" : undefined].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Events"
        action={
          <>
            {ctx.can("events.manage") ? <Link href={`${base}/admin/events/new`} className="btn btn-sm">New event</Link> : null}
            <SheetButton label={active ? `Filter (${active})` : "Filter"} title="Filter events" icon="filter">
              <form method="get" className="grid gap-4">
                <input type="hidden" name="when" value={when} />
                <div>
                  <label className="field-label" htmlFor="f-type">Type</label>
                  <select id="f-type" name="type" className="select" defaultValue={type ?? ""}>
                    <option value="">All types</option>
                    {ctx.settings.allowedEventTypes.map((x) => <option key={x} value={x}>{typeLabel(x)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-q">City or place</label>
                  <input id="f-q" name="q" className="input" defaultValue={q ?? ""} placeholder="Singapore, East Coast Park…" />
                </div>
                <label className="row card">
                  <span className="row-main row-title">Only events I&apos;m going to</span>
                  <input type="checkbox" role="switch" className="switch" name="going" value="1" defaultChecked={goingOnly} />
                </label>
                <button className="btn btn-block">Show events</button>
                <Link href={`${base}/events?when=${when}`} className="btn btn-plain">Clear filters</Link>
              </form>
            </SheetButton>
          </>
        }
      />
      <Segmented label="Time range" items={[{ href: qs({ when: "upcoming" }), label: "Upcoming", active: when === "upcoming" }, { href: qs({ when: "past" }), label: "Past", active: when === "past" }]} />
      {events.length ? (
        <Group>
          {events.map((e) => (
            <Row
              key={e.id}
              href={`${base}/events/${e.id}`}
              leading={<DateTile month={formatDate(e.startsAt, fmt.tz, fmt.locale, { month: "short" })} day={formatDate(e.startsAt, fmt.tz, fmt.locale, { day: "numeric" })} />}
              title={<>{e.title}</>}
              sub={<>{typeLabel(e.type)} · {fmt.event(e.startsAt, e.timezone).primary}{e.locationName ? ` · ${e.locationName}` : ""}</>}
              trailing={<StatusBadge item={e} />}
            />
          ))}
        </Group>
      ) : (
        <div className="mt-6"><EmptyState icon="events" title={when === "past" ? "No past events" : active ? "No events match" : "No upcoming events"} body={active ? "Try clearing the filters." : when === "upcoming" ? t("nav.events") + " your admins publish will appear here." : undefined} /></div>
      )}
    </>
  );
}
