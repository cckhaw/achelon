import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { acceptInvite, viewInvite } from "@/lib/system/invite-accept";
import { createInvite, inviteStatus, revokeInvite, rotateInvite } from "@/lib/services/invites";
import { redeemLoginToken } from "@/lib/system/auth";
import { profileSchema } from "@/lib/validation";
import { sha256Hex } from "@/lib/crypto";
import { makeMember, makeTenant } from "./helpers/factory";

let T: Awaited<ReturnType<typeof makeTenant>>;
let admin: Awaited<ReturnType<typeof makeMember>>;
const actor = () => ({ membershipId: admin.membership.id, role: "admin" as const, tenantId: T.id });
const profile = (name = "Newcomer Test") => profileSchema.parse({ displayName: name });
const uniq = () => `${Math.random().toString(36).slice(2, 10)}@example.test`;

beforeAll(async () => {
  T = await makeTenant();
  admin = await makeMember(T.id, { role: "admin", name: "Admin Person" });
});
afterAll(closePools);

const mk = (o: Parameters<typeof createInvite>[2]) => withTenant(T.id, (tx) => createInvite(tx, actor(), o));

describe("invite lifecycle", () => {
  it("stores only a hash of the token", async () => {
    const inv = await mk({ email: uniq(), role: "member" });
    const [row] = await sysDb().select().from(schema.invites).where(eq(schema.invites.id, inv.id));
    expect(row.tokenHash).toBe(sha256Hex(inv.token));
    expect(JSON.stringify(row)).not.toContain(inv.token);
  });

  it("email-bound invite: accepted once, creates active member and a session-grade result", async () => {
    const email = uniq();
    const inv = await mk({ email, role: "member" });
    expect((await viewInvite(inv.token))?.email).toBe(email);
    const r = await acceptInvite(inv.token, { email: "ignored@example.test", profile: profile(), visibility: { company: "members" } });
    expect(r).toMatchObject({ ok: true, mode: "session" });
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    expect(u).toBeTruthy();
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.userId, u.id));
    expect(m).toMatchObject({ status: "active", role: "member", tenantId: T.id });
    const vis = await sysDb().select().from(schema.fieldVisibility).where(eq(schema.fieldVisibility.membershipId, m.id));
    expect(vis.find((v) => v.fieldName === "company")?.visibleTo).toBe("members");
    expect(vis.find((v) => v.fieldName === "bio")?.visibleTo).toBe("admins"); // conservative default
  });

  it("is single use", async () => {
    const inv = await mk({ email: uniq(), role: "member" });
    expect((await acceptInvite(inv.token, { email: "", profile: profile(), visibility: {} })).ok).toBe(true);
    expect(await viewInvite(inv.token)).toBeNull();
    expect(await acceptInvite(inv.token, { email: "", profile: profile(), visibility: {} })).toEqual({ ok: false, reason: "invalid" });
  });

  it("concurrent acceptance only succeeds once", async () => {
    const inv = await mk({ email: uniq(), role: "member" });
    const results = await Promise.all(Array.from({ length: 5 }, () => acceptInvite(inv.token, { email: "", profile: profile(), visibility: {} })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("unknown, revoked and expired tokens are indistinguishable", async () => {
    const revoked = await mk({ email: uniq(), role: "member" });
    await withTenant(T.id, (tx) => revokeInvite(tx, actor(), revoked.id));
    const expired = await mk({ email: uniq(), role: "member", days: 1 });
    await sysDb().update(schema.invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invites.id, expired.id));
    for (const tok of ["nonsense-token", revoked.token, expired.token]) {
      expect(await viewInvite(tok)).toBeNull();
      expect(await acceptInvite(tok, { email: uniq(), profile: profile(), visibility: {} })).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("resend rotates the token: old link dies, new link works", async () => {
    const inv = await mk({ email: uniq(), role: "member" });
    const rotated = await withTenant(T.id, (tx) => rotateInvite(tx, actor(), inv.id));
    expect(rotated).not.toBeNull();
    expect(await viewInvite(inv.token)).toBeNull();
    expect(await viewInvite(rotated!.token)).not.toBeNull();
  });

  it("cannot rotate or revoke-then-use a spent invite", async () => {
    const inv = await mk({ email: uniq(), role: "member" });
    await acceptInvite(inv.token, { email: "", profile: profile(), visibility: {} });
    expect(await withTenant(T.id, (tx) => rotateInvite(tx, actor(), inv.id))).toBeNull();
    const [row] = await sysDb().select().from(schema.invites).where(eq(schema.invites.id, inv.id));
    expect(inviteStatus(row)).toBe("used");
  });

  it("link-only invite requires email confirmation and never yields a session", async () => {
    const inv = await mk({ role: "member" });
    const email = uniq();
    const r = await acceptInvite(inv.token, { email, profile: profile("Link Person"), visibility: {} });
    expect(r).toMatchObject({ ok: true, mode: "confirm_email" });
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.userId, u.id));
    expect(m.status).toBe("invited"); // not a member until the mailbox is proven
    const [tok] = await sysDb().select().from(schema.loginTokens).where(eq(schema.loginTokens.userId, u.id));
    expect(tok).toBeTruthy();
  });

  it("link-only invite using an existing member's email does not touch that member", async () => {
    const victim = await makeMember(T.id, { name: "Victim Original", email: uniq() });
    const inv = await mk({ role: "member" });
    const r = await acceptInvite(inv.token, { email: victim.user.email, profile: profile("Attacker Rewrite"), visibility: { bio: "members" } });
    expect(r.ok && r.mode).toBe("confirm_email");
    const [p] = await sysDb().select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, victim.membership.id));
    expect(p.displayName).toBe("Victim Original");
  });

  it("an invite can't be used for a different community's membership", async () => {
    const other = await makeTenant();
    const inv = await mk({ email: uniq(), role: "member" });
    const r = await acceptInvite(inv.token, { email: "", profile: profile(), visibility: {} });
    expect(r.ok && r.tenantSlug).toBe(T.slug);
    expect(r.ok && r.tenantSlug).not.toBe(other.slug);
  });

  it("role grants respect who is inviting", async () => {
    await expect(mk({ email: uniq(), role: "owner" })).rejects.toThrow(/role/i);
    await expect(mk({ email: uniq(), role: "admin" })).rejects.toThrow(/role/i);
    await expect(mk({ email: uniq(), role: "guest" })).resolves.toBeTruthy();
  });

  it("deleted accounts cannot be resurrected by an invite", async () => {
    const email = uniq();
    const gone = await makeMember(T.id, { email, status: "left" });
    await sysDb().update(schema.users).set({ deletedAt: new Date() }).where(eq(schema.users.id, gone.user.id));
    const inv = await mk({ email, role: "member" });
    expect(await acceptInvite(inv.token, { email: "", profile: profile(), visibility: {} })).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("login tokens", () => {
  it("redeem is single use and activates invited memberships", async () => {
    const inv = await mk({ role: "member" });
    const email = uniq();
    await acceptInvite(inv.token, { email, profile: profile(), visibility: {} });
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    const raw = `known-${Math.random()}`;
    await sysDb().insert(schema.loginTokens).values({ userId: u.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + 60_000) });
    expect(await redeemLoginToken(raw)).toEqual({ userId: u.id, purpose: "login" });
    expect(await redeemLoginToken(raw)).toBeNull();
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.userId, u.id));
    expect(m.status).toBe("active");
  });
  it("expired tokens are rejected", async () => {
    const mem = await makeMember(T.id);
    const raw = `expired-${Math.random()}`;
    await sysDb().insert(schema.loginTokens).values({ userId: mem.user.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() - 1000) });
    expect(await redeemLoginToken(raw)).toBeNull();
  });
});
