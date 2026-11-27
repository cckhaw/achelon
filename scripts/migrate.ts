/**
 * Applies drizzle/*.sql as the OWNER role, then (re)provisions the RLS-enforced runtime role `achelon_app`
 * and its grants. Idempotent. Run in CI before every deploy.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { makePool } from "../src/lib/db/pool";

const ownerUrl = process.env.DATABASE_URL_OWNER;
if (!ownerUrl) {
  console.error("DATABASE_URL_OWNER is not set");
  process.exit(1);
}
const appPassword = process.env.APP_DB_PASSWORD;

const pool = makePool(ownerUrl, 1);
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");

  const role = "achelon_app";
  const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  if (!exists.rowCount) {
    if (!appPassword) throw new Error("APP_DB_PASSWORD is required to create the achelon_app role");
    // Identifiers/literals cannot be bound parameters in CREATE ROLE; the password is escaped as a literal.
    const lit = (await pool.query("SELECT quote_literal($1) AS v", [appPassword])).rows[0].v as string;
    await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD ${lit} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    console.log(`Created role ${role}.`);
  } else if (appPassword) {
    const lit = (await pool.query("SELECT quote_literal($1) AS v", [appPassword])).rows[0].v as string;
    await pool.query(`ALTER ROLE ${role} PASSWORD ${lit}`);
  }

  const db = (await pool.query("SELECT current_database() AS d")).rows[0].d as string;
  await pool.query(`GRANT CONNECT ON DATABASE "${db}" TO ${role}`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await pool.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
  const tenant = [
    "memberships", "member_profiles", "field_visibility", "invites", "applications", "events", "event_invitees",
    "event_signups", "race_declarations", "announcements", "event_recaps", "calendar_tokens",
    "notification_preferences", "audit_log", "strava_connections", "event_results",
  ];
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tenant.map((t) => `"${t}"`).join(", ")} TO ${role}`);
  await pool.query(`GRANT SELECT, UPDATE ON tenants TO ${role}`);
  await pool.query(`GRANT SELECT ON users TO ${role}`); // RLS limits this to members of the current tenant
  // sessions, login_tokens, rate_limits, email_outbox: system tables, intentionally NO grant to the app role.
  console.log("Grants applied.");
} catch (e) {
  console.error("Migration failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
