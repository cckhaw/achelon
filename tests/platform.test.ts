import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePools, schema, sysDb, withTenant } from "@/lib/db";
import { isPlatformOperator } from "@/lib/platform-operator";
import { addOwner, communityBySlug, createCommunity, listCommunities, setSuspended } from "@/lib/system/platform";
import { communitiesForUser } from "@/lib/system/tenants";
import { loginWithPassword, requestMagicLink } from "@/lib/system/auth";
import { resolveCalendarToken } from "@/lib/system/calendar";
import { viewInvite } from "@/lib/system/invite-accept";
import { createInvite } from "@/lib/services/invites";
import { hashPassword } from "@/lib/password";
import { sha256Hex } from "@/lib/crypto";
import { makeMember, makeTenant } from "./helpers/factory";

let signedIn: { id: string; email: string; sessionId: string; hasPassword: boolean; fresh: boolean } | null = null;
vi.mock("@/lib/session", () => ({ currentUser: async () => signedIn, startSession: async () => {}, endSession: async () => {}, SESSION_COOKIE: "x" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

afterAll(closePools);
beforeEach(() => { signedIn = null; });
const uniq = () => Math.random().toString(36).slice(2, 9);
const as = (m: { user: { id: string; email: string } }) => { signedIn = { id: m.user.id, email: m.user.email, sessionId: "s", hasPassword: false, fresh: false }; };
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const ip = () => `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe("operators", () => {
  it("come only from PLATFORM_ADMIN_EMAILS, case-insensitively; nobody otherwise", () => {
    expect(isPlatformOperator("operator@example.test")).toBe(true);
    expect(isPlatformOperator("  OPERATOR@Example.test ")).toBe(true);
    expect(isPlatformOperator("other.op@example.test")).toBe(true);
    expect(isPlatformOperator("someone@example.test")).toBe(false);
    expect(isPlatformOperator("")).toBe(false);
    expect(isPlatformOperator(null)).toBe(false);
  });
});

describe("creating a community", () => {
  it("creates the tenant, an active owner with defaults, an audit entry, and emails a set-password link", async () => {
    const slug = `c-${uniq()}`; const email = `owner-${uniq()}@example.test`;
    const r = await createCommunity({ slug, name: "Test Club", ownerEmail: email.toUpperCase(), timezone: "Asia/Singapore" });
    expect(r).toEqual({ ok: true, slug });
    const c = await communityBySlug(slug);
    expect(c!.tenant.settings).toMatchObject({ defaultTimezone: "Asia/Singapore", sponsorshipEnabled: true });
    expect(c!.owners).toHaveLength(1);
    expect(c!.owners[0]).toMatchObject({ email, status: "active" });
    const vis = await sysDb().select().from(schema.fieldVisibility).where(eq(schema.fieldVisibility.membershipId, c!.owners[0].id));
    expect(vis.length).toBeGreaterThan(5);
    const log = await sysDb().select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, c!.tenant.id));
    expect(log.map((l) => l.action).sort()).toEqual(["community.created", "community.owner_added"]);
    expect(log.every((l) => l.actorMembershipId === null && (l.metadata as { platform?: boolean }).platform === true)).toBe(true);
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    const [tok] = await sysDb().select().from(schema.loginTokens).where(eq(schema.loginTokens.userId, u.id));
    expect(tok.purpose).toBe("reset");
    const [mail] = await sysDb().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.toEmail, email));
    expect(mail.subject).toMatch(/password/i);
  });

  it("rejects bad input and duplicates without creating anything", async () => {
    const ok = { slug: `c-${uniq()}`, name: "Okay Club", ownerEmail: `o-${uniq()}@example.test`, timezone: "UTC" };
    expect(await createCommunity({ ...ok, slug: "login" })).toMatchObject({ ok: false, field: "slug" });   // reserved
    expect(await createCommunity({ ...ok, slug: "Bad Slug!" })).toMatchObject({ ok: false, field: "slug" });
    expect(await createCommunity({ ...ok, ownerEmail: "nope" })).toMatchObject({ ok: false, field: "ownerEmail" });
    expect(await createCommunity({ ...ok, name: "x" })).toMatchObject({ ok: false, field: "name" });
    expect(await createCommunity({ ...ok, timezone: "Mars/Olympus" })).toMatchObject({ ok: false, field: "timezone" });
    expect(await communityBySlug(ok.slug)).toBeNull();
    expect(await createCommunity(ok)).toMatchObject({ ok: true });
    expect(await createCommunity({ ...ok, ownerEmail: `o2-${uniq()}@example.test` })).toMatchObject({ ok: false, field: "slug" });
  });

  it("a deleted account can't be made an owner, and the failed attempt leaves no half-created community", async () => {
    const T = await makeTenant(); const gone = await makeMember(T.id);
    await sysDb().update(schema.users).set({ deletedAt: new Date() }).where(eq(schema.users.id, gone.user.id));
    const slug = `c-${uniq()}`;
    expect(await createCommunity({ slug, name: "Ghost Club", ownerEmail: gone.user.email, timezone: "UTC" })).toMatchObject({ ok: false });
    expect(await communityBySlug(slug)).toBeNull();
  });

  it("an existing person can own a second community with the same login", async () => {
    const a = `c-${uniq()}`, b = `c-${uniq()}`; const email = `multi-${uniq()}@example.test`;
    await createCommunity({ slug: a, name: "First Club", ownerEmail: email, timezone: "UTC" });
    await createCommunity({ slug: b, name: "Second Club", ownerEmail: email, timezone: "UTC" });
    const [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    expect((await communitiesForUser(u.id)).map((c) => c.slug).sort()).toEqual([a, b].sort());
  });
});

describe("owners", () => {
  it("addOwner promotes an existing member and creates new accounts; the community keeps its data separate", async () => {
    const T = await makeTenant(); const member = await makeMember(T.id, { name: "Promote Me" });
    expect(await addOwner(T.id, member.user.email)).toEqual({ ok: true });
    const [m] = await sysDb().select().from(schema.memberships).where(eq(schema.memberships.id, member.membership.id));
    expect(m.role).toBe("owner");
    const fresh = `new-${uniq()}@example.test`;
    expect(await addOwner(T.id, fresh)).toEqual({ ok: true });
    const c = await communityBySlug(T.slug);
    expect(c!.owners.map((o) => o.email)).toEqual(expect.arrayContaining([member.user.email, fresh]));
    expect(await addOwner(T.id, "not-an-email")).toMatchObject({ ok: false });
    expect(await addOwner(crypto.randomUUID(), fresh)).toMatchObject({ ok: false });
  });
});

describe("suspension closes a community everywhere", () => {
  it("members, picker, invites, calendar feeds and the owner's own page all treat it as gone; reactivating restores it", async () => {
    const T = await makeTenant(); const owner = await makeMember(T.id, { role: "owner" }); const mem = await makeMember(T.id);
    const inv = await withTenant(T.id, (tx) => createInvite(tx, { membershipId: owner.membership.id, role: "owner", tenantId: T.id }, { email: `i-${uniq()}@example.test`, role: "member" }));
    const feed = `feed-${uniq()}-${uniq()}-${uniq()}-suspension-test`;
    await sysDb().insert(schema.calendarTokens).values({ membershipId: mem.membership.id, tenantId: T.id, tokenHash: sha256Hex(feed) });
    const { getMemberContext } = await import("@/lib/context");
    as(mem);
    expect(await getMemberContext(T.slug)).not.toBeNull();
    expect((await communitiesForUser(mem.user.id)).map((c) => c.slug)).toContain(T.slug);
    expect(await viewInvite(inv.token)).not.toBeNull();
    expect(await resolveCalendarToken(feed)).not.toBeNull();

    expect(await setSuspended(T.id, true)).toEqual({ ok: true });
    const { getMemberContext: fresh } = await (async () => { const m = await import("@/lib/context"); return m; })();
    // getMemberContext is request-cached by React `cache`; a new request (new call outside a render) re-reads.
    expect(await fresh(T.slug + "")).toBeNull();
    expect((await communitiesForUser(mem.user.id)).map((c) => c.slug)).not.toContain(T.slug);
    expect(await viewInvite(inv.token)).toBeNull();
    expect(await resolveCalendarToken(feed)).toBeNull();
    const log = await sysDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, T.id), eq(schema.auditLog.action, "community.suspended")));
    expect(log).toHaveLength(1);

    expect(await setSuspended(T.id, false)).toEqual({ ok: true });
    expect((await communitiesForUser(mem.user.id)).map((c) => c.slug)).toContain(T.slug);
    expect(await viewInvite(inv.token)).not.toBeNull();
    expect(await setSuspended(crypto.randomUUID(), true)).toMatchObject({ ok: false });
  });

  it("the community list shows status and counts", async () => {
    const T = await makeTenant(); await makeMember(T.id, { role: "owner" }); await setSuspended(T.id, true);
    const row = (await listCommunities()).find((c) => c.id === T.id)!;
    expect(row).toMatchObject({ members: 1, owners: 1 });
    expect(row.suspendedAt).toBeInstanceOf(Date);
  });
});

describe("server actions are operator-only", () => {
  it("anonymous visitors and ordinary members (even owners of a community) are refused; operators are allowed", async () => {
    const actions = await import("@/app/platform/actions");
    const T = await makeTenant(); const owner = await makeMember(T.id, { role: "owner" });
    const slug = `c-${uniq()}`;
    const fd = () => form({ name: "Action Club", slug, ownerEmail: `a-${uniq()}@example.test`, timezone: "UTC" });
    const denied = async (fn: () => Promise<unknown>) => { try { const r = (await fn()) as { error?: string } | undefined; return /access/.test(r?.error ?? ""); } catch { return false; } };

    signedIn = null;
    expect(await denied(() => actions.createCommunityAction(undefined, fd()))).toBe(true);
    as(owner); // an owner of a community is NOT a platform operator
    expect(await denied(() => actions.createCommunityAction(undefined, fd()))).toBe(true);
    expect(await denied(() => actions.addOwnerAction(T.id, T.slug, undefined, form({ ownerEmail: "x@example.test" })))).toBe(true);
    expect(await denied(() => actions.setSuspendedAction(T.id, T.slug, true, undefined, form({})))).toBe(true);
    expect(await communityBySlug(slug)).toBeNull();
    const [t] = await sysDb().select().from(schema.tenants).where(eq(schema.tenants.id, T.id));
    expect(t.suspendedAt).toBeNull();

    // an operator may (createCommunityAction redirects on success, which surfaces as a redirect error)
    const op = await makeMember(T.id, { email: "operator@example.test" });
    as(op);
    await actions.createCommunityAction(undefined, fd()).catch(() => undefined);
    expect(await communityBySlug(slug)).not.toBeNull();
    expect((await actions.setSuspendedAction(T.id, T.slug, true, undefined, form({}))).ok).toBe(true);
  });
});

describe("operators can sign in without belonging to a community", () => {
  it("magic link and password both work for an operator with no memberships, but not for an ordinary stranger", async () => {
    const email = "other.op@example.test";
    let [u] = await sysDb().select().from(schema.users).where(eq(schema.users.email, email));
    if (!u) [u] = await sysDb().insert(schema.users).values({ email }).returning();
    await sysDb().update(schema.users).set({ passwordHash: await hashPassword("operator long passphrase") }).where(eq(schema.users.id, u.id));
    await sysDb().delete(schema.memberships).where(eq(schema.memberships.userId, u.id));
    await sysDb().delete(schema.loginTokens).where(eq(schema.loginTokens.userId, u.id));
    expect(await loginWithPassword(email, "operator long passphrase", ip())).toEqual({ userId: u.id });
    await requestMagicLink(email, ip());
    expect(await sysDb().select().from(schema.loginTokens).where(eq(schema.loginTokens.userId, u.id))).toHaveLength(1);

    const stranger = `stranger-${uniq()}@example.test`;
    const [s] = await sysDb().insert(schema.users).values({ email: stranger, passwordHash: await hashPassword("stranger long passphrase") }).returning();
    expect(await loginWithPassword(stranger, "stranger long passphrase", ip())).toEqual({ error: "invalid" });
    await requestMagicLink(stranger, ip());
    expect(await sysDb().select().from(schema.loginTokens).where(eq(schema.loginTokens.userId, s.id))).toHaveLength(0);
  });
});
