import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { TENANT_TABLES } from "@/db/schema";
import { makeMember, makeTenant } from "./helpers/factory";
import { rejection } from "./helpers/errors";

let A: Awaited<ReturnType<typeof makeTenant>>, B: Awaited<ReturnType<typeof makeTenant>>;
let a: Awaited<ReturnType<typeof makeMember>>, b: Awaited<ReturnType<typeof makeMember>>;
let eventB: string;

beforeAll(async () => {
  A = await makeTenant();
  B = await makeTenant();
  a = await makeMember(A.id, { role: "admin", name: "Alice Alpha" });
  b = await makeMember(B.id, { role: "admin", name: "Bob Beta" });
  const [e] = await sysDb().insert(schema.events).values({ tenantId: B.id, type: "een_ride", title: "B ride", startsAt: new Date(Date.now() + 86400000), timezone: "UTC", status: "published" }).returning();
  eventB = e.id;
  await sysDb().insert(schema.eventSignups).values({ tenantId: B.id, eventId: e.id, membershipId: b.membership.id, status: "going" });
  await sysDb().insert(schema.raceDeclarations).values({ tenantId: B.id, membershipId: b.membership.id, raceName: "B marathon", raceDate: "2026-10-10" });
  await sysDb().insert(schema.auditLog).values({ tenantId: B.id, actorMembershipId: b.membership.id, action: "test" });
  await sysDb().insert(schema.invites).values({ tenantId: B.id, tokenHash: `h-${B.id}`, expiresAt: new Date(Date.now() + 1e6) });
  await sysDb().insert(schema.fieldVisibility).values({ tenantId: B.id, membershipId: b.membership.id, fieldName: "city", visibleTo: "members" });
});
afterAll(closePools);

describe("row-level security: every tenant table", () => {
  for (const table of TENANT_TABLES) {
    it(`${table}: tenant A sees none of tenant B's rows`, async () => {
      const rows = await withTenant(A.id, async (tx) => (await tx.execute(`SELECT tenant_id FROM "${table}"` as never)).rows as { tenant_id: string }[]);
      expect(rows.every((r) => r.tenant_id === A.id)).toBe(true);
    });
  }

  it("with no tenant set the app role sees zero rows", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    for (const table of TENANT_TABLES) {
      const r = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
      expect(r.rows[0].n, table).toBe(0);
    }
    await pool.end();
  });

  it("every tenant table has RLS enabled with a policy", async () => {
    const { rows } = await sysDb().execute<{ relname: string; relrowsecurity: boolean; n: number }>(
      `SELECT c.relname, c.relrowsecurity, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS n
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_name = c.relname AND col.column_name = 'tenant_id' AND col.table_schema = 'public')
          AND c.relname NOT IN ('email_outbox')` as never,
    );
    for (const r of rows) {
      expect(r.relrowsecurity, r.relname).toBe(true);
      expect(r.n, r.relname).toBeGreaterThan(0);
    }
    expect(rows.map((r) => r.relname).sort()).toEqual([...TENANT_TABLES].sort());
  });

  it("cannot insert a row for another tenant", async () => {
    await expect(
      withTenant(A.id, (tx) => tx.insert(schema.raceDeclarations).values({ tenantId: B.id, membershipId: a.membership.id, raceName: "x", raceDate: "2026-01-01" })),
    ).rejects.toThrow();
  });

  it("cannot update or delete another tenant's rows (silently zero rows)", async () => {
    const upd = await withTenant(A.id, (tx) => tx.update(schema.events).set({ title: "pwned" }).where(eq(schema.events.id, eventB)).returning());
    expect(upd).toHaveLength(0);
    const del = await withTenant(A.id, (tx) => tx.delete(schema.events).where(eq(schema.events.id, eventB)).returning());
    expect(del).toHaveLength(0);
    const [still] = await sysDb().select().from(schema.events).where(eq(schema.events.id, eventB));
    expect(still.title).toBe("B ride");
  });

  it("cannot reference another tenant's parent row (cross-tenant FK trigger)", async () => {
    expect(await rejection(withTenant(A.id, (tx) => tx.insert(schema.eventSignups).values({ tenantId: A.id, eventId: eventB, membershipId: a.membership.id, status: "going" })))).toMatch(/cross-tenant/);
    expect(await rejection(withTenant(A.id, (tx) => tx.insert(schema.eventSignups).values({ tenantId: A.id, eventId: eventB, membershipId: b.membership.id, status: "going" })))).toMatch(/cross-tenant/);
  });

  it("users: a tenant only sees users who are members of it", async () => {
    const seen = await withTenant(A.id, (tx) => tx.select({ id: schema.users.id }).from(schema.users));
    expect(seen.map((u) => u.id)).toContain(a.user.id);
    expect(seen.map((u) => u.id)).not.toContain(b.user.id);
  });

  it("tenants: a tenant only sees its own row", async () => {
    const seen = await withTenant(A.id, (tx) => tx.select({ id: schema.tenants.id }).from(schema.tenants));
    expect(seen.map((t) => t.id)).toEqual([A.id]);
  });

  it("system tables are not readable by the app role", async () => {
    for (const t of ["sessions", "login_tokens", "rate_limits", "email_outbox"]) {
      expect(await rejection(withTenant(A.id, (tx) => tx.execute(`SELECT 1 FROM ${t} LIMIT 1` as never))), t).toMatch(/permission denied/);
    }
  });

  it("the app role cannot write users", async () => {
    expect(await rejection(withTenant(A.id, (tx) => tx.insert(schema.users).values({ email: "evil@example.test" })))).toMatch(/permission denied/);
  });

  it("tenant id does not leak between pooled connections", async () => {
    await withTenant(A.id, async (tx) => tx.select().from(schema.memberships));
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const r = await pool.query("SELECT current_setting('app.tenant_id', true) AS t");
    expect(r.rows[0].t ?? "").toBe("");
    await pool.end();
  });

  it("memberships of tenant B are invisible even when queried by id", async () => {
    const r = await withTenant(A.id, (tx) => tx.select().from(schema.memberships).where(and(eq(schema.memberships.id, b.membership.id))));
    expect(r).toHaveLength(0);
  });
});
