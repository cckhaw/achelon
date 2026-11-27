import type { EventType } from "@/db/constants";
import type { StravaActivity } from "./provider";

/** Pure matching and ranking for event leaderboards. */
export interface EventLite { id: string; type: EventType; startsAt: Date; endsAt: Date | null }

const RIDE = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"]);
const RUN = new Set(["Run", "TrailRun", "VirtualRun"]);

export const eventSport = (t: EventType): "Ride" | "Run" | null => (t === "een_ride" ? "Ride" : t === "een_run" || t === "external_race" ? "Run" : null);
export const hasLeaderboard = (t: EventType) => eventSport(t) !== null;

/** The activity that started within [start-30min, end] (default 4h) and matches the sport; the closest to the start wins. */
export function matchActivity(ev: EventLite, acts: StravaActivity[]): StravaActivity | null {
  const sport = eventSport(ev.type);
  if (!sport) return null;
  const from = ev.startsAt.getTime() - 30 * 60_000;
  const to = (ev.endsAt ?? new Date(ev.startsAt.getTime() + 4 * 3_600_000)).getTime();
  const ok = acts.filter((a) => (sport === "Ride" ? RIDE : RUN).has(a.type) && a.startDate.getTime() >= from && a.startDate.getTime() <= to && a.distanceM > 0 && a.movingTimeS > 0);
  ok.sort((a, b) => Math.abs(a.startDate.getTime() - ev.startsAt.getTime()) - Math.abs(b.startDate.getTime() - ev.startsAt.getTime()));
  return ok[0] ?? null;
}

export interface ResultRow { membershipId: string; distanceM: number; movingTimeS: number; elevationM: number | null }

/** Runs and races: fastest average pace first. Rides: furthest first, then most climbing. */
export function rankResults<T extends ResultRow>(type: EventType, rows: T[]): T[] {
  const sport = eventSport(type);
  const copy = [...rows];
  if (sport === "Run") copy.sort((a, b) => a.movingTimeS / a.distanceM - b.movingTimeS / b.distanceM);
  else copy.sort((a, b) => b.distanceM - a.distanceM || (b.elevationM ?? 0) - (a.elevationM ?? 0));
  return copy;
}

export const paceOf = (r: ResultRow) => Math.round((r.movingTimeS / r.distanceM) * 1000);
export const speedOf = (r: ResultRow) => (r.distanceM / 1000) / (r.movingTimeS / 3600);
