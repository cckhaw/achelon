import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { acceptInvite } from "@/lib/system/invite-accept";
import { createInvite } from "@/lib/services/invites";
import { canViewEvent } from "@/lib/event-access";
import { inviteMail } from "@/lib/mail/templates";
import { timezoneGroups, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { DEFAULT_TENANT_SETTINGS } from "@/db/constants";
import { profileSchema } from "@/lib/validation";
import { makeMember, makeTenant } from "./helpers/factory";

let T: Awaited<ReturnType<typeof makeTenant>>;
let admin: Awaited<ReturnType<typeof makeMember>>;
const actor = () => ({ membershipId: admin.membership.id, role: "admin" as const, tenantId: T.id });
const uniq = () => `${Math.random().toString(36).slice(2, 10)}@example.test`;

beforeAll(async () => {
  T = await makeTenant();
  admin = await makeMember(T.id, { role: "admin", name: "Admin Person" });
});
afterAll(closePools);

async function makeEvent(visibility: "all_members" | "invite_list" = "all_members") {
  const [e] = await sysDb().insert(schema.events).values({
    tenantId: T.id, type: "een_ride", title: "Sunrise ride", timezone: "Asia/Kuala_Lumpur", startsAt: new Date(Date.now() + 5 * 86_400_000),
    status: "published", visibility, createdByMembershipId: admin.membership.id,
  }).returning();
  return e;
}

describe("event invitations", () => {
  it("accepting an event invite puts the guest on that event's invite list", async () => {
    const ev = await makeEvent("invite_list");
    const email = uniq();
    const inv = await withTenant(T.id, (tx) => createInvite(tx, actor(), { email, role: "guest", eventId: ev.id }));
    const r = await acceptInvite(inv.token, { email: "", profile: profileSchema.parse({ displayName: "Guest Rider" }), visibility: {} });
    expect(r).toMatchObject({ ok: true, mode: "session" });
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.userId, u.id));
    expect(m.role).toBe("guest");
    const rows = await sysDb().select().from(schema.eventInvitees).where(and(eq(schema.eventInvitees.eventId, ev.id), eq(schema.eventInvitees.membershipId, m.id)));
    expect(rows).toHaveLength(1);
  });

  it("rejects an event from another community", async () => {
    const other = await makeTenant();
    const otherAdmin = await makeMember(other.id, { role: "admin", name: "Other Admin" });
    const [foreign] = await sysDb().insert(schema.events).values({ tenantId: other.id, type: "een_ride", title: "Foreign", timezone: "UTC", startsAt: new Date(Date.now() + 86_400_000), status: "published", createdByMembershipId: otherAdmin.membership.id }).returning();
    await expect(withTenant(T.id, (tx) => createInvite(tx, actor(), { email: uniq(), role: "guest", eventId: foreign.id }))).rejects.toThrow();
  });

  it("a listed guest can see the event even when it is open to all members; an unlisted guest cannot", () => {
    const base = { role: "guest" as const, visibility: "all_members" as const, status: "published", isCreator: false };
    expect(canViewEvent({ ...base, invited: true })).toBe(true);
    expect(canViewEvent({ ...base, invited: false })).toBe(false);
    expect(canViewEvent({ role: "member", visibility: "invite_list", status: "published", invited: false })).toBe(false);
    expect(canViewEvent({ role: "member", visibility: "invite_list", status: "published", invited: true })).toBe(true);
  });

  it("the email names the event and is black and yellow", () => {
    const m = inviteMail({ url: "https://x.test/invite/abc", tenantName: "EEN", inviter: "Ana", days: 14, eventTitle: "Sunrise ride" });
    expect(m.subject).toBe("You're invited: Sunrise ride");
    expect(m.text).toContain("Sunrise ride");
    expect(m.html).toContain("#ffd60a");
    expect(m.html).toContain("#0a0a0a");
  });
});

describe("time zones", () => {
  it("defaults to Malaysia (GMT+8) and lists it first", () => {
    expect(DEFAULT_TENANT_SETTINGS.defaultTimezone).toBe(DEFAULT_TIMEZONE);
    const g = timezoneGroups();
    expect(g.common[0]).toEqual({ value: "Asia/Kuala_Lumpur", label: "(GMT+8) Malaysia · Kuala Lumpur" });
    expect(g.others.length).toBeGreaterThan(300);
    expect(g.others.every((o) => /^\(GMT[+-]\d/.test(o.label) || o.label === o.value)).toBe(true);
  });
  it("the first-render list is deterministic and includes the stored zone", async () => {
    const { staticTimezoneGroups } = await import("@/lib/timezones");
    expect(staticTimezoneGroups().common[0].label).toBe("(GMT+8) Malaysia · Kuala Lumpur");
    expect(staticTimezoneGroups("Europe/Berlin").others).toEqual([{ value: "Europe/Berlin", label: "Europe/Berlin" }]);
  });
  it("keeps an unknown stored zone selectable", () => {
    expect(timezoneGroups("Mars/Olympus").others[0]).toEqual({ value: "Mars/Olympus", label: "Mars/Olympus" });
  });
});
