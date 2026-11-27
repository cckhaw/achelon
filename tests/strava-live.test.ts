import { afterEach, describe, expect, it, vi } from "vitest";
import { liveProvider, STRAVA_SCOPE } from "@/lib/strava/live";
import { StravaAuthRevoked } from "@/lib/strava/provider";

afterEach(() => vi.unstubAllGlobals());
const stub = (fn: (url: string, init?: RequestInit) => Response) => vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => fn(String(u), i)));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("live Strava provider (stubbed HTTP)", () => {
  it("asks for read-only scopes only, with a signed state and our callback", () => {
    const u = new URL(liveProvider().authorizeUrl("STATE"));
    expect(u.origin + u.pathname).toBe("https://www.strava.com/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe("read,activity:read");
    expect(STRAVA_SCOPE).not.toMatch(/write|activity:write|read_all/);
    expect(u.searchParams.get("state")).toBe("STATE");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/strava/callback");
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.toString()).not.toContain("test-client-secret");
  });

  it("exchanges a code for tokens and the athlete id", async () => {
    stub(() => json({ access_token: "a", refresh_token: "r", expires_at: 2_000_000_000, athlete: { id: 4242 } }));
    const t = await liveProvider().exchangeCode("code");
    expect(t).toMatchObject({ athleteId: 4242, accessToken: "a", refreshToken: "r" });
    expect(t.expiresAt.getTime()).toBe(2_000_000_000_000);
  });

  it("treats a rejected refresh token as 'athlete revoked access' but not a server error or bad client credentials", async () => {
    stub(() => json({ message: "Bad Request", errors: [{ resource: "RefreshToken", field: "refresh_token", code: "invalid" }] }, 400));
    await expect(liveProvider().refresh("r")).rejects.toBeInstanceOf(StravaAuthRevoked);
    stub(() => json({ message: "Authorization Error", errors: [{ resource: "Application", code: "invalid" }] }, 401));
    await expect(liveProvider().refresh("r")).rejects.not.toBeInstanceOf(StravaAuthRevoked);
    stub(() => new Response("boom", { status: 503 }));
    await expect(liveProvider().refresh("r")).rejects.not.toBeInstanceOf(StravaAuthRevoked);
  });

  it("lists activities with paging and a bearer token, mapping fields", async () => {
    const calls: string[] = [];
    stub((url, init) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      const page = Number(new URL(url).searchParams.get("page"));
      const rows = Array.from({ length: page === 1 ? 100 : 3 }, (_, i) => ({ id: page * 1000 + i, sport_type: "Ride", start_date: "2026-05-03T06:00:00Z", distance: 40_000.4, moving_time: 5000, total_elevation_gain: 120.6 }));
      return json(rows);
    });
    const acts = await liveProvider().listActivities("tok", { after: new Date("2026-04-01"), before: new Date("2026-06-01") });
    expect(acts).toHaveLength(103);
    expect(calls).toHaveLength(2);
    expect(acts[0]).toMatchObject({ type: "Ride", distanceM: 40000, movingTimeS: 5000, elevationM: 121 });
  });

  it("a 401 while listing means access was revoked", async () => {
    stub(() => new Response("", { status: 401 }));
    await expect(liveProvider().listActivities("tok", { after: new Date(), before: new Date() })).rejects.toBeInstanceOf(StravaAuthRevoked);
  });

  it("deauthorize tolerates an already-revoked token", async () => {
    stub(() => new Response("", { status: 401 }));
    await expect(liveProvider().deauthorize("tok")).resolves.toBeUndefined();
  });
});
