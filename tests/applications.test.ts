import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { applicationSchema, approveApplication, declineApplication, listApplications, submitApplication } from "@/lib/services/applications";
import { acceptInvite, viewInvite } from "@/lib/system/invite-accept";
import { profileSchema } from "@/lib/validation";
import { makeMember, makeTenant } from "./helpers/factory";

let T: Awaited<ReturnType<typeof makeTenant>>, admin: Awaited<ReturnType<typeof makeMember>>, sponsor: Awaited<ReturnType<typeof makeMember>>;
const uniq = () => `${Math.random().toString(36).slice(2, 10)}@example.test`;
const nominate = (email: string, name = "Nina Nominee") => withTenant(T.id, (tx) => submitApplication(tx, { tenantId: T.id, membershipId: sponsor.membership.id }, applicationSchema.parse({ name, email, company: "Example Co", message: "Great rider and a thoughtful person." })));
const actor = () => ({ membershipId: admin.membership.id, role: "admin" as const, tenantId: T.id });

beforeAll(async () => {
  T = await makeTenant();
  admin = await makeMember(T.id, { role: "admin", name: "Admin A" });
  sponsor = await makeMember(T.id, { name: "Sponsor S" });
});
afterAll(closePools);

describe("applications and sponsorship", () => {
  it("validates input", () => {
    expect(applicationSchema.safeParse({ name: "A", email: "x", message: "short" }).success).toBe(false);
    expect(applicationSchema.safeParse({ name: "Ann Able", email: "ANN@Example.TEST", message: "A long enough message." }).data?.email).toBe("ann@example.test");
  });

  it("records the sponsor and keeps duplicates quiet (no oracle for the nominator)", async () => {
    const email = uniq();
    expect(await nominate(email)).toEqual({ created: true });
    expect(await nominate(email)).toEqual({ created: false });
    const rows = await withTenant(T.id, (tx) => listApplications(tx));
    const mine = rows.filter((r) => r.a.email === email);
    expect(mine).toHaveLength(1);
    expect(mine[0].sponsor).toBe("Sponsor S");
  });

  it("flags to the admin (only) when the nominee is already a member", async () => {
    const existing = await makeMember(T.id, { name: "Already Here" });
    await nominate(existing.user.email, "Already Here");
    const row = (await withTenant(T.id, (tx) => listApplications(tx))).find((r) => r.a.email === existing.user.email)!;
    expect(row.isMember).toBe(true);
  });

  it("approve creates an email-bound invite crediting the sponsor, prefilled, usable once", async () => {
    const email = uniq();
    await nominate(email, "Pia Prefilled");
    const app = (await withTenant(T.id, (tx) => listApplications(tx))).find((r) => r.a.email === email)!.a;
    const r = await withTenant(T.id, (tx) => approveApplication(tx, actor(), app.id));
    expect(r).not.toBeNull();
    const view = await viewInvite(r!.invite.token);
    expect(view).toMatchObject({ email, inviter: "Sponsor S", prefill: { name: "Pia Prefilled", company: "Example Co" } });
    const [saved] = await sysDb().select().from(schema.applications).where(eq(schema.applications.id, app.id));
    expect(saved).toMatchObject({ status: "approved", decidedBy: admin.membership.id });
    expect(await withTenant(T.id, (tx) => approveApplication(tx, actor(), app.id))).toBeNull(); // not twice
    const acc = await acceptInvite(r!.invite.token, { email: "", profile: profileSchema.parse({ displayName: "Pia Prefilled" }), visibility: {} });
    expect(acc).toMatchObject({ ok: true, mode: "session" });
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.tenantId, T.id));
    expect(m).toBeTruthy();
  });

  it("decline closes it and cannot be approved afterwards", async () => {
    const email = uniq();
    await nominate(email);
    const app = (await withTenant(T.id, (tx) => listApplications(tx))).find((r) => r.a.email === email)!.a;
    expect(await withTenant(T.id, (tx) => declineApplication(tx, { membershipId: admin.membership.id, tenantId: T.id }, app.id))).not.toBeNull();
    expect(await withTenant(T.id, (tx) => approveApplication(tx, actor(), app.id))).toBeNull();
  });

  it("another community's admin cannot see or decide this community's applications", async () => {
    const other = await makeTenant();
    const oa = await makeMember(other.id, { role: "admin" });
    const email = uniq();
    await nominate(email);
    const app = (await withTenant(T.id, (tx) => listApplications(tx))).find((r) => r.a.email === email)!.a;
    expect((await withTenant(other.id, (tx) => listApplications(tx))).map((r) => r.a.id)).not.toContain(app.id);
    expect(await withTenant(other.id, (tx) => approveApplication(tx, { membershipId: oa.membership.id, role: "admin", tenantId: other.id }, app.id))).toBeNull();
  });
});
