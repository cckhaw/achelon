import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { Group, Row, Badge } from "@/components/ui";
import { canAssignRole, canManageMember } from "@/lib/rbac";
import { MEMBERSHIP_ROLES } from "@/db/constants";
import { ChangeRoleForm, StatusButton } from "@/components/forms/AdminForms";
import { viewerFormat } from "@/lib/viewer";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Member · Admin" };

export default async function AdminMember({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireMember(tenant, "members.manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const [m] = await withTenant(ctx.tenant.id, (tx) =>
    tx.select({ m: schema.memberships, name: schema.memberProfiles.displayName, email: schema.users.email })
      .from(schema.memberships).leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.memberships.id))
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.id, id)));
  if (!m) notFound();
  const self = m.m.id === ctx.membership.id;
  const manageable = !self && canManageMember(ctx.membership.role, m.m.role);
  const allowed = MEMBERSHIP_ROLES.filter((r) => canAssignRole(ctx.membership.role, r));
  const b = `/${ctx.tenant.slug}/admin/members`;
  return (
    <>
      <PageHeader title={m.name ?? m.email} back={{ href: b, label: "Members" }} />
      <Group>
        <Row title="Email" value={m.email} />
        <Row title="Status" value={<Badge tone={m.m.status === "active" ? "tint" : "muted"}>{t(`status.${m.m.status}` as MessageKey)}</Badge>} />
        <Row title="Role" value={t(`role.${m.m.role}` as MessageKey)} />
        <Row title="Joined" value={m.m.joinedAt ? fmt.date(m.m.joinedAt) : "Not yet"} />
        <Row title="Last active" value={m.m.lastActiveAt ? fmt.date(m.m.lastActiveAt) : "Never"} />
      </Group>
      {manageable ? (
        <div className="grid gap-6 mt-6">
          <ChangeRoleForm slug={ctx.tenant.slug} id={m.m.id} current={m.m.role} allowed={allowed} />
          <div className="grid gap-3">
            {m.m.status === "active" ? <StatusButton slug={ctx.tenant.slug} id={m.m.id} status="paused" label="Pause membership" /> : null}
            {m.m.status === "paused" ? <StatusButton slug={ctx.tenant.slug} id={m.m.id} status="active" label="Reactivate membership" /> : null}
            {m.m.status !== "left" ? <div style={{ marginTop: "1.5rem" }}><StatusButton slug={ctx.tenant.slug} id={m.m.id} status="left" label="Remove from community" tone="danger" confirmText="Remove this member? Their access ends now and their data is erased after 30 days." /></div> : null}
          </div>
        </div>
      ) : <p className="muted mt-4">{self ? "You can't change your own membership." : "You don't have permission to manage this member."}</p>}
    </>
  );
}
