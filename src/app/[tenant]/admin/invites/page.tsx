import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { listInvites } from "@/lib/services/invites";
import { PageHeader } from "@/components/ui/NavBar";
import { SheetButton } from "@/components/ui/Sheet";
import { Badge, EmptyState, Group, Row } from "@/components/ui";
import { CreateInviteForm, EmailAllButton, InviteRowActions } from "@/components/forms/AdminForms";
import { canAssignRole } from "@/lib/rbac";
import { MEMBERSHIP_ROLES } from "@/db/constants";
import { viewerFormat } from "@/lib/viewer";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Invites · Admin" };

export default async function AdminInvites({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "invites.manage");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const { invites, sponsors } = await withTenant(ctx.tenant.id, async (tx) => ({
    invites: await listInvites(tx),
    sponsors: await tx.select({ id: schema.memberProfiles.membershipId, name: schema.memberProfiles.displayName }).from(schema.memberProfiles)
      .innerJoin(schema.memberships, eq(schema.memberships.id, schema.memberProfiles.membershipId))
      .where(and(eq(schema.memberships.status, "active"), inArray(schema.memberships.role, ["owner", "admin", "founding_member", "member"]))).orderBy(schema.memberProfiles.displayName),
  }));
  const roles = MEMBERSHIP_ROLES.filter((r) => canAssignRole(ctx.membership.role, r));
  const tone = { pending: "tint", used: "muted", revoked: "danger", expired: "warn" } as const;
  const unsent = invites.some((i) => i.status === "pending" && i.email && !i.emailedAt);
  return (
    <>
      <PageHeader back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} title="Invites" action={<SheetButton label="New invite" title="New invitation" icon="plus" className="btn btn-sm"><CreateInviteForm slug={ctx.tenant.slug} roles={roles} sponsors={sponsors} /></SheetButton>} />
      {unsent ? <div className="mb-4"><EmailAllButton slug={ctx.tenant.slug} /></div> : null}
      {invites.length ? (
        <Group>
          {invites.map((i) => (
            <div key={i.id}>
              <Row
                title={<>{i.email ?? "Link invitation"} <Badge tone={tone[i.status]}>{i.status}</Badge></>}
                sub={<>{t(`role.${i.roleGranted}` as MessageKey)} · created {fmt.shortDate(i.createdAt)}{i.status === "pending" ? ` · expires ${fmt.shortDate(i.expiresAt)}` : ""}{i.email && !i.emailedAt && i.status === "pending" ? " · not emailed yet" : ""}</>}
              />
              <InviteRowActions slug={ctx.tenant.slug} id={i.id} status={i.status} hasEmail={Boolean(i.email)} />
            </div>
          ))}
        </Group>
      ) : <EmptyState icon="mail" title="No invitations yet" body="Create an invitation to bring someone into the community." />}
    </>
  );
}
