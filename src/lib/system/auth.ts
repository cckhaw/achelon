import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { sysDb, sysTx, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { enqueue } from "@/lib/mail/outbox";
import { magicLinkMail } from "@/lib/mail/templates";
import { hit, RULES } from "@/lib/rate-limit";

export const LOGIN_TOKEN_TTL_MIN = 15;
export const SESSION_TTL_DAYS = 30;
const MIN_RESPONSE_MS = 400; // floor so known/unknown addresses cost the same wall time (D-7)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Always resolves the same way. Sends mail only to a live user with an active membership. */
export async function requestMagicLink(email: string, ip: string): Promise<void> {
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
        await issueLoginToken(row.id, token, email);
      } else {
        sha256Hex(token); // equalise hashing work for unknown addresses
      }
    }
  } finally {
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
  }
}

export async function issueLoginToken(userId: string, rawToken: string, email: string, tenantName?: string, kind: "login" | "confirm" = "login") {
  const db = sysDb();
  await db.update(schema.loginTokens).set({ usedAt: new Date() }).where(and(eq(schema.loginTokens.userId, userId), isNull(schema.loginTokens.usedAt)));
  await db.insert(schema.loginTokens).values({
    userId,
    tokenHash: sha256Hex(rawToken),
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MIN * 60_000),
  });
  const url = `${env().APP_URL}/login/verify?token=${rawToken}`;
  const mail = kind === "confirm" && tenantName ? (await import("@/lib/mail/templates")).confirmEmailMail(url, tenantName) : magicLinkMail(url);
  await enqueue({ to: email, ...mail, category: "essential", dedupeKey: `login:${userId}:${sha256Hex(rawToken).slice(0, 16)}` });
}

/** Single-use redemption. Also activates memberships created by link-only invites awaiting email confirmation. */
export async function redeemLoginToken(raw: string): Promise<{ userId: string } | null> {
  return sysTx(async (tx) => {
    const [t] = await tx
      .update(schema.loginTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.loginTokens.tokenHash, sha256Hex(raw)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())))
      .returning({ userId: schema.loginTokens.userId });
    if (!t) return null;
    const [u] = await tx.select({ id: schema.users.id, deletedAt: schema.users.deletedAt }).from(schema.users).where(eq(schema.users.id, t.userId)).limit(1);
    if (!u || u.deletedAt) return null;
    await tx.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    // Email ownership is now proven: finish memberships that were waiting on it.
    await tx
      .update(schema.memberships)
      .set({ status: "active", joinedAt: new Date() })
      .where(and(eq(schema.memberships.userId, u.id), eq(schema.memberships.status, "invited")));
    return { userId: u.id };
  });
}

export async function createSessionRow(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await sysDb().insert(schema.sessions).values({ userId, tokenHash: sha256Hex(token), expiresAt: expires });
  return { token, expires };
}

export interface SessionUser {
  id: string;
  email: string;
  sessionId: string;
}

export async function lookupSession(raw: string | undefined): Promise<SessionUser | null> {
  if (!raw) return null;
  const db = sysDb();
  const [row] = await db
    .select({ sid: schema.sessions.id, uid: schema.users.id, email: schema.users.email, lastSeenAt: schema.sessions.lastSeenAt, deletedAt: schema.users.deletedAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256Hex(raw)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.deletedAt) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 3_600_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, row.sid));
  }
  return { id: row.uid, email: row.email, sessionId: row.sid };
}

export async function destroySession(raw: string) {
  await sysDb().delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256Hex(raw)));
}
export async function destroyAllSessions(userId: string) {
  await sysDb().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}
