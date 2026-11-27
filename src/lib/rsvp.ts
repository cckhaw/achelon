import type { SignupStatus } from "@/db/constants";

/**
 * Pure capacity/waitlist rules (the DB service applies them inside one transaction holding a row lock on the event).
 *
 * - `going` with room and an empty waitlist → going; otherwise → waitlist (FIFO, no queue-jumping).
 * - leaving a `going` spot (maybe / declined / cancelled) frees it and the head of the waitlist is promoted.
 * - a waitlisted member asking for `going` again keeps their place.
 */
export type RsvpRequest = Extract<SignupStatus, "going" | "maybe" | "declined" | "cancelled">;

export interface RsvpContext {
  capacity: number | null;
  goingCount: number;
  waitlistCount: number;
  existing: SignupStatus | null;
  requested: RsvpRequest;
}
export interface RsvpOutcome {
  status: SignupStatus;
  /** True if the member newly joins the waitlist (needs a fresh position). */
  joinsWaitlist: boolean;
  /** True if a `going` seat was freed (caller promotes from the waitlist). */
  freesSeat: boolean;
  changed: boolean;
}

export function decideRsvp(c: RsvpContext): RsvpOutcome {
  const wasGoing = c.existing === "going";
  const wasWaiting = c.existing === "waitlist";

  if (c.requested === "going") {
    if (wasGoing) return { status: "going", joinsWaitlist: false, freesSeat: false, changed: false };
    if (wasWaiting) return { status: "waitlist", joinsWaitlist: false, freesSeat: false, changed: false };
    const hasRoom = c.capacity === null || c.goingCount < c.capacity;
    if (hasRoom && c.waitlistCount === 0) return { status: "going", joinsWaitlist: false, freesSeat: false, changed: true };
    return { status: "waitlist", joinsWaitlist: true, freesSeat: false, changed: true };
  }
  return { status: c.requested, joinsWaitlist: false, freesSeat: wasGoing, changed: c.existing !== c.requested };
}

/** How many waitlisted members can be promoted given current numbers. */
export function promotable(capacity: number | null, goingCount: number, waitlistCount: number): number {
  if (waitlistCount <= 0) return 0;
  if (capacity === null) return waitlistCount;
  return Math.max(0, Math.min(waitlistCount, capacity - goingCount));
}

export function canChangeRsvp(o: { status: string; cutoff: Date | null; startsAt: Date; requested: RsvpRequest; now?: Date }): { ok: true } | { ok: false; reason: string } {
  const now = o.now ?? new Date();
  if (o.status !== "published") return { ok: false, reason: o.status === "cancelled" ? "This event has been cancelled." : "This event isn't open yet." };
  // Leaving is always allowed so spots free up; signing up closes at the cutoff (or at the start).
  if (o.requested === "going" || o.requested === "maybe") {
    if (o.cutoff && now > o.cutoff) return { ok: false, reason: "Sign-ups for this event have closed." };
    if (now > o.startsAt) return { ok: false, reason: "This event has already started." };
  }
  return { ok: true };
}
