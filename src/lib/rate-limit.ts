import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { sysDb, schema } from "@/lib/db";
import { bucketKey } from "@/lib/crypto";

export interface RateRule {
  limit: number;
  windowSeconds: number;
}
export const RULES = {
  loginIp: { limit: 20, windowSeconds: 900 },
  loginEmail: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 30, windowSeconds: 900 },
  inviteView: { limit: 40, windowSeconds: 600 },
  inviteAccept: { limit: 10, windowSeconds: 900 },
  calendarIp: { limit: 120, windowSeconds: 600 },
  passwordIp: { limit: 30, windowSeconds: 900 },
  /** Counts failures only, so a stranger can't lock someone out by merely trying; correct logins never count. */
  passwordFail: { limit: 8, windowSeconds: 900 },
  passwordChange: { limit: 10, windowSeconds: 900 },
} satisfies Record<string, RateRule>;

/** Vercel sets x-forwarded-for itself, so the first hop is trustworthy there. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Atomically records a hit and reports whether the caller is still within the rule. */
export async function hit(scope: string, id: string, rule: RateRule): Promise<boolean> {
  const key = bucketKey(scope, id);
  const win = sql.raw(`interval '${Math.floor(rule.windowSeconds)} seconds'`);
  const [row] = await sysDb()
    .insert(schema.rateLimits)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimits.windowStart} < now() - ${win} THEN 1 ELSE ${schema.rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${schema.rateLimits.windowStart} < now() - ${win} THEN now() ELSE ${schema.rateLimits.windowStart} END`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return row.count <= rule.limit;
}

/** Read-only: is this bucket already over its limit? (Used for failure-only counters.) */
export async function isLimited(scope: string, id: string, rule: RateRule): Promise<boolean> {
  const key = bucketKey(scope, id);
  const [row] = await sysDb().select().from(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${key}`);
  if (!row) return false;
  if (Date.now() - row.windowStart.getTime() >= rule.windowSeconds * 1000) return false;
  return row.count >= rule.limit;
}

export async function clearLimit(scope: string, id: string): Promise<void> {
  await sysDb().delete(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${bucketKey(scope, id)}`);
}
