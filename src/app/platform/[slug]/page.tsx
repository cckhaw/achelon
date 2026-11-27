import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { communityBySlug } from "@/lib/system/platform";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, Group, Row } from "@/components/ui";
import { AddOwnerForm, SuspendForm } from "@/components/forms/PlatformForms";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Community · Platform" };

export default async function CommunityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ created?: string }> }) {
  const { slug } = await params;
  const { created } = await searchParams;
  const c = await communityBySlug(slug);
  if (!c) notFound();
  const fmt = await viewerFormat(c.tenant.settings?.defaultTimezone);
  const s = c.summary;
  return (
    <>
      <PageHeader title={c.tenant.name} back={{ href: "/platform", label: "Communities" }} />
      {created ? <p className="form-ok mb-4" role="status">Community created. The owner has been emailed a link to set a password and sign in.</p> : null}
      <p className="mb-3">{c.tenant.suspendedAt ? <Badge tone="danger">Suspended since {fmt.date(c.tenant.suspendedAt)}</Badge> : <Badge>Active</Badge>}</p>
      <Group>
        <Row title="Address" value={`/${c.tenant.slug}`} />
        <Row title="Created" value={fmt.date(c.tenant.createdAt)} />
        <Row title="Active members" value={String(s?.members ?? 0)} />
        <Row title="Events" value={String(s?.events ?? 0)} />
        <Row title="Last activity" value={s?.lastActiveAt ? fmt.date(s.lastActiveAt) : "None"} />
      </Group>
      <Group title="Owners" id="owners" footer="Operators manage who owns a community. They can't see its members, events or profiles.">
        {c.owners.length ? c.owners.map((o) => <Row key={o.id} title={o.name ?? o.email} sub={o.email} value={o.status} />) : <div className="row muted">No owners.</div>}
      </Group>
      <div className="mt-6"><AddOwnerForm tenantId={c.tenant.id} slug={c.tenant.slug} /></div>
      <div className="mt-10"><SuspendForm tenantId={c.tenant.id} slug={c.tenant.slug} suspended={Boolean(c.tenant.suspendedAt)} /></div>
    </>
  );
}
