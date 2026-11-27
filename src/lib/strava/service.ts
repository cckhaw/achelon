import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { canViewEvent } from "@/lib/event-access";
import { isAdminRole } from "@/lib/rbac";
import type { Level, MembershipRole } from "@/db/constants";
import { getProvider, StravaAuthRevoked, type ActivityHint, type StravaProvider, type StravaTokens } from "./provider";
import { computeStats, deriveLevel, isVerified } from "./level";
import { eventSport, hasLeaderboard, matchActivity, rankResults, type ResultRow } from "./leaderboard";

const WINDOW_DAYS = 56; // 8 weeks of activity for the level
const RESULT_LOOKBACK_DAYS = 14;

export async function connectionStatus(tenantId: string, membershipId: string) {
  const [c] = await withTenant(tenantId, (tx) => tx.select({ athleteId: schema.stravaConnections.athleteId, shareResults: schema.stravaConnections.shareResults, derivedLevel: schema.stravaConnections.derivedLevel, connectedAt: schema.stravaConnections.connectedAt, lastSyncAt: schema.stravaConnections.lastSyncAt }).from(schema.stravaConnections).where(eq(schema.stravaConnections.membershipId, membershipId)));
  return c ?? null;
}

export type ConnectResult = { ok: true } | { ok: false; reason: "already_linked" };

/** Store the connection (tokens encrypted). One Strava account can belong to one member per community. */
export async function saveConnection(tenantId: string, membershipId: string, t: StravaTokens, shareResults: boolean): Promise<ConnectResult> {
  return withTenant(tenantId, async (tx) => {
    const [other] = await tx.select({ m: schema.stravaConnections.membershipId }).from(schema.stravaConnections).where(and(eq(schema.stravaConnections.athleteId, t.athleteId), sql`${schema.stravaConnections.membershipId} <> ${membershipId}`)).limit(1);
    if (other) return { ok: false as const, reason: "already_linked" as const };
    const v = { tenantId, membershipId, athleteId: t.athleteId, accessTokenEnc: encryptSecret(t.accessToken), refreshTokenEnc: encryptSecret(t.refreshToken), expiresAt: t.expiresAt, scope: t.scope, shareResults };
    await tx.insert(schema.stravaConnections).values(v).onConflictDoUpdate({ target: schema.stravaConnections.membershipId, set: { athleteId: v.athleteId, accessTokenEnc: v.accessTokenEnc, refreshTokenEnc: v.refreshTokenEnc, expiresAt: v.expiresAt, scope: v.scope, shareResults, connectedAt: new Date() } });
    await tx.update(schema.memberProfiles).set({ stravaAthleteId: t.athleteId }).where(eq(schema.memberProfiles.membershipId, membershipId));
    return { ok: true as const };
  });
}

async function clearConnection(tenantId: string, membershipId: string) {
  await withTenant(tenantId, async (tx) => {
    await tx.delete(schema.stravaConnections).where(eq(schema.stravaConnections.membershipId, membershipId));
    await tx.delete(schema.eventResults).where(eq(schema.eventResults.membershipId, membershipId));
    await tx.update(schema.memberProfiles).set({ stravaAthleteId: null, stravaVerified: false }).where(eq(schema.memberProfiles.membershipId, membershipId));
  });
}

/** Valid access token, refreshing when it is about to expire. A revoked refresh token clears the connection locally. */
async function accessToken(p: StravaProvider, tenantId: string, membershipId: string): Promise<string | null> {
  const [c] = await withTenant(tenantId, (tx) => tx.select().from(schema.stravaConnections).where(eq(schema.stravaConnections.membershipId, membershipId)));
  if (!c) return null;
  if (c.expiresAt.getTime() - Date.now() > 60_000) return decryptSecret(c.accessTokenEnc);
  try {
    const r = await p.refresh(decryptSecret(c.refreshTokenEnc));
    await withTenant(tenantId, (tx) => tx.update(schema.stravaConnections).set({ accessTokenEnc: encryptSecret(r.accessToken), refreshTokenEnc: encryptSecret(r.refreshToken), expiresAt: r.expiresAt }).where(eq(schema.stravaConnections.membershipId, membershipId)));
    return r.accessToken;
  } catch (e) {
    if (e instanceof StravaAuthRevoked) { await clearConnection(tenantId, membershipId); return null; }
    throw e;
  }
}

export interface SyncSummary { activities: number; level: Level | null; verified: boolean; results: number }

/** Pulls recent activity, updates the verified badge and the member's event results. Safe to repeat. */
export async function syncMember(tenantId: string, membershipId: string, now = new Date()): Promise<SyncSummary | null> {
  const p = getProvider();
  if (!p) return null;
  const token = await accessToken(p, tenantId, membershipId);
  if (!token) return null;

  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const ctx = await withTenant(tenantId, async (tx) => {
    const [conn] = await tx.select({ share: schema.stravaConnections.shareResults }).from(schema.stravaConnections).where(eq(schema.stravaConnections.membershipId, membershipId));
    const [prof] = await tx.select({ level: schema.memberProfiles.level }).from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, membershipId));
    const evs = await tx.select({ e: schema.events }).from(schema.eventSignups).innerJoin(schema.events, eq(schema.events.id, schema.eventSignups.eventId))
      .where(and(eq(schema.eventSignups.membershipId, membershipId), eq(schema.eventSignups.status, "going"), eq(schema.events.status, "published"), gte(schema.events.startsAt, since), lt(schema.events.startsAt, now)));
    return { share: conn?.share ?? false, declared: prof?.level ?? null, events: evs.map((x) => x.e) };
  });

  const hints: ActivityHint[] = ctx.events.flatMap((e) => { const s = eventSport(e.type); return s ? [{ start: e.startsAt, type: s }] : []; });
  let acts;
  try {
    acts = await p.listActivities(token, { after: since, before: now }, hints);
  } catch (e) {
    if (e instanceof StravaAuthRevoked) { await clearConnection(tenantId, membershipId); return null; }
    throw e;
  }

  const level = deriveLevel(computeStats(acts, WINDOW_DAYS / 7));
  const verified = isVerified(level, ctx.declared);
  let results = 0;
  await withTenant(tenantId, async (tx) => {
    await tx.update(schema.stravaConnections).set({ derivedLevel: level, lastSyncAt: now }).where(eq(schema.stravaConnections.membershipId, membershipId));
    await tx.update(schema.memberProfiles).set({ stravaVerified: verified }).where(eq(schema.memberProfiles.membershipId, membershipId));
    if (!ctx.share) return;
    for (const e of ctx.events) {
      const endedLongAgo = now.getTime() - (e.endsAt ?? new Date(e.startsAt.getTime() + 4 * 3_600_000)).getTime();
      if (endedLongAgo < 0 || endedLongAgo > RESULT_LOOKBACK_DAYS * 86_400_000) continue;
      const m = matchActivity({ id: e.id, type: e.type, startsAt: e.startsAt, endsAt: e.endsAt }, acts);
      if (!m) continue;
      await tx.insert(schema.eventResults).values({ tenantId, eventId: e.id, membershipId, stravaActivityId: m.id, distanceM: m.distanceM, movingTimeS: m.movingTimeS, elevationM: m.elevationM })
        .onConflictDoUpdate({ target: [schema.eventResults.eventId, schema.eventResults.membershipId], set: { stravaActivityId: m.id, distanceM: m.distanceM, movingTimeS: m.movingTimeS, elevationM: m.elevationM, fetchedAt: now } });
      results++;
    }
  });
  return { activities: acts.length, level, verified, results };
}

export async function setShareResults(tenantId: string, membershipId: string, share: boolean) {
  await withTenant(tenantId, async (tx) => {
    await tx.update(schema.stravaConnections).set({ shareResults: share }).where(eq(schema.stravaConnections.membershipId, membershipId));
    if (!share) await tx.delete(schema.eventResults).where(eq(schema.eventResults.membershipId, membershipId));
  });
}

/** Disconnect: tell Strava (best effort), then erase tokens, results and the badge. */
export async function disconnect(tenantId: string, membershipId: string) {
  const p = getProvider();
  if (p) {
    const token = await accessToken(p, tenantId, membershipId).catch(() => null);
    if (token) await p.deauthorize(token).catch(() => undefined);
  }
  await clearConnection(tenantId, membershipId);
}

export async function syncAllForTenant(tenantId: string): Promise<{ synced: number; failed: number }> {
  const ids = await withTenant(tenantId, async (tx) => (await tx.select({ m: schema.stravaConnections.membershipId }).from(schema.stravaConnections).innerJoin(schema.memberships, eq(schema.memberships.id, schema.stravaConnections.membershipId)).where(eq(schema.memberships.status, "active"))).map((r) => r.m));
  let synced = 0, failed = 0;
  for (const id of ids) {
    try { if (await syncMember(tenantId, id)) synced++; } catch (e) { failed++; console.error("[strava] sync", e instanceof Error ? e.message : e); }
  }
  return { synced, failed };
}

export interface LeaderRow extends ResultRow { name: string; mine: boolean }

/** Results for an ended event. Hidden entirely on "counts only" events (except the viewer's own line) and for non-visible events. */
export async function leaderboard(tenantId: string, viewer: { membershipId: string; role: MembershipRole }, eventId: string): Promise<LeaderRow[]> {
  return withTenant(tenantId, async (tx) => {
    const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId));
    if (!ev || ev.status !== "published" || !hasLeaderboard(ev.type)) return [];
    const [inv] = await tx.select().from(schema.eventInvitees).where(and(eq(schema.eventInvitees.eventId, eventId), eq(schema.eventInvitees.membershipId, viewer.membershipId)));
    if (!canViewEvent({ role: viewer.role, visibility: ev.visibility, status: ev.status, invited: Boolean(inv) })) return [];
    const rows = await tx.select({ r: schema.eventResults, name: schema.memberProfiles.displayName, share: schema.stravaConnections.shareResults, status: schema.memberships.status })
      .from(schema.eventResults)
      .innerJoin(schema.memberships, eq(schema.memberships.id, schema.eventResults.membershipId))
      .innerJoin(schema.stravaConnections, eq(schema.stravaConnections.membershipId, schema.eventResults.membershipId))
      .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.eventResults.membershipId))
      .where(and(eq(schema.eventResults.eventId, eventId), eq(schema.stravaConnections.shareResults, true), eq(schema.memberships.status, "active")))
      .orderBy(asc(schema.eventResults.fetchedAt));
    const showNames = ev.attendeeVisibility === "names" || isAdminRole(viewer.role);
    const all: LeaderRow[] = rows.map(({ r, name }) => ({ membershipId: r.membershipId, distanceM: r.distanceM, movingTimeS: r.movingTimeS, elevationM: r.elevationM, name: name ?? "Member", mine: r.membershipId === viewer.membershipId }));
    return rankResults(ev.type, showNames ? all : all.filter((x) => x.mine));
  });
}

void inArray;
