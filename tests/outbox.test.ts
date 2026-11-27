import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closePools, schema, sysDb } from "@/lib/db";
import { devMailbox, enqueue, flush } from "@/lib/mail/outbox";

afterAll(closePools);

describe("mail outbox", () => {
  it("enqueue is idempotent on the dedupe key", async () => {
    const key = `t:${Math.random()}`;
    expect(await enqueue({ to: "a@example.test", subject: "S", text: "T", category: "essential", dedupeKey: key })).toBe(true);
    expect(await enqueue({ to: "a@example.test", subject: "S", text: "T", category: "essential", dedupeKey: key })).toBe(false);
  });

  it("flushes many pending messages in one go, once each, and marks them sent", async () => {
    const run = Math.random().toString(36).slice(2);
    for (let i = 0; i < 30; i++) await enqueue({ to: `u${i}@example.test`, subject: `Batch ${run}`, text: `body ${i}`, category: "announcement", dedupeKey: `batch:${run}:${i}` });
    for (let i = 0; i < 60; i++) if ((await flush(40)).sent === 0) break; // drains (other tests leave pending rows too)
    const rows = await sysDb().select().from(schema.emailOutbox).where(like(schema.emailOutbox.dedupeKey, `batch:${run}:%`));
    expect(rows.every((r) => r.status === "sent")).toBe(true);
    expect(devMailbox.filter((m) => m.subject === `Batch ${run}`)).toHaveLength(30);
  });

  it("does not deliver the same row twice when flushes overlap", async () => {
    const run = Math.random().toString(36).slice(2);
    for (let i = 0; i < 8; i++) await enqueue({ to: `v${i}@example.test`, subject: `Overlap ${run}`, text: "x", category: "reminder", dedupeKey: `ov:${run}:${i}` });
    for (let i = 0; i < 60; i++) {
      const r = await Promise.all([flush(40), flush(40), flush(40)]);
      if (r.every((x) => x.sent === 0)) break;
    }
    expect(devMailbox.filter((m) => m.subject === `Overlap ${run}`)).toHaveLength(8);
    const rows = await sysDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.subject, `Overlap ${run}`));
    expect(rows.every((r) => r.attempts === 1)).toBe(true);
  });
});
