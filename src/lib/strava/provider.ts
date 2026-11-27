import "server-only";
import { env } from "@/lib/env";
import { liveProvider } from "./live";
import { mockProvider } from "./mock";

/**
 * Strava access behind one interface so the feature can run in three modes (D-14):
 *   off  - hidden, routes 404 (production default until credentials exist)
 *   mock - deterministic fake athlete and activities (local dev, tests, demos)
 *   live - the real API, read-only scopes (read, activity:read)
 */
export interface StravaTokens {
  athleteId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
}

export interface StravaActivity {
  id: number;
  type: string; // Ride, Run, ...
  startDate: Date;
  distanceM: number;
  movingTimeS: number;
  elevationM: number;
}

export interface ActivityHint { start: Date; type: "Ride" | "Run" }

export interface StravaProvider {
  readonly mode: "mock" | "live";
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<StravaTokens>;
  refresh(refreshToken: string): Promise<Omit<StravaTokens, "athleteId" | "scope">>;
  listActivities(accessToken: string, range: { after: Date; before: Date }, hints?: ActivityHint[]): Promise<StravaActivity[]>;
  deauthorize(accessToken: string): Promise<void>;
}

export class StravaAuthRevoked extends Error {
  constructor() {
    super("Strava access was revoked");
    this.name = "StravaAuthRevoked";
  }
}

export const stravaMode = () => env().STRAVA_MODE;

/** The active provider, or null when the feature is off (or live without credentials). */
export function getProvider(): StravaProvider | null {
  const e = env();
  if (e.STRAVA_MODE === "mock") return mockProvider();
  if (e.STRAVA_MODE === "live") return e.STRAVA_CLIENT_ID && e.STRAVA_CLIENT_SECRET ? liveProvider() : null;
  return null;
}
