import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { listApplications } from "@/lib/services/applications";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, EmptyState, Group, Row } from "@/components/ui";
import { ApplicationActions } from "@/components/forms/ApplicationActions";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Applications · Admin" };

export default async function AdminApplications({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "applications.review");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const rows = await withTenant(ctx.tenant.id, (tx) => listApplications(tx));
  const pending = rows.filter((r) => r.a.status === "pending");
  const done = rows.filter((r) => r.a.status !== "pending");
  return (
    <>
      <PageHeader title="Applications" subtitle={`${pending.length} waiting`} back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} />
      {pending.length ? (
        <Group title="Waiting for review" id="pending">
          {pending.map(({ a, sponsor, isMember }) => (
            <div key={a.id}>
              <Row title={<>{a.name} {isMember ? <Badge tone="warn">Already a member</Badge> : null}</>} sub={<>{a.email}{a.company ? ` · ${a.company}` : ""}<br />Sponsored by {sponsor ?? "a former member"} · {fmt.shortDate(a.createdAt)}</>} />
              {a.message ? <p className="t-sub muted" style={{ padding: "0 1rem 0.5rem", overflowWrap: "anywhere" }}>&ldquo;{a.message}&rdquo;</p> : null}
              <ApplicationActions slug={ctx.tenant.slug} id={a.id} isMember={isMember} />
            </div>
          ))}
        </Group>
      ) : <div className="mt-6"><EmptyState icon="mail" title="No nominations waiting" body="When a member nominates someone, it appears here for your decision." /></div>}
      {done.length ? <Group title="Decided" id="done">{done.map(({ a, sponsor }) => <Row key={a.id} title={<>{a.name} <Badge tone={a.status === "approved" ? "tint" : "muted"}>{a.status}</Badge></>} sub={`Sponsored by ${sponsor ?? "a former member"}`} />)}</Group> : null}
    </>
  );
}
