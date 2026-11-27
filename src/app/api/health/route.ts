import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { sysDb, withTenant } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Coarse, secret-free status. Never returns hostnames, role names or counts. */
export async function GET() {
  const checks: Record<string, string> = { db: "error", rls: "error" };
  try {
    await sysDb().execute(sql`SELECT 1`);
    checks.db = "ok";
    const t = await sysDb().execute<{ id: string }>(sql`SELECT id FROM tenants LIMIT 1`);
    const id = t.rows[0]?.id ?? "00000000-0000-0000-0000-000000000000";
    await withTenant(id, (tx) => tx.execute(sql`SELECT 1`));
    checks.rls = "ok";
  } catch {
    /* leave as error */
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
