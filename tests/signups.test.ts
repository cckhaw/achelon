import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, asc } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { rsvp, countSignups, adminRemoveAttendee } from "@/lib/services/signups";
import { listEvents, getEvent, updateEvent } from "@/lib/services/events";
import { setStatus } from "@/lib/services/members";
import { parseEventForm } from "@/lib/event-validation";
import { makeMember, makeTenant } from "./helpers/factory";

let T: Awaited<ReturnType<typeof makeTenant>>;
let admin: Awaited<ReturnType<typeof makeMember>>;
const soon = () => new Date(Date.now() + 3 * 86_400_000);

async function makeEvent(o: Partial<typeof schema.events.$inferInsert> = {}) {
  const [e] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Ride", startsAt: soon(), timezone: "UTC", status: "published", capacity: 3, ...o }).returning();
  return e;
}
async function members(n: number, role: "member" | "founding_member" | "guest" = "member") {
  return Promise.all(Array.from({ length: n }, (_, i) => makeMember(T.id, { role, name: `Person ${i}` })));
}
const go = (m: Awaited<ReturnType<typeof makeMember>>, eventId: string, status: "going" | "maybe" | "declined" | "cancelled" = "going") =>
  withTenant(T.id, (tx) => rsvp(tx, { tenantId: T.id, membershipId: m.membership.id, role: m.membership.role }, eventId, status));

beforeAll(async () => {
  T = await makeTenant();
  admin = await makeMember(T.id, { role: "owner" });
});
afterAll(closePools);

describe("capacity and waitlist (DB, one transaction)", () => {
  it("never exceeds capacity under concurrent RSVPs; waitlist positions are unique", async () => {
    const e = await makeEvent({ capacity: 3 });
    const ms = await members(12);
    const results = await Promise.all(ms.map((m) => go(m, e.id)));
    expect(results.every((r) => r.ok)).toBe(true);
    const c = await withTenant(T.id, (tx) => countSignups(tx, e.id));
    expect(c).toMatchObject({ going: 3, waitlist: 9 });
    const wl = await sysDb().select().from(schema.eventSignups).where(and(eq(schema.eventSignups.eventId, e.id), eq(schema.eventSignups.status, "waitlist")));
    expect(new Set(wl.map((w) => w.position)).size).toBe(9);
  });

  it("promotes the waitlist in FIFO order when someone leaves", async () => {
    const e = await makeEvent({ capacity: 2 });
    const [a, b, c, d] = await members(4);
    for (const m of [a, b, c, d]) await go(m, e.id);
    const r = await go(a, e.id, "declined");
    expect(r.ok && r.promoted).toEqual([c.membership.id]);
    const r2 = await go(b, e.id, "cancelled");
    expect(r2.ok && r2.promoted).toEqual([d.membership.id]);
    const rows = await sysDb().select().from(schema.eventSignups).where(eq(schema.eventSignups.eventId, e.id)).orderBy(asc(schema.eventSignups.createdAt));
    expect(rows.filter((x) => x.status === "going").map((x) => x.membershipId).sort()).toEqual([c.membership.id, d.membership.id].sort());
  });

  it("is idempotent: repeated going does not duplicate or reshuffle", async () => {
    const e = await makeEvent({ capacity: 1 });
    const [a, b] = await members(2);
    await go(a, e.id); await go(b, e.id);
    await go(b, e.id); await go(a, e.id);
    const rows = await sysDb().select().from(schema.eventSignups).where(eq(schema.eventSignups.eventId, e.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.membershipId === a.membership.id)?.status).toBe("going");
    expect(rows.find((r) => r.membershipId === b.membership.id)?.status).toBe("waitlist");
  });

  it("raising capacity promotes waitlisted members", async () => {
    const e = await makeEvent({ capacity: 1 });
    const [a, b, c] = await members(3);
    for (const m of [a, b, c]) await go(m, e.id);
    const parsed = parseEventForm({ type: "een_ride", title: "Ride", timezone: "UTC", start: "2030-01-01T08:00", capacity: "3", visibility: "all_members", attendeeVisibility: "names", status: "published", invitees: [] }, ["een_ride"]);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const res = await withTenant(T.id, (tx) => updateEvent(tx, { membershipId: admin.membership.id, role: "owner", tenantId: T.id }, e.id, parsed.value));
    expect(res?.promoted).toHaveLength(2);
    expect((await withTenant(T.id, (tx) => countSignups(tx, e.id))).going).toBe(3);
  });

  it("admin removal frees a seat and promotes", async () => {
    const e = await makeEvent({ capacity: 1 });
    const [a, b] = await members(2);
    await go(a, e.id); await go(b, e.id);
    const r = await withTenant(T.id, (tx) => adminRemoveAttendee(tx, { membershipId: admin.membership.id, tenantId: T.id }, e.id, a.membership.id));
    expect(r.promoted).toEqual([b.membership.id]);
  });

  it("pausing/removing a member cancels upcoming sign-ups and promotes", async () => {
    const e = await makeEvent({ capacity: 1 });
    const [a, b] = await members(2);
    await go(a, e.id); await go(b, e.id);
    await withTenant(T.id, (tx) => setStatus(tx, { membershipId: admin.membership.id, role: "owner", tenantId: T.id }, a.membership.id, "left"));
    const rows = await sysDb().select().from(schema.eventSignups).where(eq(schema.eventSignups.eventId, e.id));
    expect(rows.find((r) => r.membershipId === a.membership.id)?.status).toBe("cancelled");
    expect(rows.find((r) => r.membershipId === b.membership.id)?.status).toBe("going");
  });

  it("enforces cutoff for joining, still allows leaving", async () => {
    const e = await makeEvent({ capacity: 5, rsvpCutoffAt: new Date(Date.now() - 1000) });
    const [a] = await members(1);
    expect(await go(a, e.id)).toMatchObject({ ok: false });
    await sysDb().insert(schema.eventSignups).values({ tenantId: T.id, eventId: e.id, membershipId: a.membership.id, status: "going" });
    expect(await go(a, e.id, "cancelled")).toMatchObject({ ok: true, status: "cancelled" });
  });

  it("rejects drafts and cancelled events", async () => {
    const draft = await makeEvent({ status: "draft" });
    const cancelled = await makeEvent({ status: "cancelled" });
    const [a] = await members(1);
    expect(await go(a, draft.id)).toMatchObject({ ok: false });
    expect(await go(a, cancelled.id)).toMatchObject({ ok: false });
  });
});

describe("event audience (visibility) at the data layer", () => {
  it("founding_only and invite_list are invisible to others, in lists and by id, and can't be RSVP'd", async () => {
    const founding = await makeEvent({ title: "Founders ride", visibility: "founding_only" });
    const invite = await makeEvent({ title: "Private dinner", visibility: "invite_list" });
    const open = await makeEvent({ title: "Open ride" });
    const [mem] = await members(1);
    const [fnd] = await members(1, "founding_member");
    const [gst] = await members(1, "guest");
    await sysDb().insert(schema.eventInvitees).values({ tenantId: T.id, eventId: invite.id, membershipId: gst.membership.id });

    const titles = async (m: typeof mem) => (await withTenant(T.id, (tx) => listEvents(tx, { membershipId: m.membership.id, role: m.membership.role }, { scope: "upcoming" }))).map((e) => e.title);
    expect(await titles(mem)).toEqual(expect.arrayContaining(["Open ride"]));
    expect(await titles(mem)).not.toContain("Founders ride");
    expect(await titles(mem)).not.toContain("Private dinner");
    expect(await titles(fnd)).toContain("Founders ride");
    expect(await titles(gst)).toEqual(["Private dinner"]);
    expect(await titles(admin)).toEqual(expect.arrayContaining(["Founders ride", "Private dinner", "Open ride"]));

    expect(await withTenant(T.id, (tx) => getEvent(tx, { membershipId: mem.membership.id, role: "member" }, founding.id))).toBeNull();
    expect(await go(mem, invite.id)).toMatchObject({ ok: false });
    expect(await go(gst, invite.id)).toMatchObject({ ok: true, status: "going" });
    expect(await go(gst, open.id)).toMatchObject({ ok: false });
  });

  it("counts-only events hide attendee names from members but not admins", async () => {
    const e = await makeEvent({ attendeeVisibility: "counts" });
    const [a, b] = await members(2);
    await go(a, e.id);
    const asMember = await withTenant(T.id, (tx) => getEvent(tx, { membershipId: b.membership.id, role: "member" }, e.id));
    expect(asMember?.attendees).toEqual([]);
    expect(asMember?.counts.going).toBe(1);
    const asAdmin = await withTenant(T.id, (tx) => getEvent(tx, { membershipId: admin.membership.id, role: "owner" }, e.id));
    expect(asAdmin?.attendees).toHaveLength(1);
  });
});

describe("tenant isolation for events", () => {
  it("another tenant's event is invisible and un-RSVP-able even with its id", async () => {
    const other = await makeTenant();
    const [oe] = await sysDb().insert(schema.events).values({ tenantId: other.id, type: "een_ride", title: "Other club ride", startsAt: soon(), timezone: "UTC", status: "published" }).returning();
    const [a] = await members(1);
    expect(await withTenant(T.id, (tx) => getEvent(tx, { membershipId: a.membership.id, role: "member" }, oe.id))).toBeNull();
    expect(await go(a, oe.id)).toMatchObject({ ok: false });
    const list = await withTenant(T.id, (tx) => listEvents(tx, { membershipId: a.membership.id, role: "member" }, { scope: "upcoming" }));
    expect(list.map((e) => e.id)).not.toContain(oe.id);
  });
});
