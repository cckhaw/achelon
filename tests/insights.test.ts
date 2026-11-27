import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { classifyEngagement } from "@/lib/engagement";
import { engagementSummary } from "@/lib/services/insights";
import { slugSchema } from "@/lib/validation";
import { makeMember, makeTenant } from "./helpers/factory";
import { eq } from "drizzle-orm";

afterAll(closePools);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("classifyEngagement", () => {
  const base = { joinedAt: daysAgo(200), lastActiveAt: null, lastWentAt: null };
  it("new members are new", () => expect(classifyEngagement({ ...base, joinedAt: daysAgo(5) })).toBe("new"));
  it("recent sign-in or recent event keeps someone active", () => {
    expect(classifyEngagement({ ...base, lastActiveAt: daysAgo(10) })).toBe("active");
    expect(classifyEngagement({ ...base, lastWentAt: daysAgo(40) })).toBe("active");
  });
  it("otherwise quiet, including never seen", () => {
    expect(classifyEngagement({ ...base, lastActiveAt: daysAgo(31), lastWentAt: daysAgo(46) })).toBe("quiet");
    expect(classifyEngagement(base)).toBe("quiet");
  });
});

describe("engagement summary (DB)", () => {
  let T: Awaited<ReturnType<typeof makeTenant>>;
  beforeAll(async () => { T = await makeTenant(); });
  it("counts attendance as 'going' to started, published events and flags quiet members; excludes guests and others' tenants", async () => {
    const busy = await makeMember(T.id, { name: "Busy Bea" }); const idle = await makeMember(T.id, { name: "Idle Ian" }); const guest = await makeMember(T.id, { role: "guest" });
    await sysDb().update(schema.memberships).set({ joinedAt: daysAgo(200) }).where(eq(schema.memberships.tenantId, T.id));
    await sysDb().update(schema.memberships).set({ lastActiveAt: daysAgo(2) }).where(eq(schema.memberships.id, busy.membership.id));
    const [past] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Past", startsAt: daysAgo(10), timezone: "UTC", status: "published", capacity: 4 }).returning();
    const [future] = await sysDb().insert(schema.events).values({ tenantId: T.id, type: "een_ride", title: "Future", startsAt: new Date(Date.now() + 86_400_000), timezone: "UTC", status: "published" }).returning();
    await sysDb().insert(schema.eventSignups).values([{ tenantId: T.id, eventId: past.id, membershipId: busy.membership.id, status: "going" }, { tenantId: T.id, eventId: future.id, membershipId: busy.membership.id, status: "going" }, { tenantId: T.id, eventId: past.id, membershipId: idle.membership.id, status: "declined" }]);
    const other = await makeTenant(); await makeMember(other.id, { name: "Elsewhere" });
    const s = await withTenant(T.id, (tx) => engagementSummary(tx));
    const bea = s.members.find((m) => m.name === "Busy Bea")!;
    const ian = s.members.find((m) => m.name === "Idle Ian")!;
    expect(bea).toMatchObject({ went90: 1, state: "active" });
    expect(ian).toMatchObject({ went90: 0, state: "quiet" });
    expect(s.members.map((m) => m.id)).not.toContain(guest.membership.id);
    expect(s.members.map((m) => m.name)).not.toContain("Elsewhere");
    expect(s.events.map((e) => e.title)).toEqual(["Past"]);
    expect(s.summary.quiet).toBeGreaterThanOrEqual(1);
  });
});

describe("community slugs", () => {
  it("rejects reserved and malformed slugs", () => {
    for (const bad of ["login", "invite", "api", "cal", "admin", "icon-192", "apple-touch-icon", "-x", "x-", "UPPER space", "a".repeat(41)]) expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    for (const ok of ["een", "demo", "my-club-2"]) expect(slugSchema.safeParse(ok).success, ok).toBe(true);
  });
});
