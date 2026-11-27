import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePools, sysDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { makeMember, makeTenant } from "./helpers/factory";
import type { MembershipRole } from "@/db/constants";

// The session is the only thing mocked: actions run for real against the database as whoever "is signed in".
let signedIn: { id: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/session", () => ({ currentUser: async () => signedIn, startSession: async () => {}, endSession: async () => {}, SESSION_COOKIE: "x" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const DENIED = "You don't have access to that.";
let T: Awaited<ReturnType<typeof makeTenant>>, B: Awaited<ReturnType<typeof makeTenant>>;
const who = {} as Record<MembershipRole | "outsiderAdmin" | "target", Awaited<ReturnType<typeof makeMember>>>;
let eventId: string, appId: string;
const as = (k: keyof typeof who) => { signedIn = { id: who[k].user.id, email: who[k].user.email, sessionId: "s" }; };
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(async () => {
  T = await makeTenant(); B = await makeTenant();
  for (const r of ["owner", "admin", "founding_member", "member", "guest"] as const) who[r] = await makeMember(T.id, { role: r, name: `${r} person` });
  who.target = await makeMember(T.id, { role: "member", name: "Target Member" });
  who.outsiderAdmin = await makeMember(B.id, { role: "owner" });
  const [e] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Ride", startsAt: new Date(Date.now() + 5 * 86400000), timezone: "UTC", status: "published", capacity: 5 }).returning();
  eventId = e.id;
  const [a] = await sysDb().insert(schema.applications).values({ tenantId: T.id, email: "nominee@example.test", name: "Nominee", sponsorMembershipId: who.member.membership.id }).returning();
  appId = a.id;
});
beforeEach(() => { signedIn = null; });
afterAll(closePools);

const adminOnly: [string, (slug: string) => Promise<{ error?: string; ok?: boolean } | void>][] = [];
beforeAll(async () => {
  const invites = await import("@/app/[tenant]/admin/actions");
  const events = await import("@/app/[tenant]/admin/events/actions");
  const anns = await import("@/app/[tenant]/admin/announcements/actions");
  const apps = await import("@/app/[tenant]/admin/applications/actions");
  adminOnly.push(
    ["createInvite", (s) => invites.createInviteAction(s, undefined, form({ email: "x@example.test", role: "member", note: "", sponsor: "" }))],
    ["changeRole", (s) => invites.changeRoleAction(s, who.target.membership.id, undefined, form({ role: "admin" }))],
    ["setStatus", (s) => invites.setStatusAction(s, who.target.membership.id, "paused", undefined, form({}))],
    ["saveSettings", (s) => invites.saveSettingsAction(s, undefined, form({ name: "Renamed", defaultTimezone: "UTC", brand: "green", types: "een_ride" }))],
    ["import", (s) => invites.importAction(s, undefined, form({ mode: "preview", csv: "email,name\na@example.test,A" })) as never],
    ["revokeInvite", (s) => invites.revokeInviteAction(s, crypto.randomUUID())],
    ["emailAllUnsent", (s) => invites.emailAllUnsentAction(s, undefined, form({}))],
    ["resendInvite", (s) => invites.resendInviteAction(s, crypto.randomUUID(), undefined, form({}))],
    ["saveEvent", (s) => events.saveEventAction(s, null, undefined, form({ type: "een_ride", title: "Hacked ride", timezone: "UTC", start: "2031-01-01T08:00", visibility: "all_members", attendeeVisibility: "names", status: "published" }))],
    ["cancelEvent", (s) => events.cancelEventAction(s, eventId, undefined, form({}))],
    ["removeAttendee", (s) => events.removeAttendeeAction(s, eventId, who.member.membership.id)],
    ["forceGoing", (s) => events.forceGoingAction(s, eventId, who.member.membership.id)],
    ["sendAnnouncement", (s) => anns.sendAnnouncementAction(s, undefined, form({ subject: "Spam", body: "Spam spam", audience: "all_members" }))],
    ["approveApplication", (s) => apps.approveApplicationAction(s, appId, undefined, form({}))],
    ["declineApplication", (s) => apps.declineApplicationAction(s, appId, undefined, form({}))],
  );
});

const denied = async (fn: () => Promise<unknown>) => {
  try {
    const r = (await fn()) as { error?: string } | void;
    return r?.error === DENIED || (r?.error ?? "").includes("access");
  } catch (e) {
    return (e as Error).name === "ForbiddenError";
  }
};

describe("admin actions: guest, member and founding member are refused; foreign admin and anonymous too", () => {
  for (const role of ["guest", "member", "founding_member"] as const) {
    it(`${role} is refused on every admin action`, async () => {
      as(role);
      for (const [name, call] of adminOnly) expect(await denied(() => call(T.slug)), `${role} → ${name}`).toBe(true);
    });
  }
  it("an owner of ANOTHER community is refused on every action here", async () => {
    as("outsiderAdmin");
    for (const [name, call] of adminOnly) expect(await denied(() => call(T.slug)), `outsider → ${name}`).toBe(true);
  });
  it("an anonymous visitor is refused", async () => {
    signedIn = null;
    for (const [name, call] of adminOnly) expect(await denied(() => call(T.slug)), `anon → ${name}`).toBe(true);
  });
  it("no refused call changed anything", async () => {
    const [t] = await sysDb().select().from(schema.tenants).where(eq(schema.tenants.id, T.id));
    expect(t.name).not.toBe("Renamed");
    const evs = await sysDb().select().from(schema.events).where(eq(schema.events.tenantId, T.id));
    expect(evs.map((e) => e.title)).not.toContain("Hacked ride");
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.id, who.target.membership.id));
    expect(m).toMatchObject({ role: "member", status: "active" });
    expect((await sysDb().select().from(schema.announcements).where(eq(schema.announcements.tenantId, T.id)))).toHaveLength(0);
  });
});

describe("admin and owner are allowed", () => {
  for (const role of ["admin", "owner"] as const) {
    it(`${role} can create invites, events and announcements`, async () => {
      as(role);
      const inv = await (await import("@/app/[tenant]/admin/actions")).createInviteAction(T.slug, undefined, form({ email: `${role}-invited@example.test`, role: "member", note: "", sponsor: "" }));
      expect(inv.ok, inv.error).toBe(true);
      const ann = await (await import("@/app/[tenant]/admin/announcements/actions")).sendAnnouncementAction(T.slug, undefined, form({ subject: `Hi from ${role}`, body: "Hello everyone", audience: "all_members" }));
      expect(ann.ok, ann.error).toBe(true);
    });
  }
  it("admin cannot grant or change owner/admin; owner can", async () => {
    const { changeRoleAction } = await import("@/app/[tenant]/admin/actions");
    as("admin");
    expect(((await changeRoleAction(T.slug, who.target.membership.id, undefined, form({ role: "admin" }))).error ?? "")).toMatch(/can't grant/i);
    expect(((await changeRoleAction(T.slug, who.owner.membership.id, undefined, form({ role: "member" }))).error ?? "")).toMatch(/can't manage/i);
    as("owner");
    expect((await changeRoleAction(T.slug, who.target.membership.id, undefined, form({ role: "founding_member" }))).ok).toBe(true);
  });
  it("the last owner cannot be demoted or removed, and nobody can change their own membership", async () => {
    const { changeRoleAction, setStatusAction } = await import("@/app/[tenant]/admin/actions");
    as("owner");
    expect(((await changeRoleAction(T.slug, who.owner.membership.id, undefined, form({ role: "member" }))).error ?? "")).toMatch(/own membership/i);
    expect(((await setStatusAction(T.slug, who.owner.membership.id, "left", undefined, form({}))).error ?? "")).toMatch(/own membership/i);
  });
});

describe("member-level boundaries", () => {
  it("guests can't use member features (races, nominations, recaps); members can", async () => {
    const races = await import("@/app/[tenant]/races/actions");
    const nom = await import("@/app/[tenant]/nominate/actions");
    const input = form({ raceName: "Test 10k", raceDate: "2031-05-05", visibleTo: "members" });
    as("guest");
    expect(await denied(() => races.declareRaceAction(T.slug, undefined, input))).toBe(true);
    expect(await denied(() => nom.nominateAction(T.slug, undefined, form({ name: "Pat Person", email: "pat@example.test", company: "", message: "A good rider and friend." })))).toBe(true);
    as("member");
    expect((await races.declareRaceAction(T.slug, undefined, input)).ok).toBe(true);
    expect((await nom.nominateAction(T.slug, undefined, form({ name: "Pat Person", email: "pat@example.test", company: "", message: "A good rider and friend." }))).ok).toBe(true);
  });

  it("RSVP: a member may; a guest not invited to an all_members event may not", async () => {
    const { rsvpAction } = await import("@/app/[tenant]/events/actions");
    as("member");
    expect((await rsvpAction(T.slug, eventId, undefined, form({ status: "going" }))).ok).toBe(true);
    as("guest");
    expect((await rsvpAction(T.slug, eventId, undefined, form({ status: "going" }))).ok).toBe(false);
  });

  it("members can only change their own profile and preferences", async () => {
    const { saveProfileAction } = await import("@/app/[tenant]/me/actions");
    as("member");
    const r = await saveProfileAction(T.slug, undefined, form({ displayName: "Renamed Member" }));
    expect(r.ok).toBe(true);
    const [p] = await sysDb().select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, who.target.membership.id));
    expect(p.displayName).toBe("Target Member");
  });
});

describe("cron endpoint authentication", () => {
  it("rejects missing and wrong bearer tokens, accepts the right one", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/cron/daily/route");
    const call = (h: Record<string, string>) => GET(new NextRequest("http://localhost/api/cron/daily", { headers: h }));
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
    const ok = await call({ authorization: `Bearer ${process.env.CRON_SECRET}` });
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);
  });
});
