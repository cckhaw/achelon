import { and, eq } from "drizzle-orm";
import { cancelUpcomingSignups } from "./signups";
import { schema, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canAssignRole, canManageMember } from "@/lib/rbac";
import type { MembershipRole, MembershipStatus } from "@/db/constants";
import { ForbiddenError } from "@/lib/context";

interface Actor { membershipId: string; role: MembershipRole; tenantId: string }

export async function listMembers(tx: Tx) {
  return tx
    .select({
      id: schema.memberships.id, role: schema.memberships.role, status: schema.memberships.status,
      joinedAt: schema.memberships.joinedAt, lastActiveAt: schema.memberships.lastActiveAt,
      name: schema.memberProfiles.displayName, email: schema.users.email,
    })
    .from(schema.memberships)
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.memberships.id))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .orderBy(schema.memberProfiles.displayName);
}

async function target(tx: Tx, actor: Actor, id: string) {
  const [m] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.id, id), eq(schema.memberships.tenantId, actor.tenantId))).limit(1).for("update");
  if (!m) throw new ForbiddenError("Member not found");
  if (m.id === actor.membershipId) throw new ForbiddenError("You can't change your own membership here");
  if (!canManageMember(actor.role, m.role)) throw new ForbiddenError("You can't manage that member");
  return m;
}

export async function changeRole(tx: Tx, actor: Actor, id: string, role: MembershipRole) {
  const m = await target(tx, actor, id);
  if (!canAssignRole(actor.role, role)) throw new ForbiddenError("You can't grant that role");
  if (m.role === "owner" && role !== "owner") await assertAnotherOwner(tx, actor.tenantId, id);
  await tx.update(schema.memberships).set({ role }).where(eq(schema.memberships.id, id));
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "member.role_changed", targetType: "membership", targetId: id, metadata: { from: m.role, to: role } });
}

export async function setStatus(tx: Tx, actor: Actor, id: string, status: Extract<MembershipStatus, "active" | "paused" | "left">) {
  const m = await target(tx, actor, id);
  if (m.role === "owner" && status !== "active") await assertAnotherOwner(tx, actor.tenantId, id);
  await tx.update(schema.memberships).set({ status, leftAt: status === "left" ? new Date() : null, joinedAt: status === "active" && !m.joinedAt ? new Date() : m.joinedAt }).where(eq(schema.memberships.id, id));
  // Leaving members free their capacity: cancel upcoming sign-ups so spots can be promoted.
  if (status === "left" || status === "paused") await cancelUpcomingSignups(tx, id);
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: status === "left" ? "member.removed" : status === "paused" ? "member.paused" : "member.resumed", targetType: "membership", targetId: id });
}

async function assertAnotherOwner(tx: Tx, tenantId: string, excludingId: string) {
  const rows = await tx.select({ id: schema.memberships.id }).from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.role, "owner"), eq(schema.memberships.status, "active")));
  if (!rows.some((r) => r.id !== excludingId)) throw new ForbiddenError("A community needs at least one active owner");
}
