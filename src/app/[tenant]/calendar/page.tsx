import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { listEvents, type EventListItem } from "@/lib/services/events";
import { listRaces, type RaceItem } from "@/lib/services/races";
import { calendarStatus } from "@/lib/services/calendar";
import { addDays, addMonths, keyOf, monthGrid, validMonth } from "@/lib/calendar-grid";
import { dayKey, formatDate, formatTime, zonedLocalToUtc } from "@/lib/time";
import { viewerFormat } from "@/lib/viewer";
import { PageHeader } from "@/components/ui/NavBar";
import { SheetButton } from "@/components/ui/Sheet";
import { Group, Row, Segmented, EmptyState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { CalendarSubscribe } from "@/components/forms/CalendarSubscribe";
import { typeLabel } from "@/components/EventBits";

export const metadata: Metadata = { title: "Calendar" };

type SP = { view?: string; m?: string; day?: string };

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<SP> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const ctx = await requireMember(tenant, "events.view");
  const base = `/${ctx.tenant.slug}`;
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const view = sp.view === "agenda" ? "agenda" : "month";
  const todayKey = dayKey(new Date(), fmt.tz);
  const ym = validMonth(sp.m) ? sp.m : todayKey.slice(0, 7);
  const firstDay = (() => { try { return (new Intl.Locale(fmt.locale) as unknown as { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }).getWeekInfo?.().firstDay ?? (new Intl.Locale(fmt.locale) as unknown as { weekInfo?: { firstDay: number } }).weekInfo?.firstDay ?? 1; } catch { return 1; } })();

  let from: string, to: string;
  let grid: ReturnType<typeof monthGrid> | null = null;
  if (view === "month") { grid = monthGrid(ym, firstDay); from = grid.start; to = addDays(grid.end, 1); } else { from = todayKey; to = addDays(todayKey, 90); }
  const range = { from: zonedLocalToUtc(`${from}T00:00`, fmt.tz), to: zonedLocalToUtc(`${to}T00:00`, fmt.tz) };

  const [status, events, races] = await withTenant(ctx.tenant.id, async (tx) => [
    await calendarStatus(tx, ctx.membership.id),
    (await listEvents(tx, ctx.viewer, { scope: "range", from: range.from, to: range.to, limit: 500 })).filter((e) => e.status !== "draft"),
    await listRaces(tx, ctx.viewer, { from, to: addDays(to, -1) }),
  ] as const);

  const byDay = new Map<string, { events: EventListItem[]; races: RaceItem[] }>();
  const slot = (k: string) => byDay.get(k) ?? (byDay.set(k, { events: [], races: [] }), byDay.get(k)!);
  for (const e of events) slot(dayKey(e.startsAt, fmt.tz)).events.push(e);
  for (const r of races) slot(r.raceDate).races.push(r);

  const q = (o: Record<string, string>) => `${base}/calendar?${new URLSearchParams({ view, m: ym, ...o })}`;
  const subscribe = (
    <SheetButton label="Subscribe" title="Subscribe to the calendar" icon="link"><CalendarSubscribe slug={ctx.tenant.slug} status={!status ? "none" : status.active ? "active" : "revoked"} /></SheetButton>
  );

  const dayList = (k: string) => {
    const d = byDay.get(k);
    if (!d || (!d.events.length && !d.races.length)) return <div className="row muted">Nothing on this day.</div>;
    return (
      <>
        {d.events.map((e) => <Row key={e.id} href={`${base}/events/${e.id}`} title={e.title} sub={`${typeLabel(e.type)} · ${formatTime(e.startsAt, fmt.tz, fmt.locale)}${e.locationName ? ` · ${e.locationName}` : ""}`} trailing={e.status === "cancelled" ? <span className="badge badge-danger">Cancelled</span> : e.mine === "going" ? <span className="badge">Going</span> : undefined} />)}
        {d.races.map((r) => <Row key={r.id} href={`${base}/races`} title={`Race: ${r.raceName}`} sub={r.mine ? "Your race" : r.memberName} />)}
      </>
    );
  };

  return (
    <>
      <PageHeader title="Calendar" action={subscribe} />
      <Segmented label="Calendar view" items={[{ href: q({ view: "month" }), label: "Month", active: view === "month" }, { href: q({ view: "agenda" }), label: "Agenda", active: view === "agenda" }]} />

      {view === "month" && grid ? (() => {
        const selected = sp.day && sp.day >= from && sp.day < to ? sp.day : todayKey.startsWith(ym) ? todayKey : `${ym}-01`;
        const monthName = formatDate(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 15)), "UTC", fmt.locale, { month: "long", year: "numeric" });
        const dow = grid.weeks[0].map((k) => formatDate(new Date(Date.parse(k + "T12:00:00Z")), "UTC", fmt.locale, { weekday: "narrow" }));
        return (
          <section aria-label={monthName} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Link href={q({ m: addMonths(ym, -1), day: "" })} className="btn btn-plain" aria-label="Previous month"><Icon name="chevron" style={{ transform: "scaleX(-1)" }} width={18} height={18} /></Link>
              <h2 className="t-headline" aria-live="polite">{monthName}</h2>
              <Link href={q({ m: addMonths(ym, 1), day: "" })} className="btn btn-plain" aria-label="Next month"><Icon name="chevron" width={18} height={18} /></Link>
            </div>
            <div className="card" style={{ padding: "0.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center" }} aria-hidden="true">
                {dow.map((d, i) => <span key={i} className="t-foot muted" style={{ padding: "0.25rem 0" }}>{d}</span>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {grid.weeks.flat().map((k) => {
                  const d = byDay.get(k);
                  const inMonth = k.startsWith(ym);
                  const n = (d?.events.length ?? 0) + (d?.races.length ?? 0);
                  const label = `${formatDate(new Date(Date.parse(k + "T12:00:00Z")), "UTC", fmt.locale, { weekday: "long", day: "numeric", month: "long" })}${n ? `, ${n} ${n === 1 ? "item" : "items"}` : ""}`;
                  return (
                    <Link key={k} href={q({ day: k })} aria-label={label} aria-current={k === selected ? "date" : undefined} className="cal-cell" data-today={k === todayKey} data-selected={k === selected} data-out={!inMonth}>
                      <span>{Number(k.slice(8))}</span>
                      <span className="cal-dots" aria-hidden="true">{d?.events.slice(0, 3).map((e) => <i key={e.id} />)}{d?.races.length ? <i data-race="1" /> : null}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <Group title={formatDate(new Date(Date.parse(selected + "T12:00:00Z")), "UTC", fmt.locale, { weekday: "long", day: "numeric", month: "long" })} id="day">{dayList(selected)}</Group>
          </section>
        );
      })() : null}

      {view === "agenda" ? (
        <div className="mt-2">
          {[...byDay.entries()].filter(([, v]) => v.events.length || v.races.length).sort(([a], [b]) => a.localeCompare(b)).map(([k]) => (
            <Group key={k} title={formatDate(new Date(Date.parse(k + "T12:00:00Z")), "UTC", fmt.locale, { weekday: "long", day: "numeric", month: "long" })} id={`d-${k}`}>{dayList(k)}</Group>
          ))}
          {![...byDay.values()].some((v) => v.events.length || v.races.length) ? <div className="mt-6"><EmptyState icon="calendar" title="Nothing in the next 90 days" body="New events and declared races will show up here." /></div> : null}
        </div>
      ) : null}
    </>
  );
}
void keyOf;
