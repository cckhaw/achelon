import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { engagementSummary } from "@/lib/services/insights";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, EmptyState, Group, Row } from "@/components/ui";
import { viewerFormat } from "@/lib/viewer";
import { typeLabel } from "@/components/EventBits";

export const metadata: Metadata = { title: "Engagement · Admin" };

export default async function InsightsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "insights.view");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const data = await withTenant(ctx.tenant.id, (tx) => engagementSummary(tx));
  const b = `/${ctx.tenant.slug}/admin`;
  const quiet = data.members.filter((m) => m.state === "quiet").sort((a, c) => (a.lastActiveAt?.getTime() ?? 0) - (c.lastActiveAt?.getTime() ?? 0));
  const stat = (label: string, value: string | number) => (
    <div className="card" style={{ padding: "0.9rem 1rem" }}><p className="t-title">{value}</p><p className="t-foot muted">{label}</p></div>
  );
  return (
    <>
      <PageHeader title="Engagement" back={{ href: b, label: "Admin" }} subtitle="Visible to admins only. Members are told this exists in their Settings." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: "0.75rem" }}>
        {stat("Active in the last 30 days", data.summary.active30)}
        {stat("Gone quiet", data.summary.quiet)}
        {stat("Joined in the last 30 days", data.summary.newMembers)}
        {stat("Events in 90 days", data.summary.events90)}
        {stat("Average going per event", data.summary.avgGoing ?? "–")}
      </div>
      <p className="t-foot muted mt-3">&ldquo;Went&rdquo; means signed up as going to a published event that has since started. &ldquo;Quiet&rdquo; means no sign-in for 30 days and no event for 45, and not new.</p>

      <Group title={`Gone quiet (${quiet.length})`} id="quiet" footer="A friendly nudge from a person works better than an automated email.">
        {quiet.length ? quiet.map((m) => (
          <Row key={m.id} href={`${b}/members/${m.id}`} title={m.name} sub={`Last seen ${m.lastActiveAt ? fmt.date(m.lastActiveAt) : "never"} · last event ${m.lastWentAt ? fmt.date(m.lastWentAt) : "none"}`} />
        )) : <div className="row muted">Nobody has gone quiet.</div>}
      </Group>

      <Group title="Recent events" id="events">
        {data.events.length ? data.events.map((e) => (
          <Row key={e.id} href={`${b}/events/${e.id}`} title={e.title} sub={`${typeLabel(e.type)} · ${fmt.date(e.startsAt)}`} value={`${e.going}${e.capacity ? ` of ${e.capacity}` : ""}${e.waitlist ? ` (+${e.waitlist})` : ""}`} />
        )) : <div className="row muted">No events in the last 90 days.</div>}
      </Group>

      <Group title="Everyone" id="all">
        {data.members.length ? data.members.map((m) => (
          <Row key={m.id} href={`${b}/members/${m.id}`} title={<>{m.name} {m.state === "quiet" ? <Badge tone="warn">Quiet</Badge> : m.state === "new" ? <Badge>New</Badge> : null}</>} sub={`${m.went90} ${m.went90 === 1 ? "event" : "events"} in 90 days · last seen ${m.lastActiveAt ? fmt.shortDate(m.lastActiveAt) : "never"}`} />
        )) : <EmptyState icon="directory" title="No members yet" />}
      </Group>
    </>
  );
}
