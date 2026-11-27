import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, EmptyState, Group, Row } from "@/components/ui";
import { typeLabel } from "@/components/EventBits";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Events · Admin" };

export default async function AdminEvents({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "events.manage");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const rows = await withTenant(ctx.tenant.id, (tx) => tx.select().from(schema.events).orderBy(desc(schema.events.startsAt)).limit(200));
  const b = `/${ctx.tenant.slug}/admin`;
  return (
    <>
      <PageHeader title="Events" back={{ href: b, label: "Admin" }} action={<Link href={`${b}/events/new`} className="btn btn-sm">New event</Link>} />
      {rows.length ? (
        <Group>
          {rows.map((e) => (
            <Row key={e.id} href={`${b}/events/${e.id}`} title={<>{e.title} <Badge tone={e.status === "published" ? "tint" : e.status === "draft" ? "muted" : "danger"}>{e.status}</Badge></>} sub={`${typeLabel(e.type)} · ${fmt.event(e.startsAt, e.timezone).primary}`} />
          ))}
        </Group>
      ) : <EmptyState icon="events" title="No events yet" body="Create your first ride, run or social." action={<Link href={`${b}/events/new`} className="btn">New event</Link>} />}
    </>
  );
}
