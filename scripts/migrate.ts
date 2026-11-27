/**
 * Applies drizzle/*.sql as the OWNER role, then (re)provisions the RLS-enforced runtime role `achelon_app`
 * and its grants. Idempotent. Run in CI before every deploy.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { makePool } from "../src/lib/db/pool";

const ownerUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!ownerUrl) {
  console.error("DATABASE_URL_OWNER (or DATABASE_URL) is not set");
  process.exit(1);
}
const appPassword = process.env.APP_DB_PASSWORD;

const pool = makePool(ownerUrl, 1);
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");

  const role = process.env.DB_APP_ROLE ?? "achelon_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error("Invalid DB_APP_ROLE");
  const lit = async (v: string) => (await pool.query("SELECT quote_literal($1) AS v", [v])).rows[0].v as string;
  const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  if (!exists.rowCount) {
    // With a password the role can also log in directly (separate-URL setup). Without one it is NOLOGIN and is only ever
    // reached by SET ROLE from the owner connection, which needs no second secret.
    const login = appPassword ? `LOGIN PASSWORD ${await lit(appPassword)}` : "NOLOGIN";
    await pool.query(`CREATE ROLE ${role} ${login} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    console.log(`Created role ${role} (${appPassword ? "login" : "nologin, via SET ROLE"}).`);
  } else if (appPassword) {
    await pool.query(`ALTER ROLE ${role} PASSWORD ${await lit(appPassword)}`);
  }
  // The owner connection must be allowed to switch into the restricted role (PG16: explicit SET option).
  await pool.query(`GRANT ${role} TO CURRENT_USER WITH SET TRUE, INHERIT FALSE`);

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
