import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sysDb, schema } from "@/lib/db";
import { DEFAULT_TENANT_SETTINGS, type TenantSettings } from "@/db/constants";

export type TenantRow = typeof schema.tenants.$inferSelect;

export async function tenantBySlug(slug: string): Promise<TenantRow | null> {
  const [t] = await sysDb().select().from(schema.tenants).where(eq(schema.tenants.slug, slug.toLowerCase())).limit(1);
  return t ?? null;
}

export function tenantSettings(t: Pick<TenantRow, "settings">): Required<Pick<TenantSettings, "defaultTimezone" | "allowedEventTypes" | "sponsorshipEnabled">> & TenantSettings {
  return { ...DEFAULT_TENANT_SETTINGS, ...(t.settings ?? {}) };
}

export async function membershipFor(userId: string, tenantId: string) {
  const [m] = await sysDb()
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId)))
    .limit(1);
  return m ?? null;
}

/** Communities a user can enter (active or paused rows are listed; pausing only blocks the member area). */
export async function communitiesForUser(userId: string) {
  return sysDb()
    .select({ slug: schema.tenants.slug, name: schema.tenants.name, role: schema.memberships.role, status: schema.memberships.status, membershipId: schema.memberships.id })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(and(eq(schema.memberships.userId, userId), inArray(schema.memberships.status, ["active"]), isNull(schema.tenants.suspendedAt)));
}
