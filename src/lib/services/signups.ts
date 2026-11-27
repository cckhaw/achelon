import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import type { MembershipRole } from "@/db/constants";
import { canChangeRsvp, decideRsvp, promotable, type RsvpRequest } from "@/lib/rsvp";
import { canViewEvent } from "@/lib/event-access";
import { audit } from "@/lib/audit";

export type RsvpResult =
  | { ok: true; status: (typeof schema.eventSignups.$inferSelect)["status"]; promoted: string[]; changed: boolean }
  | { ok: false; reason: string };

export async function countSignups(tx: Tx, eventId: string) {
  const rows = await tx.select({ status: schema.eventSignups.status, n: sql<number>`count(*)::int` }).from(schema.eventSignups).where(eq(schema.eventSignups.eventId, eventId)).groupBy(schema.eventSignups.status);
  const get = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { going: get("going"), waitlist: get("waitlist"), maybe: get("maybe") };
}

/** Promote waitlisted members into free seats, in order. Caller must hold the event row lock. */
export async function promoteWaitlist(tx: Tx, eventId: string, capacity: number | null): Promise<string[]> {
  const c = await countSignups(tx, eventId);
  const n = promotable(capacity, c.going, c.waitlist);
  if (n === 0) return [];
  const next = await tx.select({ id: schema.eventSignups.id, m: schema.eventSignups.membershipId }).from(schema.eventSignups)
    .where(and(eq(schema.eventSignups.eventId, eventId), eq(schema.eventSignups.status, "waitlist")))
    .orderBy(asc(schema.eventSignups.position), asc(schema.eventSignups.createdAt)).limit(n);
  if (!next.length) return [];
  await tx.update(schema.eventSignups).set({ status: "going", position: null, updatedAt: new Date() }).where(inArray(schema.eventSignups.id, next.map((x) => x.id)));
  return next.map((x) => x.m);
}

/**
 * The only place sign-ups change. One transaction; the event row is locked so concurrent RSVPs serialise and capacity
 * can never be exceeded. Returns the members promoted off the waitlist so the caller can notify them.
 */
export async function rsvp(
  tx: Tx,
  who: { tenantId: string; membershipId: string; role: MembershipRole },
  eventId: string,
  requested: RsvpRequest,
  note?: string | null,
  now = new Date(),
): Promise<RsvpResult> {
  const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1).for("update");
  if (!ev) return { ok: false, reason: "Event not found." };
  const [inv] = await tx.select().from(schema.eventInvitees).where(and(eq(schema.eventInvitees.eventId, eventId), eq(schema.eventInvitees.membershipId, who.membershipId))).limit(1);
  if (!canViewEvent({ role: who.role, visibility: ev.visibility, status: ev.status, invited: Boolean(inv), isCreator: ev.createdByMembershipId === who.membershipId })) return { ok: false, reason: "Event not found." };
  const gate = canChangeRsvp({ status: ev.status, cutoff: ev.rsvpCutoffAt, startsAt: ev.startsAt, requested, now });
  if (!gate.ok) return gate;

  const [existing] = await tx.select().from(schema.eventSignups).where(and(eq(schema.eventSignups.eventId, eventId), eq(schema.eventSignups.membershipId, who.membershipId))).limit(1);
  const counts = await countSignups(tx, eventId);
  const out = decideRsvp({ capacity: ev.capacity, goingCount: counts.going, waitlistCount: counts.waitlist, existing: existing?.status ?? null, requested });

  if (out.changed || (note !== undefined && existing && note !== existing.note)) {
    let position: number | null = null;
    if (out.status === "waitlist") {
      position = existing?.position ?? ((await tx.select({ m: sql<number>`coalesce(max(position), 0)::int` }).from(schema.eventSignups).where(eq(schema.eventSignups.eventId, eventId)))[0].m + 1);
    }
    await tx.insert(schema.eventSignups)
      .values({ tenantId: who.tenantId, eventId, membershipId: who.membershipId, status: out.status, position, note: note ?? null })
      .onConflictDoUpdate({ target: [schema.eventSignups.eventId, schema.eventSignups.membershipId], set: { status: out.status, position, ...(note !== undefined ? { note } : {}), updatedAt: new Date() } });
  }
  const promoted = out.freesSeat ? await promoteWaitlist(tx, eventId, ev.capacity) : [];
  return { ok: true, status: out.status, promoted, changed: out.changed };
}

/** Admin: remove someone from an event (frees the seat and promotes). */
export async function adminRemoveAttendee(tx: Tx, actor: { membershipId: string; tenantId: string }, eventId: string, membershipId: string) {
  const [ev] = await tx.select().from(schema.events).where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, actor.tenantId))).limit(1).for("update");
  if (!ev) return { promoted: [] as string[] };
  await tx.update(schema.eventSignups).set({ status: "cancelled", position: null, updatedAt: new Date() }).where(and(eq(schema.eventSignups.eventId, eventId), eq(schema.eventSignups.membershipId, membershipId)));
  const promoted = await promoteWaitlist(tx, eventId, ev.capacity);
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "event.attendee_changed", targetType: "event", targetId: eventId, metadata: { member: membershipId, change: "removed" } });
  return { promoted };
}

/** Admin: put a waitlisted (or any) member straight onto the going list, even above capacity (audited). */
export async function adminForceGoing(tx: Tx, actor: { membershipId: string; tenantId: string }, eventId: string, membershipId: string) {
  const [ev] = await tx.select().from(schema.events).where(and(eq(schema.events.id, eventId), eq(schema.events.tenantId, actor.tenantId))).limit(1).for("update");
  if (!ev) return;
  await tx.insert(schema.eventSignups).values({ tenantId: actor.tenantId, eventId, membershipId, status: "going" })
    .onConflictDoUpdate({ target: [schema.eventSignups.eventId, schema.eventSignups.membershipId], set: { status: "going", position: null, updatedAt: new Date() } });
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "event.attendee_changed", targetType: "event", targetId: eventId, metadata: { member: membershipId, change: "moved_to_going" } });
}

/**
 * A member leaves, is paused or deletes their account: cancel their upcoming sign-ups and promote the waitlists they
 * were blocking. Returns the promotions so callers can notify. Works on tenant or system transactions.
 */
export async function cancelUpcomingSignups(tx: Tx, membershipId: string): Promise<{ eventId: string; promoted: string[] }[]> {
  const mine = await tx.select({ eventId: schema.eventSignups.eventId, capacity: schema.events.capacity }).from(schema.eventSignups)
    .innerJoin(schema.events, eq(schema.events.id, schema.eventSignups.eventId))
    .where(and(eq(schema.eventSignups.membershipId, membershipId), inArray(schema.eventSignups.status, ["going", "waitlist", "maybe"]), sql`${schema.events.startsAt} > now()`))
    .orderBy(asc(schema.events.id)); // consistent lock order
  const out: { eventId: string; promoted: string[] }[] = [];
  for (const m of mine) {
    await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, m.eventId)).for("update");
    await tx.update(schema.eventSignups).set({ status: "cancelled", position: null, updatedAt: new Date() }).where(and(eq(schema.eventSignups.eventId, m.eventId), eq(schema.eventSignups.membershipId, membershipId)));
    out.push({ eventId: m.eventId, promoted: await promoteWaitlist(tx, m.eventId, m.capacity) });
  }
  return out;
}
