import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { profileFor } from "@/lib/services/profiles";
import { formatPace } from "@/lib/validation";
import { PageHeader } from "@/components/ui/NavBar";
import { Avatar, Badge, Group, Row } from "@/components/ui";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Member" };

export default async function MemberPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireMember(tenant, "directory.view");
  if (!z.uuid().safeParse(id).success) notFound();
  const p = await withTenant(ctx.tenant.id, (tx) => profileFor(tx, ctx.viewer, id));
  if (!p) notFound();
  const self = p.membershipId === ctx.membership.id;
  const base = `/${ctx.tenant.slug}`;

  return (
    <>
      <PageHeader title={p.displayName} back={{ href: `${base}/directory`, label: "Directory" }} />
      <div className="card" style={{ padding: "1.25rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        <Avatar name={p.displayName} url={p.photoUrl} size={64} />
        <div style={{ minWidth: 0 }}>
          <p className="t-title" style={{ overflowWrap: "anywhere" }}>{p.displayName}</p>
          {p.jobTitle || p.company ? <p className="muted">{[p.jobTitle, p.company].filter(Boolean).join(" · ")}</p> : null}
          <p className="mt-1 flex flex-wrap gap-1">
            {p.role === "founding_member" ? <Badge>Founding member</Badge> : null}
            {p.stravaVerified ? <Badge>Strava verified</Badge> : null}
          </p>
        </div>
      </div>
      {p.bio ? <p className="card mt-4" style={{ padding: "1rem 1.25rem" }}>{p.bio}</p> : null}
      <Group title="Details" id="details">
        {p.city || p.country ? <Row title="Location" value={[p.city, p.country].filter(Boolean).join(", ")} /> : null}
        {p.sports?.length ? <Row title="Sports" value={p.sports.map((s) => t(`sport.${s}` as MessageKey)).join(", ")} /> : null}
        {p.level ? <Row title="Level" value={t(`level.${p.level}` as MessageKey)} /> : null}
        {p.typicalPaceRunSecPerKm ? <Row title="Run pace" value={`${formatPace(p.typicalPaceRunSecPerKm)} /km`} /> : null}
        {p.typicalSpeedRideKmh ? <Row title="Ride speed" value={`${p.typicalSpeedRideKmh} km/h`} /> : null}
        {p.openTo?.length ? <Row title="Open to" value={p.openTo.map((o) => t(`openTo.${o}` as MessageKey)).join(", ")} /> : null}
        {p.timezone ? <Row title="Time zone" value={p.timezone} /> : null}
      </Group>
      {self ? <p className="mt-6"><Link className="btn btn-tinted" href={`${base}/me/profile`}>Edit my profile</Link></p> : null}
    </>
  );
}
