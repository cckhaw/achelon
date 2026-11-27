import "server-only";
import { schema, type Tx } from "@/lib/db";

export type AuditAction =
  | "invite.created" | "invite.revoked" | "invite.resent" | "invite.accepted"
  | "member.role_changed" | "member.paused" | "member.resumed" | "member.removed" | "member.imported"
  | "member.exported" | "member.deleted" | "member.purged"
  | "event.created" | "event.updated" | "event.published" | "event.cancelled" | "event.attendee_changed" | "event.exported"
  | "announcement.sent" | "application.submitted" | "application.approved" | "application.declined"
  | "settings.updated" | "import.applied";

/** Ids only: no names or emails in metadata, so a purge never leaves personal data behind in history (D-24). */
export async function audit(
  tx: Tx,
  e: { tenantId: string; actor: string | null; action: AuditAction; targetType?: string; targetId?: string; metadata?: Record<string, unknown> },
) {
  await tx.insert(schema.auditLog).values({
    tenantId: e.tenantId,
    actorMembershipId: e.actor,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    metadata: e.metadata ?? {},
  });
}
