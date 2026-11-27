import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { afterEventCancelled, afterEventPublished, afterPromotions, afterRsvp, sendAnnouncement, sendDigests, sendReminders } from "@/lib/notifications";
import { rsvp } from "@/lib/services/signups";
import { makeMember, makeTenant } from "./helpers/factory";

let T: Awaited<ReturnType<typeof makeTenant>>, owner: Awaited<ReturnType<typeof makeMember>>;
const settings = { defaultTimezone: "UTC", allowedEventTypes: [], sponsorshipEnabled: true } as never;
const ctx = (m: Awaited<ReturnType<typeof makeMember>>) => ({ tenant: T, settings, membership: { id: m.membership.id, role: m.membership.role }, user: { id: m.user.id, email: m.user.email, sessionId: "" }, viewer: { membershipId: m.membership.id, role: m.membership.role }, can: () => true }) as never;

const mails = async (like_: string) => (await sysDb().select().from(schema.emailOutbox).where(and(eq(schema.emailOutbox.tenantId, T.id), like(schema.emailOutbox.dedupeKey, like_)))).map((m) => m.toEmail);
async function ev(o: Partial<typeof schema.events.$inferInsert> = {}) {
  const [e] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Ride", startsAt: new Date(Date.now() + 3 * 86400000), timezone: "UTC", status: "published", ...o }).returning();
  return e;
}
const setPrefs = (m: Awaited<ReturnType<typeof makeMember>>, p: Partial<typeof schema.notificationPreferences.$inferInsert>) => sysDb().update(schema.notificationPreferences).set(p).where(eq(schema.notificationPreferences.membershipId, m.membership.id));

beforeAll(async () => { T = await makeTenant(); owner = await makeMember(T.id, { role: "owner" }); });
afterAll(closePools);

describe("new-event email", () => {
  it("goes to everyone who can see it and opted in; not to opted-out, digest members, guests, or (founding_only) plain members", async () => {
    const plain = await makeMember(T.id); const optedOut = await makeMember(T.id); const digest = await makeMember(T.id);
    const founding = await makeMember(T.id, { role: "founding_member" }); const guest = await makeMember(T.id, { role: "guest" });
    await setPrefs(optedOut, { eventAnnouncements: false }); await setPrefs(digest, { digest: "weekly" });

    const open = await ev({ title: "Open ride" });
    await afterEventPublished(ctx(owner), open.id);
    const got = await mails(`event-new:${open.id}:%`);
    expect(got).toEqual(expect.arrayContaining([plain.user.email, founding.user.email, owner.user.email]));
    for (const x of [optedOut, digest, guest]) expect(got).not.toContain(x.user.email);

    const fo = await ev({ title: "Founders", visibility: "founding_only" });
    await afterEventPublished(ctx(owner), fo.id);
    const got2 = await mails(`event-new:${fo.id}:%`);
    expect(got2).toContain(founding.user.email);
    expect(got2).not.toContain(plain.user.email);

    const il = await ev({ title: "Dinner", visibility: "invite_list" });
    await sysDb().insert(schema.eventInvitees).values({ tenantId: T.id, eventId: il.id, membershipId: guest.membership.id });
    await afterEventPublished(ctx(owner), il.id);
    expect(await mails(`event-new:${il.id}:%`)).toEqual(expect.arrayContaining([guest.user.email, owner.user.email]));
    expect(await mails(`event-new:${il.id}:%`)).not.toContain(plain.user.email);
  });

  it("is idempotent and never mails drafts", async () => {
    const e = await ev({ title: "Once" });
    await afterEventPublished(ctx(owner), e.id); await afterEventPublished(ctx(owner), e.id);
    const rows = await mails(`event-new:${e.id}:%`);
    expect(new Set(rows).size).toBe(rows.length);
    const d = await ev({ title: "Draft", status: "draft" });
    await afterEventPublished(ctx(owner), d.id);
    expect(await mails(`event-new:${d.id}:%`)).toEqual([]);
  });
});

describe("RSVP, waitlist and cancellation email", () => {
  it("confirms going/waitlist (essential, even if opted out) and emails promoted members who want waitlist updates", async () => {
    const a = await makeMember(T.id); const b = await makeMember(T.id); const c = await makeMember(T.id);
    for (const m of [a, b, c]) await setPrefs(m, { eventAnnouncements: false, reminders: false });
    await setPrefs(c, { eventAnnouncements: false, waitlist: false });
    const e = await ev({ capacity: 1, title: "Tiny" });
    const go = async (m: typeof a, s: "going" | "cancelled" = "going") => {
      const r = await withTenant(T.id, (tx) => rsvp(tx, { tenantId: T.id, membershipId: m.membership.id, role: "member" }, e.id, s));
      if (r.ok) await afterRsvp(ctx(m), e.id, r);
    };
    await go(a); await go(b); await go(c);
    expect(await mails(`rsvp:${e.id}:${a.membership.id}:going:%`)).toEqual([a.user.email]);
    expect(await mails(`rsvp:${e.id}:${b.membership.id}:waitlist:%`)).toEqual([b.user.email]);
    await go(a, "cancelled");
    expect(await mails(`promo:${e.id}:${b.membership.id}:%`)).toEqual([b.user.email]);
    await go(b, "cancelled");
    expect(await mails(`promo:${e.id}:${c.membership.id}:%`)).toEqual([]); // c opted out of waitlist mail
  });

  it("cancellation mails everyone signed up regardless of preferences", async () => {
    const a = await makeMember(T.id); await setPrefs(a, { eventAnnouncements: false, reminders: false, waitlist: false });
    const e = await ev({ title: "Rainout" });
    await sysDb().insert(schema.eventSignups).values({ tenantId: T.id, eventId: e.id, membershipId: a.membership.id, status: "going" });
    await afterEventCancelled(ctx(owner), e.id);
    expect(await mails(`event-cancel:${e.id}:%`)).toEqual([a.user.email]);
  });

  it("promotion helper ignores empty lists", async () => {
    const e = await ev();
    await afterPromotions({ tenant: T, settings }, e.id, []);
    expect(await mails(`promo:${e.id}:%`)).toEqual([]);
  });
});

describe("reminders (48h, daily job window of 36-60h)", () => {
  it("emails going members with reminders on, once per event, only inside the window", async () => {
    const a = await makeMember(T.id); const off = await makeMember(T.id); const maybe = await makeMember(T.id);
    await setPrefs(off, { reminders: false });
    const inWindow = await ev({ title: "In window", startsAt: new Date(Date.now() + 48 * 3600000) });
    const tooSoon = await ev({ title: "Too soon", startsAt: new Date(Date.now() + 10 * 3600000) });
    const tooFar = await ev({ title: "Too far", startsAt: new Date(Date.now() + 100 * 3600000) });
    const draft = await ev({ title: "Draft", status: "draft", startsAt: new Date(Date.now() + 48 * 3600000) });
    for (const e of [inWindow, tooSoon, tooFar, draft]) await sysDb().insert(schema.eventSignups).values([{ tenantId: T.id, eventId: e.id, membershipId: a.membership.id, status: "going" }, { tenantId: T.id, eventId: e.id, membershipId: off.membership.id, status: "going" }, { tenantId: T.id, eventId: e.id, membershipId: maybe.membership.id, status: "maybe" }]);
    const n1 = await sendReminders(T.id, T.name, T.slug, "UTC");
    expect(n1).toBeGreaterThanOrEqual(1);
    expect(await mails(`remind:${inWindow.id}:%`)).toEqual([a.user.email]);
    for (const e of [tooSoon, tooFar, draft]) expect(await mails(`remind:${e.id}:%`)).toEqual([]);
    expect(await sendReminders(T.id, T.name, T.slug, "UTC")).toBe(0); // second run is a no-op
    expect(await mails(`remind:${inWindow.id}:%`)).toEqual([a.user.email]);
  });
});

describe("announcements and digest", () => {
  it("respects audience and preferences", async () => {
    const mem = await makeMember(T.id); const fnd = await makeMember(T.id, { role: "founding_member" }); const gst = await makeMember(T.id, { role: "guest" });
    const [a] = await sysDb().insert(schema.announcements).values({ tenantId: T.id, subject: "Founders only", bodyMarkdown: "Hello", audience: "founding_only", sentAt: new Date() }).returning();
    await sendAnnouncement(ctx(owner), { id: a.id, subject: "Founders only", body: "Hello", audience: "founding_only" });
    const got = await mails(`ann:${a.id}:%`);
    expect(got).toContain(fnd.user.email);
    expect(got).not.toContain(mem.user.email);
    const [b] = await sysDb().insert(schema.announcements).values({ tenantId: T.id, subject: "All", bodyMarkdown: "Hi all", audience: "all_members", sentAt: new Date() }).returning();
    await sendAnnouncement(ctx(owner), { id: b.id, subject: "All", body: "Hi all", audience: "all_members" });
    const all = await mails(`ann:${b.id}:%`);
    expect(all).toEqual(expect.arrayContaining([mem.user.email, fnd.user.email]));
    expect(all).not.toContain(gst.user.email);
  });

  it("weekly digest goes only to digest members, once a week", async () => {
    const d = await makeMember(T.id); await setPrefs(d, { digest: "weekly" });
    await ev({ title: "Digest ride", startsAt: new Date(Date.now() + 2 * 86400000) });
    const n = await sendDigests(T.id, T.name, T.slug, "UTC");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await mails("digest:%")).toContain(d.user.email);
    expect(await sendDigests(T.id, T.name, T.slug, "UTC")).toBe(0);
  });
});
