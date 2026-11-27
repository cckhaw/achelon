import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { sysDb, sysTx, schema } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Everything we hold about one user across communities (self-service export). Owner connection, explicit filters. */
export async function exportUserData(userId: string) {
  const db = sysDb();
  const [user] = await db.select({ id: schema.users.id, email: schema.users.email, createdAt: schema.users.createdAt, lastLoginAt: schema.users.lastLoginAt }).from(schema.users).where(eq(schema.users.id, userId));
  const mems = await db.select({ m: schema.memberships, tenant: schema.tenants.name, slug: schema.tenants.slug }).from(schema.memberships).innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId)).where(eq(schema.memberships.userId, userId));
  const ids = mems.map((r) => r.m.id);
  const none = !ids.length;
  const [profiles, visibility, signups, races, prefs, recaps, results, strava] = none ? [[], [], [], [], [], [], [], []] : await Promise.all([
    db.select().from(schema.memberProfiles).where(inArray(schema.memberProfiles.membershipId, ids)),
    db.select().from(schema.fieldVisibility).where(inArray(schema.fieldVisibility.membershipId, ids)),
    db.select({ s: schema.eventSignups, title: schema.events.title, startsAt: schema.events.startsAt }).from(schema.eventSignups).innerJoin(schema.events, eq(schema.events.id, schema.eventSignups.eventId)).where(inArray(schema.eventSignups.membershipId, ids)),
    db.select().from(schema.raceDeclarations).where(inArray(schema.raceDeclarations.membershipId, ids)),
    db.select().from(schema.notificationPreferences).where(inArray(schema.notificationPreferences.membershipId, ids)),
    db.select().from(schema.eventRecaps).where(inArray(schema.eventRecaps.authorMembershipId, ids)),
    db.select().from(schema.eventResults).where(inArray(schema.eventResults.membershipId, ids)),
    db.select({ membershipId: schema.stravaConnections.membershipId, athleteId: schema.stravaConnections.athleteId, connectedAt: schema.stravaConnections.connectedAt, scope: schema.stravaConnections.scope }).from(schema.stravaConnections).where(inArray(schema.stravaConnections.membershipId, ids)),
  ]);
  await Promise.all(mems.map((r) => sysTx((tx) => audit(tx, { tenantId: r.m.tenantId, actor: r.m.id, action: "member.exported", targetType: "membership", targetId: r.m.id }))));
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    communities: mems.map((r) => ({ name: r.tenant, slug: r.slug, role: r.m.role, status: r.m.status, joinedAt: r.m.joinedAt, lastActiveAt: r.m.lastActiveAt })),
    profiles, fieldVisibility: visibility,
    eventSignups: signups.map((r) => ({ event: r.title, startsAt: r.startsAt, status: r.s.status, note: r.s.note, createdAt: r.s.createdAt })),
    raceDeclarations: races, notificationPreferences: prefs, recapsAuthored: recaps, eventResults: results, stravaConnections: strava,
  };
}

/** Soft delete (D-24): access ends immediately; a purge job removes the data after 30 days. */
export async function deleteAccount(userId: string) {
  await sysTx(async (tx) => {
    const mems = await tx.select().from(schema.memberships).where(eq(schema.memberships.userId, userId));
    await tx.update(schema.users).set({ deletedAt: new Date() }).where(eq(schema.users.id, userId));
    await tx.update(schema.memberships).set({ status: "left", leftAt: new Date() }).where(and(eq(schema.memberships.userId, userId), sql`status <> 'left'`));
    if (mems.length) {
      await tx.execute(sql`UPDATE event_signups SET status = 'cancelled', position = NULL, updated_at = now()
        WHERE membership_id = ANY(${mems.map((m) => m.id)}::uuid[]) AND status IN ('going','waitlist','maybe')
          AND event_id IN (SELECT id FROM events WHERE starts_at > now())`);
      await tx.delete(schema.stravaConnections).where(inArray(schema.stravaConnections.membershipId, mems.map((m) => m.id)));
    }
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx.delete(schema.loginTokens).where(eq(schema.loginTokens.userId, userId));
    for (const m of mems) await audit(tx, { tenantId: m.tenantId, actor: m.id, action: "member.deleted", targetType: "membership", targetId: m.id });
  });
}

/** Hard-deletes personal data 30 days after leaving/deletion. Audit rows keep only the (now dangling) actor id. */
export async function purgeDeparted(retentionDays = 30): Promise<{ memberships: number; users: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  return sysTx(async (tx) => {
    const old = await tx.select({ id: schema.memberships.id, tenantId: schema.memberships.tenantId, userId: schema.memberships.userId })
      .from(schema.memberships).where(and(eq(schema.memberships.status, "left"), lt(schema.memberships.leftAt, cutoff)));
    for (const m of old) await audit(tx, { tenantId: m.tenantId, actor: null, action: "member.purged", targetType: "membership", targetId: m.id });
    if (old.length) await tx.delete(schema.memberships).where(inArray(schema.memberships.id, old.map((m) => m.id)));
    // Users: deleted accounts past retention, or users left with no memberships at all.
    const doomed = await tx.execute<{ id: string }>(sql`
      SELECT u.id FROM users u
       WHERE (u.deleted_at IS NOT NULL AND u.deleted_at < ${cutoff})
          OR (NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
              AND u.created_at < ${cutoff} AND u.deleted_at IS NULL)`);
    const ids = doomed.rows.map((r) => r.id);
    if (ids.length) await tx.delete(schema.users).where(inArray(schema.users.id, ids));
    return { memberships: old.length, users: ids.length };
  });
}
