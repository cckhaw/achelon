import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { closePools, schema, sysDb } from "@/lib/db";
import { deleteAccount, exportUserData, purgeDeparted } from "@/lib/system/account";
import { createSessionRow, lookupSession } from "@/lib/system/auth";
import { rsvp } from "@/lib/services/signups";
import { withTenant } from "@/lib/db";
import { makeMember, makeTenant } from "./helpers/factory";

afterAll(closePools);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("export my data / delete my account / purge (end to end)", () => {
  let A: Awaited<ReturnType<typeof makeTenant>>, B: Awaited<ReturnType<typeof makeTenant>>;
  beforeAll(async () => { A = await makeTenant(); B = await makeTenant(); });

  it("export covers every community the person belongs to and logs it", async () => {
    const a = await makeMember(A.id, { name: "Exa Person" });
    const [bm] = await sysDb().insert(schema.memberships).values({ tenantId: B.id, userId: a.user.id, role: "member", status: "active", joinedAt: new Date() }).returning();
    await sysDb().insert(schema.memberProfiles).values({ membershipId: bm.id, tenantId: B.id, displayName: "Exa in B" });
    const [ev] = await sysDb().insert(schema.events).values({ tenantId: A.id, type: "een_ride", title: "Exported ride", startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC", status: "published" }).returning();
    await sysDb().insert(schema.eventSignups).values({ tenantId: A.id, eventId: ev.id, membershipId: a.membership.id, status: "going" });
    const data = await exportUserData(a.user.id);
    expect(data.account?.email).toBe(a.user.email);
    expect(data.communities).toHaveLength(2);
    expect(data.profiles.map((p) => p.displayName).sort()).toEqual(["Exa Person", "Exa in B"]);
    expect(data.eventSignups.map((s) => s.event)).toContain("Exported ride");
    expect(JSON.stringify(data)).not.toMatch(/token_hash|access_token|refresh/i);
    const log = await sysDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "member.exported"));
    expect(log.some((l) => l.actorMembershipId === a.membership.id)).toBe(true);
  });

  it("export never includes someone else's data", async () => {
    const x = await makeMember(A.id, { name: "Xavier X" }); const y = await makeMember(A.id, { name: "Yara Y" });
    const data = await exportUserData(x.user.id);
    expect(JSON.stringify(data)).not.toContain("Yara Y");
    expect(JSON.stringify(data)).not.toContain(y.user.email);
  });

  it("deleting an account ends access at once, frees seats, and the purge erases personal data after 30 days", async () => {
    const stay = await makeMember(A.id, { name: "Stays Here" });
    const gone = await makeMember(A.id, { name: "Goes Away" });
    const [ev] = await sysDb().insert(schema.events).values({ tenantId: A.id, type: "een_ride", title: "Cap 1", startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC", status: "published", capacity: 1 }).returning();
    await withTenant(A.id, (tx) => rsvp(tx, { tenantId: A.id, membershipId: gone.membership.id, role: "member" }, ev.id, "going"));
    await withTenant(A.id, (tx) => rsvp(tx, { tenantId: A.id, membershipId: stay.membership.id, role: "member" }, ev.id, "going"));
    const { token } = await createSessionRow(gone.user.id);
    expect(await lookupSession(token)).not.toBeNull();
    await sysDb().insert(schema.auditLog).values({ tenantId: A.id, actorMembershipId: gone.membership.id, action: "invite.created" });

    await deleteAccount(gone.user.id);
    expect(await lookupSession(token)).toBeNull();                                  // session dead immediately
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.id, gone.membership.id));
    expect(m.status).toBe("left");
    const seats = await sysDb().select().from(schema.eventSignups).where(eq(schema.eventSignups.eventId, ev.id));
    expect(seats.find((s) => s.membershipId === stay.membership.id)?.status).toBe("going"); // waitlist promoted

    // Not purged yet (inside the 30-day window).
    await purgeDeparted();
    expect(await sysDb().select().from(schema.users).where(eq(schema.users.id, gone.user.id))).toHaveLength(1);

    // Time passes.
    await sysDb().update(schema.users).set({ deletedAt: daysAgo(31) }).where(eq(schema.users.id, gone.user.id));
    await sysDb().update(schema.memberships).set({ leftAt: daysAgo(31) }).where(eq(schema.memberships.id, gone.membership.id));
    const r = await purgeDeparted();
    expect(r.users).toBeGreaterThanOrEqual(1);
    expect(await sysDb().select().from(schema.users).where(eq(schema.users.id, gone.user.id))).toHaveLength(0);
    expect(await sysDb().select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, gone.membership.id))).toHaveLength(0);
    expect(await sysDb().select().from(schema.eventSignups).where(inArray(schema.eventSignups.membershipId, [gone.membership.id]))).toHaveLength(0);
    // History is kept, by opaque id only: no names or emails anywhere in the audit log.
    const audit = await sysDb().select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, A.id));
    expect(audit.some((l) => l.actorMembershipId === gone.membership.id)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(gone.user.email);
    expect(JSON.stringify(audit)).not.toContain("Goes Away");
  });

  it("a member removed by an admin (not the account) is also purged after 30 days, but the person's other communities stay", async () => {
    const p = await makeMember(A.id, { name: "Two Homes" });
    const [bm] = await sysDb().insert(schema.memberships).values({ tenantId: B.id, userId: p.user.id, role: "member", status: "active", joinedAt: new Date() }).returning();
    await sysDb().insert(schema.memberProfiles).values({ membershipId: bm.id, tenantId: B.id, displayName: "Two Homes B" });
    await sysDb().update(schema.memberships).set({ status: "left", leftAt: daysAgo(40) }).where(eq(schema.memberships.id, p.membership.id));
    await purgeDeparted();
    expect(await sysDb().select().from(schema.memberships).where(eq(schema.memberships.id, p.membership.id))).toHaveLength(0);
    expect(await sysDb().select().from(schema.users).where(eq(schema.users.id, p.user.id))).toHaveLength(1);
    expect(await sysDb().select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, bm.id))).toHaveLength(1);
  });
});
