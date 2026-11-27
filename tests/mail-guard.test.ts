import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// A provider key is configured in this file only, so `deliver` takes the real (Resend) path against a stubbed fetch.
vi.mock("@/lib/env", async (orig) => {
  const mod = await orig<typeof import("@/lib/env")>();
  return { ...mod, env: () => ({ ...mod.env(), RESEND_API_KEY: "re_test_key", MAIL_FROM: "Achelon <noreply@example.com>" }) };
});

import { closePools, schema, sysDb } from "@/lib/db";
import { enqueue, flush, isReservedTestAddress } from "@/lib/mail/outbox";

afterAll(closePools);
afterEach(() => vi.unstubAllGlobals());

const row = async (key: string) => (await sysDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.dedupeKey, key)))[0];
const drain = async () => { for (let i = 0; i < 40; i++) if ((await flush(50)).sent + (await flush(50)).failed === 0) break; };

describe("never pay to send to addresses that cannot be real", () => {
  it("recognises reserved test addresses", () => {
    for (const a of ["x@e2e.invalid", "x@example.test", "x@foo.example", "x@localhost", "x@example.com", "x@mail.example.org", "X@E2E.INVALID"]) expect(isReservedTestAddress(a), a).toBe(true);
    for (const a of ["me@khaw.cc", "a@gmail.com", "a@notexample.com", "a@testing.com"]) expect(isReservedTestAddress(a), a).toBe(false);
  });

  it("does not call the provider for them, and marks them done so they are not retried", async () => {
    const fetchMock = vi.fn(async (..._a: unknown[]) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const key = `guard:${Math.random()}`;
    await enqueue({ to: `newbie-${Math.random()}@e2e.invalid`, subject: "Invite", text: "link", category: "essential", dedupeKey: key });
    await drain();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("resend.com"))).toHaveLength(0);
    expect(await row(key)).toMatchObject({ status: "sent" });
  });

  it("sends real addresses once, and does not retry a rejected request", async () => {
    const key = `guard:${Math.random()}`;
    const fetchMock = vi.fn(async (..._a: unknown[]) => new Response("{}", { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    await enqueue({ to: "real.person@khaw.cc", subject: "Hi", text: "x", category: "announcement", dedupeKey: key });
    await drain();
    const calls = fetchMock.mock.calls.filter(([u]) => String(u).includes("resend.com")).length;
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(await row(key)).toMatchObject({ status: "failed", attempts: 1 });
  });
});
