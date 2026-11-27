import { randomUUID } from "node:crypto";
import { sysDb, schema } from "@/lib/db";
import type { MembershipRole } from "@/db/constants";

/** Entirely fictional test data. */
export async function makeTenant(slug = `t-${randomUUID().slice(0, 8)}`) {
  const [t] = await sysDb().insert(schema.tenants).values({ slug, name: `Club ${slug}` }).returning();
  return t;
}

export async function makeMember(tenantId: string, o: { role?: MembershipRole; name?: string; email?: string; status?: "active" | "paused" | "left" | "invited" } = {}) {
  const email = o.email ?? `${randomUUID().slice(0, 8)}@example.test`;
  const db = sysDb();
  let [u] = await db.insert(schema.users).values({ email }).onConflictDoNothing().returning();
  if (!u) [u] = await db.select().from(schema.users).where((await import("drizzle-orm")).eq(schema.users.email, email));
  const [m] = await db.insert(schema.memberships).values({ tenantId, userId: u.id, role: o.role ?? "member", status: o.status ?? "active", joinedAt: new Date() }).returning();
  await db.insert(schema.memberProfiles).values({ membershipId: m.id, tenantId, displayName: o.name ?? `Member ${m.id.slice(0, 4)}` });
  await db.insert(schema.notificationPreferences).values({ membershipId: m.id, tenantId });
  return { user: u, membership: m };
}
