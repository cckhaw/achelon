import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { listAnnouncements } from "@/lib/services/announcements";
import { PageHeader } from "@/components/ui/NavBar";
import { AnnouncementForm } from "@/components/forms/AnnouncementForm";
import { Group, Row } from "@/components/ui";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Announcements · Admin" };

export default async function AdminAnnouncements({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "announcements.send");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const rows = await withTenant(ctx.tenant.id, (tx) => listAnnouncements(tx, ctx.membership.role, 20));
  return (
    <>
      <PageHeader title="Announcements" back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} />
      <AnnouncementForm slug={ctx.tenant.slug} />
      {rows.length ? <Group title="Sent" id="sent">{rows.map(({ a }) => <Row key={a.id} title={a.subject} sub={`${a.audience.replace("_", " ")} · ${a.sentAt ? fmt.dateTime(a.sentAt) : ""}`} />)}</Group> : null}
    </>
  );
}
