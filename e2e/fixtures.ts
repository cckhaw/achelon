import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

/**
 * Direct-DB fixtures (owner connection), so the same specs run against local dev, CI and production without a
 * mailbox: we mint a known single-use login token instead of reading an email. All data is fictional and
 * namespaced by a random run id; `cleanup` removes it.
 */
const ownerUrl = process.env.DATABASE_URL_OWNER ?? "postgresql://achelon:achelon@localhost:5432/achelon";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface Run {
  id: string;
  slug: string;
  adminEmail: string;
  memberEmail: string;
  guestEmail: string;
  tenantId: string;
}

function pool() {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(ownerUrl);
  return new pg.Pool({ connectionString: ownerUrl, max: 1, ssl: local ? undefined : { rejectUnauthorized: true } });
}

export async function createRun(): Promise<Run> {
  const id = randomBytes(4).toString("hex");
  const slug = `e2e-${id}`;
  const p = pool();
  try {
    // Local runs share one client IP and would trip the (intentionally strict) rate limits; never touch a remote database.
    if (/@(localhost|127\.0\.0\.1)[:/]/.test(ownerUrl)) await p.query("DELETE FROM rate_limits");
    const t = await p.query("INSERT INTO tenants (slug, name, settings) VALUES ($1, $2, $3) RETURNING id", [slug, `E2E Club ${id}`, JSON.stringify({ defaultTimezone: "Europe/London" })]);
    const tenantId = t.rows[0].id as string;
    const adminEmail = `admin-${id}@e2e.invalid`;
    const memberEmail = `member-${id}@e2e.invalid`;
    const guestEmail = `guest-${id}@e2e.invalid`;
    for (const [email, role, name] of [[adminEmail, "owner", "Erin Example"], [memberEmail, "member", "Marco Example"], [guestEmail, "guest", "Gita Example"]] as const) {
      const u = await p.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [email]);
      const m = await p.query("INSERT INTO memberships (tenant_id, user_id, role, status, joined_at) VALUES ($1,$2,$3,'active', now()) RETURNING id", [tenantId, u.rows[0].id, role]);
      await p.query("INSERT INTO member_profiles (membership_id, tenant_id, display_name, city, sports) VALUES ($1,$2,$3,'London','{cycling}')", [m.rows[0].id, tenantId, name]);
      await p.query("INSERT INTO notification_preferences (membership_id, tenant_id) VALUES ($1,$2)", [m.rows[0].id, tenantId]);
    }
    return { id, slug, adminEmail, memberEmail, guestEmail, tenantId };
  } finally {
    await p.end();
  }
}

/** A single-use sign-in link path for `email`, valid for 15 minutes. */
export async function loginPath(email: string): Promise<string> {
  const raw = randomBytes(24).toString("base64url");
  const p = pool();
  try {
    await p.query("INSERT INTO login_tokens (user_id, token_hash, expires_at) SELECT id, $2, now() + interval '15 minutes' FROM users WHERE email = $1", [email, sha(raw)]);
  } finally {
    await p.end();
  }
  return `/login/verify?token=${raw}`;
}

export async function cleanup(run: Run) {
  const p = pool();
  try {
    await p.query("DELETE FROM users WHERE email LIKE $1", [`%-${run.id}@e2e.invalid`]);
    await p.query("DELETE FROM users WHERE email LIKE $1", [`newbie-${run.id}%@e2e.invalid`]);
    await p.query("DELETE FROM tenants WHERE id = $1", [run.tenantId]);
    await p.query("DELETE FROM email_outbox WHERE to_email LIKE $1", [`%${run.id}%@e2e.invalid`]);
  } finally {
    await p.end();
  }
}

/** Insert a published event straight into the DB (for screens that need one without driving the UI). */
export async function createEventDirect(run: Run, title = "Fixture ride"): Promise<string> {
  const p = pool();
  try {
    const r = await p.query("INSERT INTO events (tenant_id, type, title, description, starts_at, timezone, location_name, capacity, status) VALUES ($1,'een_ride',$2,'Easy pace. **Coffee after.**', now() + interval '5 days', 'Europe/London', 'Hyde Park Corner', 10, 'published') RETURNING id", [run.tenantId, title]);
    return r.rows[0].id as string;
  } finally {
    await p.end();
  }
}
