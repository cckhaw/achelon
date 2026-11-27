import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import type { EventType, MembershipRole, SignupStatus } from "@/db/constants";
import type { EventInput } from "@/lib/event-validation";
import { canViewEvent } from "@/lib/event-access";
import { audit } from "@/lib/audit";
import { isAdminRole } from "@/lib/rbac";
import { promoteWaitlist } from "./signups";

export type EventRow = typeof schema.events.$inferSelect;
interface Actor { membershipId: string; role: MembershipRole; tenantId: string }
interface Viewer { membershipId: string; role: MembershipRole }

const values = (i: EventInput) => ({
  type: i.type, title: i.title, description: i.description, startsAt: i.startsAt, endsAt: i.endsAt, timezone: i.timezone,
  locationName: i.locationName, locationAddress: i.locationAddress, locationLat: i.locationLat, locationLng: i.locationLng,
  routeUrl: i.routeUrl, distanceKm: i.distanceKm, paceOrLevelNote: i.paceOrLevelNote, capacity: i.capacity,
  rsvpCutoffAt: i.rsvpCutoffAt, visibility: i.visibility, attendeeVisibility: i.attendeeVisibility, status: i.status, externalUrl: i.externalUrl,
});

async function setInvitees(tx: Tx, tenantId: string, eventId: string, ids: string[]) {
  await tx.delete(schema.eventInvitees).where(eq(schema.eventInvitees.eventId, eventId));
  if (ids.length) await tx.insert(schema.eventInvitees).values(ids.map((membershipId) => ({ eventId, membershipId, tenantId })));
}

export async function createEvent(tx: Tx, actor: Actor, input: EventInput): Promise<string> {
  const [row] = await tx.insert(schema.events).values({ tenantId: actor.tenantId, createdByMembershipId: actor.membershipId, ...values(input) }).returning({ id: schema.events.id });
  await setInvitees(tx, actor.tenantId, row.id, input.visibility === "invite_list" ? input.invitees : []);
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: input.status === "published" ? "event.published" : "event.created", targetType: "event", targetId: row.id });
  return row.id;
}

/** Returns promoted member ids (capacity raised) and whether this edit published a draft. */
export async function updateEvent(tx: Tx, actor: Actor, id: string, input: EventInput): Promise<{ promoted: string[]; newlyPublished: boolean } | null> {
  const [cur] = await tx.select().from(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.tenantId, actor.tenantId))).limit(1).for("update");
  if (!cur) return null;
  const keepCancelled = cur.status === "cancelled";
  await tx.update(schema.events).set({ ...values(input), status: keepCancelled ? "cancelled" : input.status }).where(eq(schema.events.id, id));
  await setInvitees(tx, actor.tenantId, id, input.visibility === "invite_list" ? input.invitees : []);
  const promoted = await promoteWaitlist(tx, id, input.capacity);
  const newlyPublished = cur.status === "draft" && !keepCancelled && input.status === "published";
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: newlyPublished ? "event.published" : "event.updated", targetType: "event", targetId: id });
  return { promoted, newlyPublished };
}

export async function cancelEvent(tx: Tx, actor: Actor, id: string): Promise<EventRow | null> {
  const [ev] = await tx.update(schema.events).set({ status: "cancelled" }).where(and(eq(schema.events.id, id), eq(schema.events.tenantId, actor.tenantId))).returning();
  if (ev) await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "event.cancelled", targetType: "event", targetId: id });
  return ev ?? null;
}

export interface EventListItem extends EventRow {
  going: number;
  waitlist: number;
  mine: SignupStatus | null;
}

/** Events the viewer may see (D-29), with counts and the viewer's own status. */
export async function listEvents(tx: Tx, viewer: Viewer, o: { scope: "upcoming" | "past" | "range"; from?: Date; to?: Date; type?: EventType; q?: string; goingOnly?: boolean; limit?: number }): Promise<EventListItem[]> {
  const now = new Date();
  const endExpr = sql`coalesce(${schema.events.endsAt}, ${schema.events.startsAt} + interval '3 hours')`;
  const where = [
    o.scope === "upcoming" ? sql`${endExpr} >= ${now}` : o.scope === "past" ? sql`${endExpr} < ${now}` : and(gte(schema.events.startsAt, o.from!), lt(schema.events.startsAt, o.to!)),
    o.type ? eq(schema.events.type, o.type) : undefined,
    o.q ? sql`(${schema.events.locationName} ILIKE ${"%" + o.q.replace(/[%_]/g, "") + "%"} OR ${schema.events.locationAddress} ILIKE ${"%" + o.q.replace(/[%_]/g, "") + "%"} OR ${schema.events.title} ILIKE ${"%" + o.q.replace(/[%_]/g, "") + "%"})` : undefined,
  ].filter(Boolean);
  const rows = await tx.select().from(schema.events).where(and(...where)).orderBy(o.scope === "past" ? desc(schema.events.startsAt) : asc(schema.events.startsAt)).limit(o.limit ?? 200);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // Sequential on purpose: one transaction = one connection, which runs one query at a time.
  const mine = await tx.select({ e: schema.eventSignups.eventId, s: schema.eventSignups.status }).from(schema.eventSignups).where(and(inArray(schema.eventSignups.eventId, ids), eq(schema.eventSignups.membershipId, viewer.membershipId)));
  const invited = await tx.select({ e: schema.eventInvitees.eventId }).from(schema.eventInvitees).where(and(inArray(schema.eventInvitees.eventId, ids), eq(schema.eventInvitees.membershipId, viewer.membershipId)));
  const counts = await tx.select({ e: schema.eventSignups.eventId, s: schema.eventSignups.status, n: sql<number>`count(*)::int` }).from(schema.eventSignups).where(and(inArray(schema.eventSignups.eventId, ids), inArray(schema.eventSignups.status, ["going", "waitlist"]))).groupBy(schema.eventSignups.eventId, schema.eventSignups.status);
  const mineMap = new Map(mine.map((m) => [m.e, m.s]));
  const invSet = new Set(invited.map((i) => i.e));
  const out: EventListItem[] = [];
  for (const r of rows) {
    if (!canViewEvent({ role: viewer.role, visibility: r.visibility, status: r.status, invited: invSet.has(r.id), isCreator: r.createdByMembershipId === viewer.membershipId })) continue;
    const m = mineMap.get(r.id) ?? null;
    if (o.goingOnly && m !== "going" && m !== "waitlist") continue;
    out.push({ ...r, going: counts.find((c) => c.e === r.id && c.s === "going")?.n ?? 0, waitlist: counts.find((c) => c.e === r.id && c.s === "waitlist")?.n ?? 0, mine: m });
  }
  return out;
}

export interface Attendee { membershipId: string; name: string; status: "going" | "waitlist" | "maybe"; note: string | null }

export async function getEvent(tx: Tx, viewer: Viewer, id: string) {
  const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  if (!ev) return null;
  const [inv] = await tx.select().from(schema.eventInvitees).where(and(eq(schema.eventInvitees.eventId, id), eq(schema.eventInvitees.membershipId, viewer.membershipId))).limit(1);
  if (!canViewEvent({ role: viewer.role, visibility: ev.visibility, status: ev.status, invited: Boolean(inv), isCreator: ev.createdByMembershipId === viewer.membershipId })) return null;
  const rows = await tx.select({ m: schema.eventSignups.membershipId, s: schema.eventSignups.status, note: schema.eventSignups.note, pos: schema.eventSignups.position, at: schema.eventSignups.createdAt, name: schema.memberProfiles.displayName })
    .from(schema.eventSignups).leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.eventSignups.membershipId))
    .where(and(eq(schema.eventSignups.eventId, id), inArray(schema.eventSignups.status, ["going", "waitlist", "maybe"])))
    .orderBy(asc(schema.eventSignups.position), asc(schema.eventSignups.createdAt));
  const counts = { going: rows.filter((r) => r.s === "going").length, waitlist: rows.filter((r) => r.s === "waitlist").length, maybe: rows.filter((r) => r.s === "maybe").length };
  const admin = isAdminRole(viewer.role);
  const showNames = admin || ev.attendeeVisibility === "names";
  const attendees: Attendee[] = showNames ? rows.map((r) => ({ membershipId: r.m, name: r.name ?? "Member", status: r.s as Attendee["status"], note: admin ? r.note : null })) : [];
  const [myRow] = await tx.select({ s: schema.eventSignups.status }).from(schema.eventSignups).where(and(eq(schema.eventSignups.eventId, id), eq(schema.eventSignups.membershipId, viewer.membershipId))).limit(1);
  const mineStatus: SignupStatus | null = myRow?.s ?? null;
  const myWaitRank = mineStatus === "waitlist" ? rows.filter((r) => r.s === "waitlist").findIndex((r) => r.m === viewer.membershipId) + 1 : null;
  const invitees = admin ? await tx.select({ id: schema.eventInvitees.membershipId }).from(schema.eventInvitees).where(eq(schema.eventInvitees.eventId, id)) : [];
  return { event: ev, counts, attendees, mine: mineStatus, myWaitRank, showNames, inviteeIds: invitees.map((i) => i.id) };
}
