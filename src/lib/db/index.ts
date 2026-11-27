import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type pg from "pg";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { makePool } from "./pool";

export { schema };
export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as {
  __appPool?: pg.Pool;
  __sysPool?: pg.Pool;
  __rlsChecked?: boolean;
};

function appPool() {
  return (g.__appPool ??= makePool(env().DATABASE_URL));
}
function sysPool() {
  return (g.__sysPool ??= makePool(env().DATABASE_URL_OWNER, 3));
}

/**
 * SYSTEM connection (table owner, bypasses RLS). Use ONLY from `src/lib/system/*` (login, sessions, invite acceptance,
 * tenant lookup by slug, cron). ESLint forbids importing it elsewhere. Never put request-supplied tenant ids in a
 * query without an explicit `tenant_id` predicate.
 */
export function sysDb(): Db {
  return drizzle(sysPool(), { schema });
}

/** Pool access for tests that need to close connections. */
export async function closePools() {
  await Promise.all([g.__appPool?.end(), g.__sysPool?.end()]);
  g.__appPool = undefined;
  g.__sysPool = undefined;
  g.__rlsChecked = false;
}

export class RlsExemptError extends Error {
  constructor(detail: string) {
    super(`Tenant isolation is not enforced: ${detail}`);
    this.name = "RlsExemptError";
  }
}

/** Fail closed: never serve tenant data over a connection that is exempt from RLS. Checked once per process. */
async function assertRlsEnforced() {
  if (g.__rlsChecked) return;
  const { rows } = await appPool().query<{ rolsuper: boolean; rolbypassrls: boolean; owns: boolean }>(
    `SELECT r.rolsuper, r.rolbypassrls,
            EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'memberships' AND c.relnamespace = 'public'::regnamespace AND c.relowner = r.oid) AS owns
       FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const r = rows[0];
  if (!r || r.rolsuper || r.rolbypassrls || r.owns) {
    console.error("[security] DATABASE_URL must be the non-owner role achelon_app (no superuser, no BYPASSRLS).");
    throw new RlsExemptError("DATABASE_URL role bypasses row-level security");
  }
  g.__rlsChecked = true;
}

/**
 * The only way to touch tenant-owned tables. Runs `fn` in a transaction whose `app.tenant_id` is set (transaction-local,
 * so a pooled connection can never leak it to another request).
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("withTenant requires a tenantId");
  await assertRlsEnforced();
  const db = drizzle(appPool(), { schema });
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** System transaction (owner role). Same caveats as sysDb(). */
export async function sysTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sysDb().transaction(fn);
}

export function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
