import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { enqueue, scheduleFlush, type OutgoingMail } from "@/lib/mail/outbox";
import { announcementMail, newEventMail, reminderMail, rsvpMail, waitlistPromotedMail } from "@/lib/mail/templates";
import { canViewEvent } from "@/lib/event-access";
import { formatEventTime, isValidTimeZone } from "@/lib/time";
import type { MembershipRole } from "@/db/constants";
import type { MemberContext } from "@/lib/context";
import type { RsvpResult } from "@/lib/services/signups";

/**
 * All email decisions live here. Essential mail ignores preferences; everything else respects them (D-10).
 * Members on the weekly digest get one Monday email instead of separate announcements/new-event mails.
 */
export interface Recipient {
  membershipId: string;
  role: MembershipRole;
  email: string;
  tz: string;
  prefs: { eventAnnouncements: boolean; reminders: boolean; waitlist: boolean; digest: "off" | "weekly" };
}

export async function recipients(tx: Tx, tenantDefaultTz: string, ids?: string[]): Promise<Recipient[]> {
  const rows = await tx
    .select({ id: schema.memberships.id, role: schema.memberships.role, email: schema.users.email, tz: schema.memberProfiles.timezone, p: schema.notificationPreferences })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.memberships.id))
    .leftJoin(schema.notificationPreferences, eq(schema.notificationPreferences.membershipId, schema.memberships.id))
    .where(and(eq(schema.memberships.status, "active"), ids ? inArray(schema.memberships.id, ids) : undefined));
  return rows.map((r) => ({
    membershipId: r.id, role: r.role, email: r.email,
    tz: isValidTimeZone(r.tz) ? r.tz : tenantDefaultTz,
    prefs: { eventAnnouncements: r.p?.eventAnnouncements ?? true, reminders: r.p?.reminders ?? true, waitlist: r.p?.waitlist ?? true, digest: r.p?.digest ?? "off" },
  }));
}

const eventUrl = (slug: string, id: string) => `${env().APP_URL}/${slug}/events/${id}`;
const when = (start: Date, eventTz: string, viewerTz: string) => {
  const t = formatEventTime(start, eventTz, viewerTz, "en-GB");
  return t.local ? `${t.primary} (${t.local} local)` : t.primary;
};

async function loadEvent(tenantId: string, eventId: string) {
  return withTenant(tenantId, async (tx) => {
    const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId));
    if (!ev) return null;
    const inv = await tx.select({ m: schema.eventInvitees.membershipId }).from(schema.eventInvitees).where(eq(schema.eventInvitees.eventId, eventId));
    return { ev, invitees: new Set(inv.map((i) => i.m)) };
  });
}

async function send(list: OutgoingMail[]) {
  let n = 0;
  for (const m of list) if (await enqueue(m)) n++;
  if (n) await scheduleFlush();
  return n;
}

/** RSVP confirmation (essential) and any waitlist promotions it caused. */
export async function afterRsvp(ctx: MemberContext, eventId: string, result: Extract<RsvpResult, { ok: true }>): Promise<void> {
  try {
    const loaded = await loadEvent(ctx.tenant.id, eventId);
    if (!loaded) return;
    const { ev } = loaded;
    if (result.changed && (result.status === "going" || result.status === "waitlist")) {
      const me = (await withTenant(ctx.tenant.id, (tx) => recipients(tx, ctx.settings.defaultTimezone, [ctx.membership.id])))[0];
      if (me) {
        const mail = rsvpMail({ tenantName: ctx.tenant.name, title: ev.title, when: when(ev.startsAt, ev.timezone, me.tz), status: result.status, url: eventUrl(ctx.tenant.slug, ev.id) });
        await send([{ tenantId: ctx.tenant.id, to: me.email, ...mail, category: "essential", dedupeKey: `rsvp:${ev.id}:${me.membershipId}:${result.status}:${Math.floor(Date.now() / 60000)}` }]);
      }
    }
    if (result.promoted.length) await afterPromotions(ctx, eventId, result.promoted);
  } catch (e) {
    console.error("[notify] afterRsvp", e instanceof Error ? e.message : e);
  }
}

export async function afterPromotions(ctx: Pick<MemberContext, "tenant" | "settings">, eventId: string, promoted: string[]): Promise<void> {
  try {
    const loaded = await loadEvent(ctx.tenant.id, eventId);
    if (!loaded || !promoted.length) return;
    const rs = await withTenant(ctx.tenant.id, (tx) => recipients(tx, ctx.settings.defaultTimezone, promoted));
    await send(rs.filter((r) => r.prefs.waitlist).map((r) => ({
      tenantId: ctx.tenant.id, to: r.email, category: "waitlist" as const, dedupeKey: `promo:${eventId}:${r.membershipId}:${Date.now()}`,
      ...waitlistPromotedMail({ tenantName: ctx.tenant.name, title: loaded.ev.title, when: when(loaded.ev.startsAt, loaded.ev.timezone, r.tz), url: eventUrl(ctx.tenant.slug, eventId) }),
    })));
  } catch (e) {
    console.error("[notify] afterPromotions", e instanceof Error ? e.message : e);
  }
}

/** New event: everyone who may see it and wants announcements (digest members get it Monday instead). */
export async function afterEventPublished(ctx: MemberContext, eventId: string): Promise<void> {
  try {
    const loaded = await loadEvent(ctx.tenant.id, eventId);
    if (!loaded || loaded.ev.status !== "published") return;
    const { ev, invitees } = loaded;
    const rs = await withTenant(ctx.tenant.id, (tx) => recipients(tx, ctx.settings.defaultTimezone));
    const to = rs.filter((r) => r.prefs.eventAnnouncements && r.prefs.digest === "off" &&
      canViewEvent({ role: r.role, visibility: ev.visibility, status: ev.status, invited: invitees.has(r.membershipId) }));
    await send(to.map((r) => ({
      tenantId: ctx.tenant.id, to: r.email, category: "announcement" as const, dedupeKey: `event-new:${ev.id}:${r.membershipId}`,
      ...newEventMail({ tenantName: ctx.tenant.name, title: ev.title, when: when(ev.startsAt, ev.timezone, r.tz), url: eventUrl(ctx.tenant.slug, ev.id) }),
    })));
  } catch (e) {
    console.error("[notify] afterEventPublished", e instanceof Error ? e.message : e);
  }
}

/** Cancellation goes to everyone signed up, whatever their preferences: people may have booked travel. */
export async function afterEventCancelled(ctx: MemberContext, eventId: string): Promise<void> {
  try {
    const loaded = await loadEvent(ctx.tenant.id, eventId);
    if (!loaded) return;
    const ids = await withTenant(ctx.tenant.id, async (tx) => (await tx.select({ m: schema.eventSignups.membershipId }).from(schema.eventSignups).where(and(eq(schema.eventSignups.eventId, eventId), inArray(schema.eventSignups.status, ["going", "waitlist", "maybe"])))).map((r) => r.m));
    if (!ids.length) return;
    const rs = await withTenant(ctx.tenant.id, (tx) => recipients(tx, ctx.settings.defaultTimezone, ids));
    await send(rs.map((r) => ({
      tenantId: ctx.tenant.id, to: r.email, category: "essential" as const, dedupeKey: `event-cancel:${eventId}:${r.membershipId}`,
      subject: `Cancelled: ${loaded.ev.title}`,
      text: `${loaded.ev.title} (${when(loaded.ev.startsAt, loaded.ev.timezone, r.tz)}) has been cancelled.\n\n${eventUrl(ctx.tenant.slug, eventId)}`,
    })));
  } catch (e) {
    console.error("[notify] afterEventCancelled", e instanceof Error ? e.message : e);
  }
}

export async function sendAnnouncement(ctx: MemberContext, a: { id: string; subject: string; body: string; audience: "all_members" | "founding_only" | "admins" }): Promise<number> {
  const rs = await withTenant(ctx.tenant.id, (tx) => recipients(tx, ctx.settings.defaultTimezone));
  const ok = (r: Recipient) => a.audience === "all_members" ? r.role !== "guest" : a.audience === "founding_only" ? ["owner", "admin", "founding_member"].includes(r.role) : ["owner", "admin"].includes(r.role);
  const to = rs.filter((r) => ok(r) && r.prefs.eventAnnouncements && r.prefs.digest === "off");
  return send(to.map((r) => ({
    tenantId: ctx.tenant.id, to: r.email, category: "announcement" as const, dedupeKey: `ann:${a.id}:${r.membershipId}`,
    ...announcementMail({ tenantName: ctx.tenant.name, subject: a.subject, body: a.body, url: `${env().APP_URL}/${ctx.tenant.slug}/announcements` }),
  })));
}

/** Daily job: reminders for events starting 36 to 60 hours from now (a 24h window, so each event is hit once; D-13). */
export async function sendReminders(tenantId: string, tenantName: string, slug: string, defaultTz: string, now = new Date()): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const from = new Date(now.getTime() + 36 * 3_600_000);
    const to = new Date(now.getTime() + 60 * 3_600_000);
    const evs = await tx.select().from(schema.events).where(and(eq(schema.events.status, "published"), sql`${schema.events.startsAt} >= ${from} AND ${schema.events.startsAt} < ${to}`, sql`${schema.events.reminderSentAt} IS NULL`));
    let n = 0;
    for (const ev of evs) {
      const going = (await tx.select({ m: schema.eventSignups.membershipId }).from(schema.eventSignups).where(and(eq(schema.eventSignups.eventId, ev.id), eq(schema.eventSignups.status, "going")))).map((g) => g.m);
      const rs = going.length ? await recipients(tx, defaultTz, going) : [];
      for (const r of rs.filter((x) => x.prefs.reminders)) {
        const mail = reminderMail({ tenantName, title: ev.title, when: when(ev.startsAt, ev.timezone, r.tz), url: eventUrl(slug, ev.id) });
        if (await enqueue({ tenantId, to: r.email, ...mail, category: "reminder", dedupeKey: `remind:${ev.id}:${r.membershipId}` })) n++;
      }
      await tx.update(schema.events).set({ reminderSentAt: now }).where(eq(schema.events.id, ev.id));
    }
    return n;
  });
}

/** Monday digest for members who chose it: next 7 days of events + announcements from the last 7 days. */
export async function sendDigests(tenantId: string, tenantName: string, slug: string, defaultTz: string, now = new Date()): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const rs = (await recipients(tx, defaultTz)).filter((r) => r.prefs.digest === "weekly");
    if (!rs.length) return 0;
    const evs = await tx.select().from(schema.events).where(and(eq(schema.events.status, "published"), sql`${schema.events.startsAt} >= ${now} AND ${schema.events.startsAt} < ${new Date(now.getTime() + 7 * 86_400_000)}`)).orderBy(schema.events.startsAt);
    const inv = await tx.select().from(schema.eventInvitees);
    const anns = await tx.select().from(schema.announcements).where(sql`${schema.announcements.sentAt} >= ${new Date(now.getTime() - 7 * 86_400_000)}`);
    const week = `${now.getUTCFullYear()}-W${Math.ceil((((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000) + 1) / 7)}`;
    let n = 0;
    for (const r of rs) {
      const mine = evs.filter((e) => canViewEvent({ role: r.role, visibility: e.visibility, status: e.status, invited: inv.some((i) => i.eventId === e.id && i.membershipId === r.membershipId) }));
      const news = anns.filter((a) => a.audience === "all_members" ? r.role !== "guest" : a.audience === "founding_only" ? ["owner", "admin", "founding_member"].includes(r.role) : ["owner", "admin"].includes(r.role));
      if (!mine.length && !news.length) continue;
      const body = [mine.length ? "This week:\n" + mine.map((e) => `- ${e.title}: ${when(e.startsAt, e.timezone, r.tz)}`).join("\n") : "", news.length ? "From your admins:\n" + news.map((a) => `- ${a.subject}`).join("\n") : ""].filter(Boolean).join("\n\n");
      const mail = announcementMail({ tenantName, subject: `Your week at ${tenantName}`, body, url: `${env().APP_URL}/${slug}` });
      if (await enqueue({ tenantId, to: r.email, ...mail, category: "announcement", dedupeKey: `digest:${r.membershipId}:${week}` })) n++;
    }
    return n;
  });
}
