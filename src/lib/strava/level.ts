import type { Level } from "@/db/constants";

/** Pure: infer a training level from the last ~8 weeks of activity (rides and runs only). Thresholds in DECISIONS D-48. */
export interface ActivityLite { type: string; distanceM: number; movingTimeS: number }
export interface LevelStats { activities: number; weeklyRideKm: number; weeklyRunKm: number; avgRideKmh: number | null; avgRunPaceSecPerKm: number | null }

const isRide = (t: string) => t === "Ride" || t === "VirtualRide" || t === "GravelRide" || t === "MountainBikeRide" || t === "EBikeRide";
const isRun = (t: string) => t === "Run" || t === "TrailRun" || t === "VirtualRun";

export function computeStats(acts: ActivityLite[], weeks = 8): LevelStats {
  const rides = acts.filter((a) => isRide(a.type) && a.movingTimeS > 0 && a.distanceM > 1000);
  const runs = acts.filter((a) => isRun(a.type) && a.movingTimeS > 0 && a.distanceM > 500);
  const km = (xs: ActivityLite[]) => xs.reduce((s, a) => s + a.distanceM, 0) / 1000;
  const secs = (xs: ActivityLite[]) => xs.reduce((s, a) => s + a.movingTimeS, 0);
  return {
    activities: rides.length + runs.length,
    weeklyRideKm: km(rides) / weeks,
    weeklyRunKm: km(runs) / weeks,
    avgRideKmh: rides.length ? km(rides) / (secs(rides) / 3600) : null,
    avgRunPaceSecPerKm: runs.length ? secs(runs) / km(runs) : null,
  };
}

export function deriveLevel(s: LevelStats): Level | null {
  if (s.activities < 4) return null; // not enough to say anything
  const rideAt = (kmh: number, wk: number) => s.avgRideKmh !== null && s.avgRideKmh >= kmh && s.weeklyRideKm >= wk;
  const runAt = (pace: number, wk: number) => s.avgRunPaceSecPerKm !== null && s.avgRunPaceSecPerKm <= pace && s.weeklyRunKm >= wk;
  if (rideAt(28, 120) || runAt(300, 30)) return "competitive";
  if (rideAt(23, 60) || runAt(360, 20)) return "intermediate";
  return "social";
}

const RANK: Record<Level, number> = { social: 1, intermediate: 2, competitive: 3 };
/** Verified = the activity data supports at least the level the member declared (or any level if none declared). */
export function isVerified(derived: Level | null, declared: Level | null): boolean {
  if (!derived) return false;
  return RANK[derived] >= RANK[declared ?? "social"];
}
