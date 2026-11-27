import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { listAnnouncements } from "@/lib/services/announcements";
import { PageHeader } from "@/components/ui/NavBar";
import { EmptyState } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "directory.view");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const rows = await withTenant(ctx.tenant.id, (tx) => listAnnouncements(tx, ctx.membership.role));
  return (
    <>
      <PageHeader title="Announcements" back={{ href: `/${ctx.tenant.slug}`, label: "Home" }} />
      {rows.length ? rows.map(({ a, author }) => (
        <article key={a.id} className="card mb-4" style={{ padding: "1rem 1.25rem" }}>
          <h2 className="t-headline">{a.subject}</h2>
          <p className="t-foot muted mb-3">{author ?? "Admin"} · {a.sentAt ? fmt.date(a.sentAt) : ""}</p>
          <Markdown source={a.bodyMarkdown} />
        </article>
      )) : <EmptyState icon="mail" title="No announcements yet" body="Messages from your admins appear here, as well as in your email." />}
    </>
  );
}
