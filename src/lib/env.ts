import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  /** Optional: when unset, DATABASE_URL (e.g. the Neon integration's owner URL) is used for system work too. */
  DATABASE_URL_OWNER: z.string().min(1).optional(),
  /** The restricted role every tenant transaction runs as (SET LOCAL ROLE). Must not own tables or bypass RLS. */
  DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/).default("achelon_app"),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(8).optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Achelon <noreply@khaw.cc>"),
  /** Comma-separated emails of platform operators (may create and suspend communities at /platform). Empty = nobody. */
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
  STRAVA_MODE: z.enum(["off", "mock", "live"]).default("off"),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_API_BASE_URL: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/** Parsed and validated environment. Throws a readable error naming the bad keys (never their values). */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Invalid environment: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => process.env.NODE_ENV === "production";

export const ownerDatabaseUrl = () => env().DATABASE_URL_OWNER ?? env().DATABASE_URL;
