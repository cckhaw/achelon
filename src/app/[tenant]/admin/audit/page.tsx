import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { EmptyState, Group, Row } from "@/components/ui";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Audit log · Admin" };

export default async function AuditPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "audit.view");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const rows = await withTenant(ctx.tenant.id, (tx) =>
    tx.select({ a: schema.auditLog, actor: schema.memberProfiles.displayName }).from(schema.auditLog)
      .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.auditLog.actorMembershipId))
      .orderBy(desc(schema.auditLog.at)).limit(200));
  return (
    <>
      <PageHeader back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} title="Audit log" subtitle="The latest 200 actions. Names are shown while the person is a member; history keeps ids only." />
      {rows.length ? (
        <Group>
          {rows.map(({ a, actor }) => (
            <Row key={a.id} title={a.action} sub={<>{actor ?? (a.actorMembershipId ? "Former member" : "System")} · {fmt.dateTime(a.at)}{a.targetType ? ` · ${a.targetType}` : ""}</>} />
          ))}
        </Group>
      ) : <EmptyState icon="calendar" title="Nothing logged yet" />}
    </>
  );
}
