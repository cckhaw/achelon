import { and, desc, eq, isNull } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAssignRole } from "@/lib/rbac";
import type { MembershipRole } from "@/db/constants";
import { ForbiddenError } from "@/lib/context";

export const INVITE_TTL_DAYS = 14;

export type InviteStatus = "pending" | "used" | "revoked" | "expired";
export function inviteStatus(i: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InviteStatus {
  if (i.usedAt) return "used";
  if (i.revokedAt) return "revoked";
  if (i.expiresAt.getTime() < now.getTime()) return "expired";
  return "pending";
}

interface Actor { membershipId: string; role: MembershipRole; tenantId: string }

export async function createInvite(
  tx: Tx,
  actor: Actor,
  o: { email?: string | null; role: MembershipRole; sponsorMembershipId?: string | null; note?: string | null; days?: number },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  if (!canAssignRole(actor.role, o.role)) throw new ForbiddenError("You can't grant that role");
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (o.days ?? INVITE_TTL_DAYS) * 86_400_000);
  const [row] = await tx.insert(schema.invites).values({
    tenantId: actor.tenantId, email: o.email ?? null, tokenHash: sha256Hex(token), createdByMembershipId: actor.membershipId,
    sponsorMembershipId: o.sponsorMembershipId ?? null, roleGranted: o.role, expiresAt, note: o.note ?? null,
  }).returning({ id: schema.invites.id });
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "invite.created", targetType: "invite", targetId: row.id, metadata: { role: o.role, bound: Boolean(o.email), sponsored: Boolean(o.sponsorMembershipId) } });
  return { id: row.id, token, expiresAt };
}

export async function listInvites(tx: Tx) {
  const rows = await tx.select().from(schema.invites).orderBy(desc(schema.invites.createdAt)).limit(200);
  return rows.map((i) => ({ ...i, status: inviteStatus(i) }));
}

export async function revokeInvite(tx: Tx, actor: Actor, id: string) {
  const [r] = await tx.update(schema.invites).set({ revokedAt: new Date() })
    .where(and(eq(schema.invites.id, id), eq(schema.invites.tenantId, actor.tenantId))).returning({ id: schema.invites.id });
  if (!r) return false;
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "invite.revoked", targetType: "invite", targetId: id });
  return true;
}

/** New token + fresh expiry for an unused invite (the old link stops working). */
export async function rotateInvite(tx: Tx, actor: Actor, id: string): Promise<{ token: string; email: string | null; note: string | null } | null> {
  const token = randomToken();
  const [r] = await tx.update(schema.invites)
    .set({ tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000) })
    .where(and(eq(schema.invites.id, id), eq(schema.invites.tenantId, actor.tenantId), isNull(schema.invites.usedAt), isNull(schema.invites.revokedAt)))
    .returning({ email: schema.invites.email, note: schema.invites.note });
  if (!r) return null;
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "invite.resent", targetType: "invite", targetId: id });
  return { token, email: r.email ?? null, note: r.note };
}
