import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Managed Postgres (Neon) hands out ONE owner URL. The app must still enforce RLS: it connects with that URL and
 * switches to the restricted role inside every tenant transaction. These tests re-import the db module with different
 * environments to prove both the isolation and the fail-closed guard.
 */
const OWNER = process.env.TEST_DATABASE_URL_OWNER ?? "postgresql://achelon:achelon@localhost:5432/achelon_test";
const saved = { ...process.env };
afterEach(async () => {
  try { await (await import("@/lib/db")).closePools(); } catch { /* not loaded */ }
  process.env = { ...saved };
  vi.resetModules();
});

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return import("@/lib/db");
}

describe("single owner URL (Neon integration style)", () => {
  it("runs tenant queries as the restricted role and still isolates tenants", async () => {
    const db = await load({ DATABASE_URL: OWNER, DATABASE_URL_OWNER: undefined });
    const { makeTenant, makeMember } = await import("./helpers/factory");
    const A = await makeTenant(); const B = await makeTenant();
    await makeMember(A.id, { name: "Only in A" }); await makeMember(B.id, { name: "Only in B" });

    const who = await db.withTenant(A.id, async (tx) => (await tx.execute<{ u: string }>(`SELECT current_user AS u` as never)).rows[0].u);
    expect(who).toBe("achelon_app");
    const names = await db.withTenant(A.id, async (tx) => (await tx.select({ n: db.schema.memberProfiles.displayName }).from(db.schema.memberProfiles)).map((r) => r.n));
    expect(names).toContain("Only in A");
    expect(names).not.toContain("Only in B");
    // System tables stay closed to tenant code even though the login role could read them.
    await expect(db.withTenant(A.id, (tx) => tx.execute(`SELECT 1 FROM sessions LIMIT 1` as never))).rejects.toThrow();
    // The role is restored after the transaction: a later system query is not stuck in the restricted role.
    const sysUser = (await db.sysDb().execute<{ u: string }>(`SELECT current_user AS u` as never)).rows[0].u;
    expect(sysUser).not.toBe("achelon_app");
  });

  it("fails closed if the 'application role' is actually the table owner", async () => {
    const db = await load({ DATABASE_URL: OWNER, DATABASE_URL_OWNER: undefined, DB_APP_ROLE: "achelon" });
    const { makeTenant } = await import("./helpers/factory");
    const T = await makeTenant();
    await expect(db.withTenant(T.id, async () => 1)).rejects.toThrow(/bypasses row-level security/);
  });

  it("rejects a malformed role name before it can reach SQL", async () => {
    const db = await load({ DATABASE_URL: OWNER, DB_APP_ROLE: 'x"; DROP TABLE users; --' });
    await expect(db.withTenant("00000000-0000-0000-0000-000000000000", async () => 1)).rejects.toThrow(/Invalid environment/);
  });
});
