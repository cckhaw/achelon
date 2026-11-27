import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { myApplications } from "@/lib/services/applications";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, Group, Row } from "@/components/ui";
import { NominateForm } from "@/components/forms/NominateForm";
import { notFound } from "next/navigation";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Nominate someone" };

export default async function NominatePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "sponsor.nominate");
  if (!ctx.settings.sponsorshipEnabled) notFound();
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const mine = await withTenant(ctx.tenant.id, (tx) => myApplications(tx, ctx.membership.id));
  return (
    <>
      <PageHeader title="Nominate someone" subtitle="Sponsor a person you'd ride or run with. An admin approves each nomination." back={{ href: `/${ctx.tenant.slug}/me`, label: "Me" }} />
      <NominateForm slug={ctx.tenant.slug} />
      {mine.length ? (
        <Group title="Your nominations" id="mine">
          {mine.map((a) => <Row key={a.id} title={<>{a.name} <Badge tone={a.status === "approved" ? "tint" : a.status === "declined" ? "muted" : "warn"}>{a.status}</Badge></>} sub={fmt.date(a.createdAt)} />)}
        </Group>
      ) : null}
    </>
  );
}
