import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { sysDb, sysTx, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { enqueue } from "@/lib/mail/outbox";
import { magicLinkMail, passwordResetMail } from "@/lib/mail/templates";
import { clearLimit, hit, isLimited, RULES } from "@/lib/rate-limit";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/password-policy";

export const LOGIN_TOKEN_TTL_MIN = 15;
export const SESSION_TTL_DAYS = 30;
const MIN_RESPONSE_MS = 400; // floor so known/unknown addresses cost the same wall time (D-7)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Always resolves the same way. Sends mail only to a live user with an active membership. */
export async function requestMagicLink(email: string, ip: string, purpose: "login" | "reset" = "login"): Promise<void> {
  const started = Date.now();
  try {
    const okIp = await hit("login-ip", ip, RULES.loginIp);
    const okEmail = await hit("login-email", email, RULES.loginEmail);
    if (okIp && okEmail) {
      const db = sysDb();
      const [row] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt),
          sql`EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = ${schema.users.id} AND m.status IN ('active','invited'))`))
        .limit(1);
      const token = randomToken();
      if (row) {
        await issueLoginToken(row.id, token, email, undefined, purpose === "reset" ? "reset" : "login");
      } else {
        sha256Hex(token); // equalise hashing work for unknown addresses
      }
    }
  } finally {
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
  }
}

export async function issueLoginToken(userId: string, rawToken: string, email: string, tenantName?: string, kind: "login" | "confirm" | "reset" = "login") {
  const db = sysDb();
  await db.update(schema.loginTokens).set({ usedAt: new Date() }).where(and(eq(schema.loginTokens.userId, userId), isNull(schema.loginTokens.usedAt)));
  await db.insert(schema.loginTokens).values({
    userId,
    tokenHash: sha256Hex(rawToken),
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MIN * 60_000),
    purpose: kind === "reset" ? "reset" : "login",
  });
  const url = `${env().APP_URL}/login/verify?token=${rawToken}`;
  const mail = kind === "confirm" && tenantName ? (await import("@/lib/mail/templates")).confirmEmailMail(url, tenantName) : kind === "reset" ? passwordResetMail(url) : magicLinkMail(url);
  await enqueue({ to: email, ...mail, category: "essential", dedupeKey: `login:${userId}:${sha256Hex(rawToken).slice(0, 16)}` });
}

/** Single-use redemption. Also activates memberships created by link-only invites awaiting email confirmation. */
export async function redeemLoginToken(raw: string): Promise<{ userId: string; purpose: "login" | "reset" } | null> {
  return sysTx(async (tx) => {
    const [t] = await tx
      .update(schema.loginTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.loginTokens.tokenHash, sha256Hex(raw)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())))
      .returning({ userId: schema.loginTokens.userId, purpose: schema.loginTokens.purpose });
    if (!t) return null;
    const [u] = await tx.select({ id: schema.users.id, deletedAt: schema.users.deletedAt }).from(schema.users).where(eq(schema.users.id, t.userId)).limit(1);
    if (!u || u.deletedAt) return null;
    await tx.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    // Email ownership is now proven: finish memberships that were waiting on it.
    await tx
      .update(schema.memberships)
      .set({ status: "active", joinedAt: new Date() })
      .where(and(eq(schema.memberships.userId, u.id), eq(schema.memberships.status, "invited")));
    return { userId: u.id, purpose: t.purpose === "reset" ? "reset" : "login" };
  });
}

export const FRESH_MINUTES = 15;

/** `viaLink`: the session began with an emailed link, so the person has just proven they control the mailbox. */
export async function createSessionRow(userId: string, o: { viaLink?: boolean } = {}): Promise<{ token: string; expires: Date }> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await sysDb().insert(schema.sessions).values({ userId, tokenHash: sha256Hex(token), expiresAt: expires, freshUntil: o.viaLink ? new Date(Date.now() + FRESH_MINUTES * 60_000) : null });
  return { token, expires };
}

export interface SessionUser {
  id: string;
  email: string;
  sessionId: string;
  hasPassword: boolean;
  /** True for a few minutes after signing in by emailed link: a password may be set without the current one. */
  fresh: boolean;
}

export async function lookupSession(raw: string | undefined): Promise<SessionUser | null> {
  if (!raw) return null;
  const db = sysDb();
  const [row] = await db
    .select({ sid: schema.sessions.id, uid: schema.users.id, email: schema.users.email, lastSeenAt: schema.sessions.lastSeenAt, deletedAt: schema.users.deletedAt, freshUntil: schema.sessions.freshUntil, pw: schema.users.passwordHash })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256Hex(raw)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.deletedAt) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 3_600_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, row.sid));
  }
  return { id: row.uid, email: row.email, sessionId: row.sid, hasPassword: Boolean(row.pw), fresh: Boolean(row.freshUntil && row.freshUntil.getTime() > Date.now()) };
}

export async function destroySession(raw: string) {
  await sysDb().delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256Hex(raw)));
}
export async function destroyAllSessions(userId: string) {
  await sysDb().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}


/** Same, deliberately vague answer for every failure so the form can't be used to discover who has an account. */
export async function loginWithPassword(email: string, password: string, ip: string): Promise<{ userId: string } | { error: "invalid" | "throttled" }> {
  if (!(await hit("password-ip", ip, RULES.passwordIp))) return { error: "throttled" };
  if (await isLimited("password-fail", email, RULES.passwordFail)) {
    await verifyPassword(password, await dummyHash()); // same cost as a real attempt
    return { error: "throttled" };
  }
  const db = sysDb();
  const [u] = await db.select({ id: schema.users.id, hash: schema.users.passwordHash }).from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt),
      sql`EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = ${schema.users.id} AND m.status = 'active')`)).limit(1);
  const ok = await verifyPassword(password.slice(0, 200), u?.hash ?? (await dummyHash()));
  if (!u?.hash || !ok) {
    await hit("password-fail", email, RULES.passwordFail); // only failures count against the account
    return { error: "invalid" };
  }
  await clearLimit("password-fail", email);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  return { userId: u.id };
}

export type SetPasswordResult = { ok: true } | { ok: false; error: string; field?: "current" | "password" };

/**
 * Set or change a password. Allowed when: the person has none yet and is signed in, or the session began with an emailed
 * link in the last 15 minutes (the reset path), or the current password is supplied and correct. Ends all other sessions.
 */
export async function setPassword(sessionUser: { id: string; email: string; sessionId: string; hasPassword: boolean; fresh: boolean }, newPassword: string, currentPassword?: string): Promise<SetPasswordResult> {
  if (!(await hit("password-change", sessionUser.id, RULES.passwordChange))) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  const problem = passwordProblem(newPassword, sessionUser.email);
  if (problem) return { ok: false, error: problem, field: "password" };
  const db = sysDb();
  if (sessionUser.hasPassword && !sessionUser.fresh) {
    const [u] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, sessionUser.id));
    if (!currentPassword || !u?.hash || !(await verifyPassword(currentPassword.slice(0, 200), u.hash))) return { ok: false, error: "Your current password isn't right. If you've forgotten it, sign out and use “Forgot password?”.", field: "current" };
  }
  const hash = await hashPassword(newPassword);
  await sysTx(async (tx) => {
    await tx.update(schema.users).set({ passwordHash: hash, passwordSetAt: new Date() }).where(eq(schema.users.id, sessionUser.id));
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.userId, sessionUser.id), sql`${schema.sessions.id} <> ${sessionUser.sessionId}`));
    await tx.update(schema.sessions).set({ freshUntil: null }).where(eq(schema.sessions.id, sessionUser.sessionId));
  });
  return { ok: true };
}

/** Invite acceptance for a brand-new account whose mailbox the invite token already proved (email-bound invites only). */
export const hashForNewAccount = hashPassword;
