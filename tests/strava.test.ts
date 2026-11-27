import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { computeStats, deriveLevel, isVerified } from "@/lib/strava/level";
import { matchActivity, rankResults } from "@/lib/strava/leaderboard";
import { decodeState, encodeState } from "@/lib/strava/state";
import { getProvider } from "@/lib/strava/provider";
import { mockProvider } from "@/lib/strava/mock";
import { connectionStatus, disconnect, leaderboard, saveConnection, setShareResults, syncMember } from "@/lib/strava/service";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { makeMember, makeTenant } from "./helpers/factory";

afterAll(closePools);

describe("verified level (pure)", () => {
  const ride = (km: number, kmh: number) => ({ type: "Ride", distanceM: km * 1000, movingTimeS: (km / kmh) * 3600 });
  const run = (km: number, pace: number) => ({ type: "Run", distanceM: km * 1000, movingTimeS: km * pace });
  it("needs a minimum amount of data", () => {
    expect(deriveLevel(computeStats([ride(40, 30), ride(40, 30), run(10, 280)]))).toBeNull();
  });
  it("grades competitive, intermediate and social", () => {
    expect(deriveLevel(computeStats(Array.from({ length: 24 }, () => ride(40, 30))))).toBe("competitive"); // 120 km/wk at 30 km/h
    expect(deriveLevel(computeStats(Array.from({ length: 16 }, () => ride(30, 24))))).toBe("intermediate"); // 60 km/wk at 24
    expect(deriveLevel(computeStats(Array.from({ length: 8 }, () => run(8, 280))))).toBe("social"); // fast but only 8 km/wk
    expect(deriveLevel(computeStats(Array.from({ length: 24 }, () => run(10, 290))))).toBe("competitive");
    expect(deriveLevel(computeStats(Array.from({ length: 5 }, () => ride(20, 18))))).toBe("social");
  });
  it("ignores non-endurance activities and junk rows", () => {
    expect(computeStats([{ type: "Yoga", distanceM: 0, movingTimeS: 3600 }, { type: "Ride", distanceM: 0, movingTimeS: 0 }]).activities).toBe(0);
  });
  it("verified means the data supports at least the declared level", () => {
    expect(isVerified("intermediate", "social")).toBe(true);
    expect(isVerified("intermediate", "intermediate")).toBe(true);
    expect(isVerified("social", "competitive")).toBe(false);
    expect(isVerified(null, "social")).toBe(false);
    expect(isVerified("social", null)).toBe(true);
  });
});

describe("leaderboard matching and ranking (pure)", () => {
  const start = new Date("2026-06-07T06:00:00Z");
  const ev = { id: "e", type: "een_ride" as const, startsAt: start, endsAt: new Date("2026-06-07T09:00:00Z") };
  const act = (o: Partial<{ id: number; type: string; startDate: Date; distanceM: number; movingTimeS: number }>) => ({ id: 1, type: "Ride", startDate: start, distanceM: 50_000, movingTimeS: 6000, elevationM: 100, ...o });
  it("matches the right sport inside the window, closest to the start", () => {
    expect(matchActivity(ev, [act({ id: 1, startDate: new Date(start.getTime() + 20 * 60_000) }), act({ id: 2, startDate: new Date(start.getTime() + 5 * 60_000) })])?.id).toBe(2);
    expect(matchActivity(ev, [act({ type: "Run" })])).toBeNull();
    expect(matchActivity(ev, [act({ startDate: new Date(start.getTime() - 3 * 3600_000) })])).toBeNull();
    expect(matchActivity(ev, [act({ startDate: new Date(start.getTime() + 5 * 3600_000) })])).toBeNull();
    expect(matchActivity({ ...ev, type: "een_social" }, [act({})])).toBeNull();
  });
  it("ranks runs by pace and rides by distance", () => {
    const rows = [{ membershipId: "a", distanceM: 10_000, movingTimeS: 3000, elevationM: 0 }, { membershipId: "b", distanceM: 10_000, movingTimeS: 2800, elevationM: 0 }];
    expect(rankResults("een_run", rows).map((r) => r.membershipId)).toEqual(["b", "a"]);
    const rides = [{ membershipId: "a", distanceM: 40_000, movingTimeS: 6000, elevationM: 10 }, { membershipId: "b", distanceM: 60_000, movingTimeS: 9000, elevationM: 5 }];
    expect(rankResults("een_ride", rides).map((r) => r.membershipId)).toEqual(["b", "a"]);
  });
});

describe("OAuth state and secrets", () => {
  it("round-trips and rejects tampering", async () => {
    const s = await encodeState({ slug: "x", userId: "u", membershipId: "m", share: true });
    expect(await decodeState(s)).toEqual({ slug: "x", userId: "u", membershipId: "m", share: true });
    expect(await decodeState(s.slice(0, -3) + "abc")).toBeNull();
    expect(await decodeState("garbage")).toBeNull();
    const [h, p, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ slug: "x", userId: "someone-else", membershipId: "m", share: true })).toString("base64url");
    expect(await decodeState(`${h}.${forged}.${sig}`)).toBeNull();
  });
  it("encrypts tokens with AES-GCM and refuses tampered ciphertext", () => {
    const enc = encryptSecret("tok-123");
    expect(enc).not.toContain("tok-123");
    expect(decryptSecret(enc)).toBe("tok-123");
    expect(() => decryptSecret(enc.slice(0, -2) + "xx")).toThrow();
    expect(encryptSecret("tok-123")).not.toBe(enc); // fresh IV each time
  });
});

describe("mock provider flow (STRAVA_MODE=mock)", () => {
  let T: Awaited<ReturnType<typeof makeTenant>>;
  beforeAll(async () => { T = await makeTenant(); });
  const p = () => getProvider()!;
  const tokens = (n: number) => p().exchangeCode(`mock-${n}`);
  const mkEvent = async (o: Partial<typeof schema.events.$inferInsert> = {}) => (await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Past ride", startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 2 * 86_400_000 + 2 * 3_600_000), timezone: "UTC", status: "published", ...o }).returning())[0];
  const going = (eventId: string, m: Awaited<ReturnType<typeof makeMember>>) => sysDb().insert(schema.eventSignups).values({ tenantId: T.id, eventId, membershipId: m.membership.id, status: "going" });

  it("is on in mock mode and exposes a deterministic athlete", async () => {
    expect(getProvider()?.mode).toBe("mock");
    const a = await mockProvider().listActivities("mock-access-42", { after: new Date(Date.now() - 56 * 86_400_000), before: new Date() });
    const b = await mockProvider().listActivities("mock-access-42", { after: new Date(a[0].startDate.getTime() - 1), before: new Date() });
    expect(a.length).toBeGreaterThan(5);
    expect(b[0].id).toBe(a[0].id);
  });

  it("stores encrypted tokens, links the athlete, and refuses the same Strava account on a second member", async () => {
    const a = await makeMember(T.id); const b = await makeMember(T.id);
    expect(await saveConnection(T.id, a.membership.id, await tokens(7001), true)).toEqual({ ok: true });
    const [row] = await sysDb().select().from(schema.stravaConnections).where(eq(schema.stravaConnections.membershipId, a.membership.id));
    expect(row.accessTokenEnc).toMatch(/^enc:v1:/);
    expect(row.accessTokenEnc).not.toContain("mock-access");
    const [prof] = await sysDb().select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, a.membership.id));
    expect(prof.stravaAthleteId).toBe(7001);
    expect(await saveConnection(T.id, b.membership.id, await tokens(7001), true)).toEqual({ ok: false, reason: "already_linked" });
  });

  it("sync sets level + badge and records an event result once (idempotent)", async () => {
    const a = await makeMember(T.id); await sysDb().update(schema.memberProfiles).set({ level: "social" }).where(eq(schema.memberProfiles.membershipId, a.membership.id));
    const ev = await mkEvent();
    await going(ev.id, a);
    await saveConnection(T.id, a.membership.id, await tokens(7002), true);
    const r1 = await syncMember(T.id, a.membership.id);
    expect(r1?.results).toBe(1);
    expect(r1?.level).not.toBeUndefined();
    const status = await connectionStatus(T.id, a.membership.id);
    expect(status?.lastSyncAt).toBeTruthy();
    await syncMember(T.id, a.membership.id);
    const res = await sysDb().select().from(schema.eventResults).where(eq(schema.eventResults.membershipId, a.membership.id));
    expect(res).toHaveLength(1);
    expect(res[0].distanceM).toBeGreaterThan(30_000);
  });

  it("leaderboard: ranked, opt-out excluded, counts-only hides others, guests see nothing", async () => {
    const ev = await mkEvent({ title: "Ranked ride" });
    const ms = await Promise.all([1, 2, 3].map(() => makeMember(T.id)));
    for (const [i, m] of ms.entries()) { await going(ev.id, m); await saveConnection(T.id, m.membership.id, await tokens(7100 + i * 3), true); await syncMember(T.id, m.membership.id); }
    const viewer = await makeMember(T.id);
    const board = await leaderboard(T.id, { membershipId: viewer.membership.id, role: "member" }, ev.id);
    expect(board).toHaveLength(3);
    for (let i = 1; i < board.length; i++) expect(board[i - 1].distanceM).toBeGreaterThanOrEqual(board[i].distanceM);

    await setShareResults(T.id, ms[0].membership.id, false);
    expect(await leaderboard(T.id, { membershipId: viewer.membership.id, role: "member" }, ev.id)).toHaveLength(2);
    expect((await sysDb().select().from(schema.eventResults).where(eq(schema.eventResults.membershipId, ms[0].membership.id)))).toHaveLength(0);

    await sysDb().update(schema.events).set({ attendeeVisibility: "counts" }).where(eq(schema.events.id, ev.id));
    expect(await leaderboard(T.id, { membershipId: viewer.membership.id, role: "member" }, ev.id)).toHaveLength(0);
    expect(await leaderboard(T.id, { membershipId: ms[1].membership.id, role: "member" }, ev.id)).toHaveLength(1);
    expect(await leaderboard(T.id, { membershipId: (await makeMember(T.id, { role: "owner" })).membership.id, role: "owner" }, ev.id)).toHaveLength(2);

    const guest = await makeMember(T.id, { role: "guest" });
    expect(await leaderboard(T.id, { membershipId: guest.membership.id, role: "guest" }, ev.id)).toHaveLength(0);
  });

  it("no results for events that aren't ride/run, are too old, or when the member opted out", async () => {
    const a = await makeMember(T.id);
    const social = await mkEvent({ type: "een_social" }); const old = await mkEvent({ startsAt: new Date(Date.now() - 30 * 86_400_000), endsAt: new Date(Date.now() - 30 * 86_400_000 + 7_200_000) });
    await going(social.id, a); await going(old.id, a);
    await saveConnection(T.id, a.membership.id, await tokens(7200), true);
    expect((await syncMember(T.id, a.membership.id))?.results).toBe(0);
    const b = await makeMember(T.id); const ev = await mkEvent(); await going(ev.id, b);
    await saveConnection(T.id, b.membership.id, await tokens(7201), false);
    expect((await syncMember(T.id, b.membership.id))?.results).toBe(0);
  });

  it("refreshes an expired token, and clears everything when access was revoked", async () => {
    const a = await makeMember(T.id);
    await saveConnection(T.id, a.membership.id, await tokens(7300), true);
    await sysDb().update(schema.stravaConnections).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.stravaConnections.membershipId, a.membership.id));
    expect(await syncMember(T.id, a.membership.id)).not.toBeNull();
    const [row] = await sysDb().select().from(schema.stravaConnections).where(eq(schema.stravaConnections.membershipId, a.membership.id));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await sysDb().update(schema.stravaConnections).set({ expiresAt: new Date(Date.now() - 1000), refreshTokenEnc: encryptSecret("mock-revoked-7300") }).where(eq(schema.stravaConnections.membershipId, a.membership.id));
    expect(await syncMember(T.id, a.membership.id)).toBeNull();
    expect(await connectionStatus(T.id, a.membership.id)).toBeNull();
  });

  it("disconnect erases tokens, results and the verified badge", async () => {
    const a = await makeMember(T.id); const ev = await mkEvent(); await going(ev.id, a);
    await saveConnection(T.id, a.membership.id, await tokens(7400), true);
    await syncMember(T.id, a.membership.id);
    await disconnect(T.id, a.membership.id);
    expect(await connectionStatus(T.id, a.membership.id)).toBeNull();
    expect(await sysDb().select().from(schema.eventResults).where(eq(schema.eventResults.membershipId, a.membership.id))).toHaveLength(0);
    const [prof] = await sysDb().select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, a.membership.id));
    expect(prof).toMatchObject({ stravaAthleteId: null, stravaVerified: false });
  });

  it("tenant isolation: another community cannot read this community's connections or results", async () => {
    const other = await makeTenant();
    expect(await withTenant(other.id, (tx) => tx.select().from(schema.stravaConnections))).toHaveLength(0);
    expect(await withTenant(other.id, (tx) => tx.select().from(schema.eventResults))).toHaveLength(0);
  });
});
