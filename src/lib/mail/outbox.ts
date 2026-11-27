import "server-only";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { sysDb, schema } from "@/lib/db";

/**
 * Transactional outbox (system table). `enqueue` is idempotent on `dedupeKey`; `flush` sends pending rows and is safe
 * to call repeatedly (rows are claimed with SKIP LOCKED). Without RESEND_API_KEY mail is logged, never sent.
 */
export interface OutgoingMail {
  tenantId?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  category: "essential" | "announcement" | "reminder" | "waitlist";
  dedupeKey: string;
}

export async function enqueue(mail: OutgoingMail): Promise<boolean> {
  const rows = await sysDb()
    .insert(schema.emailOutbox)
    .values({
      tenantId: mail.tenantId ?? null,
      toEmail: mail.to,
      subject: mail.subject,
      bodyText: mail.text,
      bodyHtml: mail.html ?? null,
      category: mail.category,
      dedupeKey: mail.dedupeKey,
    })
    .onConflictDoNothing({ target: schema.emailOutbox.dedupeKey })
    .returning({ id: schema.emailOutbox.id });
  return rows.length > 0;
}

/** Captured mail for tests and e2e (only when no provider key is set). */
export const devMailbox: OutgoingMail[] = [];

async function deliver(m: typeof schema.emailOutbox.$inferSelect): Promise<void> {
  const key = env().RESEND_API_KEY;
  if (!key) {
    console.log(`[mail:dev] to=${m.toEmail} subject="${m.subject}"\n${m.bodyText}\n`);
    devMailbox.push({ to: m.toEmail, subject: m.subject, text: m.bodyText, html: m.bodyHtml ?? undefined, category: m.category, dedupeKey: m.dedupeKey });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": m.id },
    body: JSON.stringify({ from: env().MAIL_FROM, to: [m.toEmail], subject: m.subject, text: m.bodyText, html: m.bodyHtml ?? undefined }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

export async function flush(limit = 25): Promise<{ sent: number; failed: number }> {
  const db = sysDb();
  let sent = 0;
  let failed = 0;
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      SELECT id FROM email_outbox WHERE status = 'pending' AND attempts < 5
      ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
    const ids = rows.rows.map((r) => r.id);
    if (!ids.length) return [];
    await tx.execute(sql`UPDATE email_outbox SET attempts = attempts + 1 WHERE id = ANY(${ids}::uuid[])`);
    return tx.select().from(schema.emailOutbox).where(sql`${schema.emailOutbox.id} = ANY(${ids}::uuid[])`).orderBy(asc(schema.emailOutbox.createdAt));
  });
  for (const m of claimed) {
    try {
      await deliver(m);
      // With a real provider, sign-in/invite bodies hold single-use links: don't keep them once delivered.
      const scrub = env().RESEND_API_KEY && m.category === "essential" ? { bodyText: "[delivered]", bodyHtml: null } : {};
      await db.update(schema.emailOutbox).set({ status: "sent", sentAt: new Date(), error: null, ...scrub }).where(eq(schema.emailOutbox.id, m.id));
      sent++;
    } catch (e) {
      const final = m.attempts >= 5;
      await db.update(schema.emailOutbox).set({ status: final ? "failed" : "pending", error: e instanceof Error ? e.message.slice(0, 200) : "error" }).where(eq(schema.emailOutbox.id, m.id));
      failed++;
    }
  }
  return { sent, failed };
}

/** Housekeeping: drop sent mail bodies after 30 days (no mail content kept longer than needed). */
export async function purgeSent(days = 30) {
  await sysDb().delete(schema.emailOutbox).where(and(eq(schema.emailOutbox.status, "sent"), lt(schema.emailOutbox.sentAt, sql`now() - make_interval(days => ${days})`)));
}
