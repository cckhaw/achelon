import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { listMembers } from "@/lib/services/members";
import { PageHeader } from "@/components/ui/NavBar";
import { Avatar, Badge, EmptyState, Group, Row } from "@/components/ui";
import { viewerFormat } from "@/lib/viewer";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Members · Admin" };

export default async function AdminMembers({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "members.manage");
  const fmt = await viewerFormat(ctx.settings.defaultTimezone);
  const members = await withTenant(ctx.tenant.id, (tx) => listMembers(tx));
  return (
    <>
      <PageHeader back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} title="Members" subtitle={`${members.filter((m) => m.status === "active").length} active`} />
      {members.length ? (
        <Group>
          {members.map((m) => (
            <Row
              key={m.id}
              href={`/${ctx.tenant.slug}/admin/members/${m.id}`}
              leading={<Avatar name={m.name ?? m.email} />}
              title={<>{m.name ?? m.email} <Badge tone={m.status === "active" ? "tint" : m.status === "paused" ? "warn" : "muted"}>{t(`status.${m.status}` as MessageKey)}</Badge></>}
              sub={<>{t(`role.${m.role}` as MessageKey)} · {m.joinedAt ? `joined ${fmt.date(m.joinedAt)}` : "not joined yet"}{m.lastActiveAt ? ` · active ${fmt.date(m.lastActiveAt)}` : ""}</>}
            />
          ))}
        </Group>
      ) : <EmptyState icon="directory" title="No members yet" body="Invite your first members from the Invites screen." />}
    </>
  );
}
