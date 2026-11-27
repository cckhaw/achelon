import pg from "pg";

// Neon (and most managed Postgres) needs TLS; local connections do not.
export function makePool(url: string, max = 5): pg.Pool {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
  });
}
