import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/password-policy";
import { createSessionRow, loginWithPassword, lookupSession, redeemLoginToken, requestMagicLink, setPassword } from "@/lib/system/auth";
import { acceptInvite } from "@/lib/system/invite-accept";
import { createInvite } from "@/lib/services/invites";
import { exportUserData } from "@/lib/system/account";
import { profileSchema } from "@/lib/validation";
import { sha256Hex } from "@/lib/crypto";
import { rejection } from "./helpers/errors";
import { makeMember, makeTenant } from "./helpers/factory";

afterAll(closePools);
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const GOOD = "correct horse battery staple";

async function userWithPassword(pw = GOOD) {
  const T = await makeTenant();
  const m = await makeMember(T.id);
  await sysDb().update(schema.users).set({ passwordHash: await hashPassword(pw), passwordSetAt: new Date() }).where(eq(schema.users.id, m.user.id));
  return { T, m };
}
async function sessionFor(userId: string, viaLink = false) {
  const { token } = await createSessionRow(userId, { viaLink });
  return (await lookupSession(token))!;
}

describe("hashing and policy", () => {
  it("scrypt: salted, verifiable, rejects wrong passwords and malformed hashes", async () => {
    const a = await hashPassword(GOOD), b = await hashPassword(GOOD);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword(GOOD, a)).toBe(true);
    expect(await verifyPassword(GOOD + "x", a)).toBe(false);
    expect(await verifyPassword(GOOD, "garbage")).toBe(false);
    expect(await verifyPassword(GOOD, "scrypt$1$2$3$x")).toBe(false);
    expect(await verifyPassword("pässword-ünïcode-1", await hashPassword("pässword-ünïcode-1"))).toBe(true);
    expect(await verifyPassword(GOOD, await dummyHash())).toBe(false);
  });
  it("policy: length, common, repeated and email-derived passwords are refused", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("a".repeat(129))).toMatch(/at most 128/);
    expect(passwordProblem("password123")).toMatch(/too easy/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/too easy/);
    expect(passwordProblem("owen.okafor2026!", "owen.okafor@example.test")).toMatch(/email/);
    expect(passwordProblem(GOOD, "someone@example.test")).toBeNull();
  });
});

describe("password login", () => {
  it("succeeds with the right password and fails with one uniform error otherwise", async () => {
    const { m } = await userWithPassword();
    expect(await loginWithPassword(m.user.email, GOOD, ip())).toEqual({ userId: m.user.id });
    expect(await loginWithPassword(m.user.email.toUpperCase(), GOOD, ip())).toEqual({ userId: m.user.id }); // email is case-insensitive
    const wrong = await loginWithPassword(m.user.email, "nope nope nope", ip());
    const unknown = await loginWithPassword(`nobody-${Math.random()}@example.test`, GOOD, ip());
    expect(wrong).toEqual({ error: "invalid" });
    expect(unknown).toEqual(wrong); // indistinguishable: no account oracle
  });

  it("an account with no password, or no active membership, or deleted, cannot sign in this way", async () => {
    const T = await makeTenant();
    const noPw = await makeMember(T.id);
    expect(await loginWithPassword(noPw.user.email, GOOD, ip())).toEqual({ error: "invalid" });
    const left = await makeMember(T.id, { status: "left" });
    await sysDb().update(schema.users).set({ passwordHash: await hashPassword(GOOD) }).where(eq(schema.users.id, left.user.id));
    expect(await loginWithPassword(left.user.email, GOOD, ip())).toEqual({ error: "invalid" });
    const gone = await makeMember(T.id);
    await sysDb().update(schema.users).set({ passwordHash: await hashPassword(GOOD), deletedAt: new Date() }).where(eq(schema.users.id, gone.user.id));
    expect(await loginWithPassword(gone.user.email, GOOD, ip())).toEqual({ error: "invalid" });
  });

  it("locks an account after repeated FAILURES (even for the right password), but successes never count", async () => {
    const { m } = await userWithPassword();
    for (let i = 0; i < 5; i++) expect(await loginWithPassword(m.user.email, GOOD, ip())).toHaveProperty("userId"); // many successes: fine
    for (let i = 0; i < 8; i++) expect(await loginWithPassword(m.user.email, "wrong wrong wrong", ip())).toEqual({ error: "invalid" });
    expect(await loginWithPassword(m.user.email, GOOD, ip())).toEqual({ error: "throttled" });
    // the email-link route still works while password attempts are throttled
    await requestMagicLink(m.user.email, ip());
    expect(await sysDb().select().from(schema.loginTokens).where(eq(schema.loginTokens.userId, m.user.id))).toHaveLength(1);
  });

  it("a successful login clears the failure counter", async () => {
    const { m } = await userWithPassword();
    for (let i = 0; i < 5; i++) await loginWithPassword(m.user.email, "bad bad bad bad", ip());
    expect(await loginWithPassword(m.user.email, GOOD, ip())).toHaveProperty("userId");
    for (let i = 0; i < 5; i++) expect(await loginWithPassword(m.user.email, "bad bad bad bad", ip())).toEqual({ error: "invalid" }); // would be throttled if the counter had persisted
  });

  it("throttles a single IP across many accounts", async () => {
    const one = ip();
    let last: unknown;
    for (let i = 0; i < 32; i++) last = await loginWithPassword(`spray-${i}-${Math.random()}@example.test`, "whatever whatever", one);
    expect(last).toEqual({ error: "throttled" });
  });
});

describe("setting and changing a password", () => {
  it("first password: any signed-in session may set it; policy is enforced", async () => {
    const T = await makeTenant(); const m = await makeMember(T.id);
    const s = await sessionFor(m.user.id);
    expect(s).toMatchObject({ hasPassword: false });
    expect(await setPassword(s, "short")).toMatchObject({ ok: false, field: "password" });
    expect(await setPassword(s, GOOD)).toEqual({ ok: true });
    expect(await loginWithPassword(m.user.email, GOOD, ip())).toHaveProperty("userId");
  });

  it("changing requires the current password unless the session began with an emailed link", async () => {
    const { m } = await userWithPassword();
    const plain = await sessionFor(m.user.id);
    expect(plain).toMatchObject({ hasPassword: true, fresh: false });
    expect(await setPassword(plain, "brand new passphrase here")).toMatchObject({ ok: false, field: "current" });
    expect(await setPassword(plain, "brand new passphrase here", "wrong wrong wrong")).toMatchObject({ ok: false, field: "current" });
    expect(await setPassword(plain, "brand new passphrase here", GOOD)).toEqual({ ok: true });

    const viaLink = await sessionFor(m.user.id, true);
    expect(viaLink.fresh).toBe(true);
    expect(await setPassword(viaLink, "another fresh passphrase 1")).toEqual({ ok: true }); // reset path: no current password
    expect(await loginWithPassword(m.user.email, "another fresh passphrase 1", ip())).toHaveProperty("userId");
    expect(await loginWithPassword(m.user.email, GOOD, ip())).toEqual({ error: "invalid" });
  });

  it("changing a password signs out every other session but keeps this one, and ends the fresh window", async () => {
    const { m } = await userWithPassword();
    const a = await createSessionRow(m.user.id, { viaLink: true });
    const b = await createSessionRow(m.user.id);
    const me = (await lookupSession(a.token))!;
    expect(await setPassword(me, "a brand new long passphrase")).toEqual({ ok: true });
    expect(await lookupSession(b.token)).toBeNull();
    const still = await lookupSession(a.token);
    expect(still).not.toBeNull();
    expect(still!.fresh).toBe(false);
  });
});

describe("reset links and invites", () => {
  it("a 'reset' link request mails the reset message and the token carries that purpose", async () => {
    const { m } = await userWithPassword();
    await requestMagicLink(m.user.email, ip(), "reset");
    const [row] = await sysDb().select().from(schema.loginTokens).where(eq(schema.loginTokens.userId, m.user.id));
    expect(row.purpose).toBe("reset");
    const [mail] = await sysDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.toEmail, m.user.email));
    expect(mail.subject).toMatch(/password/i);
    // unknown address: same call, no mail, no error
    await expect(requestMagicLink(`nobody-${Math.random()}@example.test`, ip(), "reset")).resolves.toBeUndefined();
    const raw = `reset-${Math.random()}`;
    await sysDb().insert(schema.loginTokens).values({ userId: m.user.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + 60_000), purpose: "reset" });
    expect(await redeemLoginToken(raw)).toEqual({ userId: m.user.id, purpose: "reset" });
  });

  const admin = async () => { const T = await makeTenant(); const a = await makeMember(T.id, { role: "admin" }); return { T, a, act: { membershipId: a.membership.id, role: "admin" as const, tenantId: T.id } }; };
  const profile = profileSchema.parse({ displayName: "Pat Person" });

  it("email-bound invite stores the chosen password for a NEW account", async () => {
    const { T, act } = await admin();
    const email = `new-${Math.random().toString(36).slice(2)}@example.test`;
    const inv = await withTenant(T.id, (tx) => createInvite(tx, act, { email, role: "member" }));
    expect(await acceptInvite(inv.token, { email: "", profile, visibility: {}, password: "my chosen long passphrase" })).toMatchObject({ ok: true, mode: "session" });
    expect(await loginWithPassword(email, "my chosen long passphrase", ip())).toHaveProperty("userId");
  });

  it("link-only invite NEVER stores a password (a stranger could otherwise pre-set it on someone else's address)", async () => {
    const { T, act } = await admin();
    const victim = `victim-${Math.random().toString(36).slice(2)}@example.test`;
    const inv = await withTenant(T.id, (tx) => createInvite(tx, act, { role: "member" }));
    await acceptInvite(inv.token, { email: victim, profile, visibility: {}, password: "attacker chosen passphrase" });
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, victim));
    expect(u.passwordHash).toBeNull();
    expect(await loginWithPassword(victim, "attacker chosen passphrase", ip())).toEqual({ error: "invalid" });
  });

  it("an existing account's password is never overwritten by an invite", async () => {
    const { T, act } = await admin();
    const { m } = await userWithPassword();
    const inv = await withTenant(T.id, (tx) => createInvite(tx, act, { email: m.user.email, role: "member" }));
    await acceptInvite(inv.token, { email: "", profile, visibility: {}, password: "overwrite attempt passphrase" });
    expect(await loginWithPassword(m.user.email, GOOD, ip())).toHaveProperty("userId");
    expect(await loginWithPassword(m.user.email, "overwrite attempt passphrase", ip())).toEqual({ error: "invalid" });
  });
});

describe("the hash stays secret", () => {
  it("tenant code cannot read password_hash (column-level grant), but can still read email", async () => {
    const { T, m } = await userWithPassword();
    expect(await rejection(withTenant(T.id, (tx) => tx.execute(`SELECT password_hash FROM users` as never)))).toMatch(/permission denied/);
    expect(await rejection(withTenant(T.id, (tx) => tx.select().from(schema.users)))).toMatch(/permission denied/);
    const emails = await withTenant(T.id, (tx) => tx.select({ email: schema.users.email }).from(schema.users));
    expect(emails.map((e) => e.email)).toContain(m.user.email);
  });
  it("the data export never contains the hash", async () => {
    const { m } = await userWithPassword();
    expect(JSON.stringify(await exportUserData(m.user.id))).not.toMatch(/scrypt|password/i);
  });
  it("stored hashes are not the password", async () => {
    const { m } = await userWithPassword();
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.id, m.user.id));
    expect(u.passwordHash).not.toContain(GOOD);
    expect(await sysDb().select().from(schema.emailOutbox).where(like(schema.emailOutbox.bodyText, `%${GOOD}%`))).toHaveLength(0);
  });
});
