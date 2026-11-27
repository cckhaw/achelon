import "server-only";
import { env } from "@/lib/env";
import type { StravaActivity, StravaProvider, StravaTokens } from "./provider";
import { StravaAuthRevoked } from "./provider";

const AUTHORIZE = "https://www.strava.com/oauth/authorize";
const TOKEN = "https://www.strava.com/oauth/token";
const DEAUTH = "https://www.strava.com/oauth/deauthorize";
/** Read-only scopes only: profile + the member's own non-private activities. */
export const STRAVA_SCOPE = "read,activity:read";

class StravaHttpError extends Error {
  constructor(readonly status: number, readonly body: string, what: string) {
    super(`Strava ${what} failed: ${status}`);
  }
}

// Strava is moving its REST host on 2027-01-04; overridable like PaceVelo does.
const apiBase = () => (env().STRAVA_API_BASE_URL?.trim() || "https://www.strava.com/api/v3").replace(/\/+$/, "");

async function tokenCall(body: Record<string, string>, what: string) {
  const res = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env().STRAVA_CLIENT_ID, client_secret: env().STRAVA_CLIENT_SECRET, ...body }) });
  if (!res.ok) {
    const text = await res.text();
    // A revoked/invalid refresh token is the athlete leaving; a bad client credential or 5xx is not.
    if ((res.status === 400 || res.status === 401) && text.includes("RefreshToken")) throw new StravaAuthRevoked();
    throw new StravaHttpError(res.status, text, what);
  }
  return (await res.json()) as { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } };
}

export function liveProvider(): StravaProvider {
  return {
    mode: "live",
    authorizeUrl: (state) => `${AUTHORIZE}?${new URLSearchParams({ client_id: env().STRAVA_CLIENT_ID!, redirect_uri: `${env().APP_URL}/api/strava/callback`, response_type: "code", approval_prompt: "auto", scope: STRAVA_SCOPE, state })}`,
    async exchangeCode(code): Promise<StravaTokens> {
      const t = await tokenCall({ code, grant_type: "authorization_code" }, "token exchange");
      if (!t.athlete) throw new Error("Strava did not return an athlete");
      return { athleteId: t.athlete.id, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(t.expires_at * 1000), scope: STRAVA_SCOPE };
    },
    async refresh(refreshToken) {
      const t = await tokenCall({ refresh_token: refreshToken, grant_type: "refresh_token" }, "token refresh");
      return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(t.expires_at * 1000) };
    },
    async listActivities(accessToken, { after, before }) {
      const out: StravaActivity[] = [];
      for (let page = 1; page <= 5; page++) {
        const res = await fetch(`${apiBase()}/athlete/activities?${new URLSearchParams({ after: String(Math.floor(after.getTime() / 1000)), before: String(Math.floor(before.getTime() / 1000)), per_page: "100", page: String(page) })}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.status === 401) throw new StravaAuthRevoked();
        if (!res.ok) throw new StravaHttpError(res.status, await res.text(), "list activities");
        const rows = (await res.json()) as { id: number; type?: string; sport_type?: string; start_date: string; distance: number; moving_time: number; total_elevation_gain: number }[];
        for (const r of rows) out.push({ id: r.id, type: r.sport_type ?? r.type ?? "Other", startDate: new Date(r.start_date), distanceM: Math.round(r.distance), movingTimeS: r.moving_time, elevationM: Math.round(r.total_elevation_gain ?? 0) });
        if (rows.length < 100) break;
      }
      return out;
    },
    async deauthorize(accessToken) {
      const res = await fetch(DEAUTH, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok && res.status !== 401) throw new StravaHttpError(res.status, await res.text(), "deauthorize");
    },
  };
}
