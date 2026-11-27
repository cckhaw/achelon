import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type pg from "pg";
import * as schema from "@/db/schema";
import { env, ownerDatabaseUrl } from "@/lib/env";
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
  return (g.__sysPool ??= makePool(ownerDatabaseUrl(), 3));
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

/**
 * Fail closed: never serve tenant data as a role that is exempt from RLS. The check runs inside the tenant transaction,
 * AFTER switching role, so it inspects the role that will actually run the queries.
 */
async function assertRlsEnforced(tx: Tx) {
  if (g.__rlsChecked) return;
  const res = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean; owns: boolean; who: string }>(sql`
    SELECT r.rolsuper, r.rolbypassrls, current_user AS who,
           EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'memberships' AND c.relnamespace = 'public'::regnamespace AND c.relowner = r.oid) AS owns
      FROM pg_roles r WHERE r.rolname = current_user`);
  const r = res.rows[0];
  if (!r || r.rolsuper || r.rolbypassrls || r.owns) {
    console.error(`[security] DB_APP_ROLE (${env().DB_APP_ROLE}) must not own tables, be a superuser or have BYPASSRLS.`);
    throw new RlsExemptError("the application role bypasses row-level security");
  }
  g.__rlsChecked = true;
}

/**
 * The only way to touch tenant-owned tables. Runs `fn` in a transaction that (1) switches to the restricted application
 * role, so RLS applies even when the connection itself logged in as the table owner (e.g. a managed Postgres' single
 * URL), and (2) sets `app.tenant_id`. Both are transaction-local, so a pooled connection can never leak either.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("withTenant requires a tenantId");
  const db = drizzle(appPool(), { schema });
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE "${env().DB_APP_ROLE}"`)); // role name is validated against ^[a-z_][a-z0-9_]*$
    await assertRlsEnforced(tx);
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
