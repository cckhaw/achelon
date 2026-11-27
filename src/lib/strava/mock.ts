import "server-only";
import { env } from "@/lib/env";
import type { ActivityHint, StravaActivity, StravaProvider, StravaTokens } from "./provider";
import { StravaAuthRevoked } from "./provider";

/** Small deterministic PRNG so the mock athlete is stable per athlete id. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** The fake athlete is derived from the code: "mock-<n>" → athlete n. No network, no real data. */
export function mockProvider(): StravaProvider {
  return {
    mode: "mock",
    // Skips Strava entirely: straight back to our callback with a mock code.
    authorizeUrl: (state) => `${env().APP_URL}/api/strava/callback?${new URLSearchParams({ code: `mock-${100000 + Math.floor(Math.random() * 899999)}`, state })}`,
    async exchangeCode(code): Promise<StravaTokens> {
      const n = Number(/^mock-(\d+)$/.exec(code)?.[1]);
      if (!Number.isFinite(n)) throw new Error("Invalid mock code");
      return { athleteId: n, accessToken: `mock-access-${n}`, refreshToken: `mock-refresh-${n}`, expiresAt: new Date(Date.now() + 6 * 3600_000), scope: "read,activity:read" };
    },
    async refresh(refreshToken) {
      if (refreshToken.includes("revoked")) throw new StravaAuthRevoked(); // test hook: simulates the athlete revoking access
      return { accessToken: `mock-access-${refreshToken.replace(/\D/g, "")}`, refreshToken, expiresAt: new Date(Date.now() + 6 * 3600_000) };
    },
    async listActivities(accessToken, { after, before }, hints = []) {
      const athlete = Number(accessToken.replace(/\D/g, "")) || 1;
      const r = rng(athlete);
      // Athlete style: pace and speed are stable per athlete.
      const kmh = 22 + (athlete % 11); // 22..32 km/h
      const pace = 270 + (athlete % 7) * 25; // 4:30..7:00 /km
      const out: StravaActivity[] = [];
      const days = Math.max(0, Math.floor((before.getTime() - after.getTime()) / 86_400_000));
      for (let d = 0; d < days; d++) {
        if (r() > 0.55) continue;
        const ride = r() > 0.45;
        const start = new Date(after.getTime() + d * 86_400_000 + 6 * 3_600_000);
        const dist = ride ? 30_000 + r() * 60_000 : 6_000 + r() * 12_000;
        out.push({ id: athlete * 100_000 + d, type: ride ? "Ride" : "Run", startDate: start, distanceM: Math.round(dist), movingTimeS: Math.round(ride ? dist / (kmh / 3.6) : (dist / 1000) * pace), elevationM: Math.round(dist / 100 * (ride ? 0.8 : 0.5)) });
      }
      // Demo anchor: one matching activity per event the caller is interested in, so leaderboards can be exercised.
      for (const [i, h] of hints.entries()) {
        const dist = h.type === "Ride" ? 45_000 + (athlete % 9) * 3_000 : 10_000 + (athlete % 5) * 1_000;
        out.push({ id: athlete * 100_000 + 50_000 + i, type: h.type, startDate: new Date(h.start.getTime() + 3 * 60_000), distanceM: dist, movingTimeS: Math.round(h.type === "Ride" ? dist / (kmh / 3.6) : (dist / 1000) * pace), elevationM: Math.round(dist / 150) });
      }
      return out.filter((a) => a.startDate >= after && a.startDate < before);
    },
    async deauthorize() {},
  };
}
