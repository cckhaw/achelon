import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { ownProfile } from "@/lib/services/profiles";
import { PageHeader } from "@/components/ui/NavBar";
import { Avatar, Badge, Group, Row } from "@/components/ui";
import { signOutAction } from "@/app/actions/auth";
import { isPlatformOperator } from "@/lib/platform-operator";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Me" };

export default async function MePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant);
  const base = `/${ctx.tenant.slug}`;
  const me = await withTenant(ctx.tenant.id, (tx) => ownProfile(tx, ctx.membership.id));
  const name = me?.data.displayName ?? ctx.user.email;
  return (
    <>
      <PageHeader title="Me" />
      <div className="card" style={{ padding: "1.25rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        <Avatar name={name} url={me?.data.photoUrl} size={64} />
        <div style={{ minWidth: 0 }}>
          <p className="t-title" style={{ overflowWrap: "anywhere" }}>{name}</p>
          <p className="muted" style={{ overflowWrap: "anywhere" }}>{ctx.user.email}</p>
          <p className="mt-1"><Badge>{t(`role.${ctx.membership.role}` as MessageKey)}</Badge></p>
        </div>
      </div>
      <Group>
        <Row href={`${base}/me/profile`} title="Profile and privacy" sub="What you share, and with whom" />
        {ctx.can("directory.view") ? <Row href={`${base}/members/${ctx.membership.id}`} title="How others see me" /> : null}
        <Row href="/account/password" title="Password" sub={ctx.user.hasPassword ? "Change your password" : "Not set yet: choose one to sign in"} />
        <Row href={`${base}/settings`} title="Settings" sub="Email, connections, your data" />
      </Group>
      {ctx.can("races.view") || ctx.can("admin.access") ? (
        <Group title="More" id="more">
          {ctx.can("races.view") ? <Row href={`${base}/races`} title="Race board" /> : null}
          {ctx.can("sponsor.nominate") && ctx.settings.sponsorshipEnabled ? <Row href={`${base}/nominate`} title="Nominate someone" sub="Sponsor a new member" /> : null}
          {ctx.can("directory.view") ? <Row href={`${base}/announcements`} title="Announcements" /> : null}
          {ctx.can("admin.access") ? <Row href={`${base}/admin`} title="Admin" sub="Members, invites, events" /> : null}
        </Group>
      ) : null}
      {isPlatformOperator(ctx.user.email) ? <Group id="platform"><Row href="/platform" title="Platform" sub="Create and manage communities" /></Group> : null}
      <form action={signOutAction} className="mt-8"><button className="btn btn-tinted btn-block">Sign out</button></form>
    </>
  );
}
