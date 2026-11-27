import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { sysDb, schema } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";

/** Resolve a secret feed token to the member it belongs to. Null for unknown, revoked, inactive or deleted. */
export async function resolveCalendarToken(raw: string) {
  const [r] = await sysDb()
    .select({ membershipId: schema.memberships.id, tenantId: schema.memberships.tenantId, role: schema.memberships.role, slug: schema.tenants.slug, tenantName: schema.tenants.name, deletedAt: schema.users.deletedAt })
    .from(schema.calendarTokens)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.calendarTokens.membershipId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.calendarTokens.tokenHash, sha256Hex(raw)), isNull(schema.calendarTokens.revokedAt), eq(schema.memberships.status, "active"), isNull(schema.tenants.suspendedAt)))
    .limit(1);
  if (!r || r.deletedAt) return null;
  return r;
}
