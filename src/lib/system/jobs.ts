import "server-only";
import { sysDb, schema } from "@/lib/db";
import { sendDigests, sendReminders } from "@/lib/notifications";
import { tenantSettings } from "@/lib/system/tenants";

/** Daily housekeeping fan-out (Vercel Cron, 05:10 UTC). Per-tenant work goes through withTenant inside each helper. */
export async function runDailyJobs(now = new Date()): Promise<Record<string, unknown>> {
  const tenants = await sysDb().select().from(schema.tenants);
  const out: Record<string, { reminders: number; digests: number }> = {};
  for (const t of tenants) {
    const tz = tenantSettings(t).defaultTimezone;
    const reminders = await sendReminders(t.id, t.name, t.slug, tz, now).catch((e) => { console.error("[job] reminders", t.slug, e instanceof Error ? e.message : e); return 0; });
    const digests = now.getUTCDay() === 1 ? await sendDigests(t.id, t.name, t.slug, tz, now).catch((e) => { console.error("[job] digest", t.slug, e instanceof Error ? e.message : e); return 0; }) : 0;
    out[t.slug] = { reminders, digests };
  }
  return out;
}
