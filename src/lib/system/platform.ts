import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { sysDb, sysTx, schema } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { issueLoginToken } from "@/lib/system/auth";
import { scheduleFlush } from "@/lib/mail/outbox";
import { DEFAULT_TENANT_SETTINGS, DEFAULT_VISIBILITY } from "@/db/constants";
import { isValidTimeZone } from "@/lib/time";
import { emailSchema, slugSchema } from "@/lib/validation";

export { isPlatformOperator } from "@/lib/platform-operator";

export interface CommunitySummary {
  id: string; slug: string; name: string; createdAt: Date; suspendedAt: Date | null;
  members: number; owners: number; events: number; lastActiveAt: Date | null;
}

export async function listCommunities(): Promise<CommunitySummary[]> {
  const rows = await sysDb().execute<{ id: string; slug: string; name: string; created_at: Date; suspended_at: Date | null; members: number; owners: number; events: number; last_active: Date | null }>(sql`
    SELECT t.id, t.slug, t.name, t.created_at, t.suspended_at,
      (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = t.id AND m.status = 'active') AS members,
      (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = t.id AND m.status = 'active' AND m.role = 'owner') AS owners,
      (SELECT count(*)::int FROM events e WHERE e.tenant_id = t.id) AS events,
      (SELECT max(m.last_active_at) FROM memberships m WHERE m.tenant_id = t.id) AS last_active
    FROM tenants t ORDER BY t.created_at`);
  return rows.rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, createdAt: new Date(r.created_at), suspendedAt: r.suspended_at ? new Date(r.suspended_at) : null, members: Number(r.members), owners: Number(r.owners), events: Number(r.events), lastActiveAt: r.last_active ? new Date(r.last_active) : null }));
}

export async function communityBySlug(slug: string) {
  const [t] = await sysDb().select().from(schema.tenants).where(eq(schema.tenants.slug, slug.toLowerCase()));
  if (!t) return null;
  const owners = await sysDb().select({ id: schema.memberships.id, email: schema.users.email, status: schema.memberships.status, name: schema.memberProfiles.displayName })
    .from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.memberships.id))
    .where(and(eq(schema.memberships.tenantId, t.id), eq(schema.memberships.role, "owner")));
  const [summary] = (await listCommunities()).filter((c) => c.id === t.id);
  return { tenant: t, owners, summary };
}

export type PlatformResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

/** Make `email` an active owner of the tenant (creating the account if needed) and email them a link to set a password. */
async function grantOwner(tx: Parameters<Parameters<typeof sysTx>[0]>[0], tenantId: string, email: string): Promise<{ userId: string; created: boolean }> {
  let [u] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
  if (u?.deletedAt) throw new Error("That account was deleted and is waiting to be purged.");
  if (!u) [u] = await tx.insert(schema.users).values({ email }).returning();
  const [ex] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, u.id)));
  let membershipId: string;
  if (ex) {
    membershipId = ex.id;
    await tx.update(schema.memberships).set({ role: "owner", status: "active", leftAt: null, joinedAt: ex.joinedAt ?? new Date() }).where(eq(schema.memberships.id, ex.id));
  } else {
    const [m] = await tx.insert(schema.memberships).values({ tenantId, userId: u.id, role: "owner", status: "active", joinedAt: new Date() }).returning({ id: schema.memberships.id });
    membershipId = m.id;
    await tx.insert(schema.memberProfiles).values({ membershipId, tenantId, displayName: email.split("@")[0] });
    await tx.insert(schema.fieldVisibility).values(Object.entries(DEFAULT_VISIBILITY).map(([f, v]) => ({ membershipId, tenantId, fieldName: f, visibleTo: v })));
    await tx.insert(schema.notificationPreferences).values({ membershipId, tenantId });
  }
  await audit(tx, { tenantId, actor: null, action: "community.owner_added", targetType: "membership", targetId: membershipId, metadata: { platform: true } });
  return { userId: u.id, created: !ex };
}

async function mailOwner(userId: string, email: string, communityName: string) {
  // Same one-time link as "Forgot password": it signs them in and asks them to choose a password.
  await issueLoginToken(userId, randomToken(), email, communityName, "reset");
  await scheduleFlush();
}

export async function createCommunity(input: { slug: string; name: string; ownerEmail: string; timezone: string }): Promise<PlatformResult<{ slug: string }>> {
  const slug = slugSchema.safeParse(input.slug);
  if (!slug.success) return { ok: false, error: slug.error.issues[0]?.message ?? "Invalid slug", field: "slug" };
  const email = emailSchema.safeParse(input.ownerEmail);
  if (!email.success) return { ok: false, error: "Enter a valid email address", field: "ownerEmail" };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter a name of 2 to 80 characters", field: "name" };
  if (!isValidTimeZone(input.timezone)) return { ok: false, error: "Unknown time zone", field: "timezone" };

  const [exists] = await sysDb().select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, slug.data));
  if (exists) return { ok: false, error: "A community with that URL name already exists", field: "slug" };

  let ownerUserId = "";
  try {
    await sysTx(async (tx) => {
      const [t] = await tx.insert(schema.tenants).values({ slug: slug.data, name, settings: { ...DEFAULT_TENANT_SETTINGS, defaultTimezone: input.timezone } }).returning();
      await audit(tx, { tenantId: t.id, actor: null, action: "community.created", targetType: "tenant", targetId: t.id, metadata: { platform: true } });
      ownerUserId = (await grantOwner(tx, t.id, email.data)).userId;
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the community" };
  }
  await mailOwner(ownerUserId, email.data, name);
  return { ok: true, slug: slug.data };
}

export async function addOwner(tenantId: string, ownerEmail: string): Promise<PlatformResult> {
  const email = emailSchema.safeParse(ownerEmail);
  if (!email.success) return { ok: false, error: "Enter a valid email address", field: "ownerEmail" };
  const [t] = await sysDb().select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!t) return { ok: false, error: "Community not found" };
  let userId = "";
  try { await sysTx(async (tx) => { userId = (await grantOwner(tx, tenantId, email.data)).userId; }); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not add the owner" }; }
  await mailOwner(userId, email.data, t.name);
  return { ok: true };
}

export async function setSuspended(tenantId: string, suspended: boolean): Promise<PlatformResult> {
  return sysTx(async (tx) => {
    const [t] = await tx.update(schema.tenants).set({ suspendedAt: suspended ? new Date() : null }).where(eq(schema.tenants.id, tenantId)).returning({ id: schema.tenants.id });
    if (!t) return { ok: false as const, error: "Community not found" };
    await audit(tx, { tenantId, actor: null, action: suspended ? "community.suspended" : "community.reactivated", targetType: "tenant", targetId: tenantId, metadata: { platform: true } });
    return { ok: true as const };
  });
}
