import "server-only";
import { and, eq } from "drizzle-orm";
import { sysDb, sysTx, schema } from "@/lib/db";
import { sha256Hex, randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { hashForNewAccount, issueLoginToken } from "@/lib/system/auth";
import { saveProfile } from "@/lib/services/profiles";
import type { ProfileInput } from "@/lib/validation";
import type { VisibilitySettings } from "@/lib/visibility";
import { DEFAULT_VISIBILITY } from "@/db/constants";

export interface InviteView {
  tenantName: string;
  tenantSlug: string;
  email: string | null;
  role: (typeof schema.invites.$inferSelect)["roleGranted"];
  inviter: string | null;
  prefill: { name?: string; company?: string; jobTitle?: string; city?: string; country?: string } | null;
}

/** Looks an invite up by raw token. Returns null for unknown, used, revoked and expired alike (no oracle). */
export async function viewInvite(raw: string): Promise<InviteView | null> {
  const db = sysDb();
  const [r] = await db
    .select({ inv: schema.invites, t: schema.tenants })
    .from(schema.invites)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.invites.tenantId))
    .where(eq(schema.invites.tokenHash, sha256Hex(raw)))
    .limit(1);
  if (!r || r.inv.usedAt || r.inv.revokedAt || r.inv.expiresAt.getTime() < Date.now()) return null;
  let inviter: string | null = null;
  const by = r.inv.sponsorMembershipId ?? r.inv.createdByMembershipId;
  if (by) {
    const [p] = await db.select({ n: schema.memberProfiles.displayName }).from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, by)).limit(1);
    inviter = p?.n ?? null;
  }
  return { tenantName: r.t.name, tenantSlug: r.t.slug, email: r.inv.email ?? null, role: r.inv.roleGranted, inviter, prefill: r.inv.prefill ?? null };
}

export type AcceptResult =
  | { ok: true; mode: "session"; userId: string; tenantSlug: string }
  | { ok: true; mode: "confirm_email"; tenantSlug: string }
  | { ok: false; reason: "invalid" };

/**
 * Consumes an invite (single use, row-locked). Email-bound invites prove mailbox ownership by the token itself, so the
 * caller gets a session. Link-only invites (anyone holding the link can type any address) must prove the mailbox first:
 * the membership stays `invited` until the emailed confirm link is redeemed (D-28). This also means a link can never
 * be used to open a session as somebody else.
 */
export async function acceptInvite(
  raw: string,
  input: { email: string; profile: ProfileInput; visibility: VisibilitySettings; password?: string },
): Promise<AcceptResult> {
  const result = await sysTx(async (tx) => {
    const [row] = await tx
      .select({ inv: schema.invites, t: schema.tenants })
      .from(schema.invites)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.invites.tenantId))
      .where(eq(schema.invites.tokenHash, sha256Hex(raw)))
      .for("update", { of: schema.invites })
      .limit(1);
    if (!row || row.inv.usedAt || row.inv.revokedAt || row.inv.expiresAt.getTime() < Date.now()) return null;
    const { inv, t } = row;
    const bound = Boolean(inv.email);
    const email = (inv.email ?? input.email).toLowerCase();

    let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (user?.deletedAt) return null;
    // A password is only accepted for a NEW account on an email-bound invite (the token already proves the mailbox). For
    // link-only invites anyone could type any address, so no password is stored until the email is confirmed (D-54), and an
    // existing account's password is never touched (nor is its existence revealed).
    if (!user) [user] = await tx.insert(schema.users).values({ email, ...(bound && input.password ? { passwordHash: await hashForNewAccount(input.password), passwordSetAt: new Date() } : {}) }).returning();

    const [existing] = await tx.select().from(schema.memberships)
      .where(and(eq(schema.memberships.tenantId, t.id), eq(schema.memberships.userId, user.id))).limit(1);

    let membershipId: string;
    let touchedProfile = true;
    if (existing && (existing.status === "active" || existing.status === "paused")) {
      // Already a member: change nothing about their account or profile; the invite is simply spent.
      membershipId = existing.id;
      touchedProfile = false;
    } else if (existing) {
      membershipId = existing.id;
      await tx.update(schema.memberships).set({
        role: inv.roleGranted, status: bound ? "active" : "invited", joinedAt: bound ? new Date() : null, leftAt: null,
        invitedByMembershipId: inv.sponsorMembershipId ?? inv.createdByMembershipId,
      }).where(eq(schema.memberships.id, existing.id));
    } else {
      const [m] = await tx.insert(schema.memberships).values({
        tenantId: t.id, userId: user.id, role: inv.roleGranted, status: bound ? "active" : "invited", joinedAt: bound ? new Date() : null,
        invitedByMembershipId: inv.sponsorMembershipId ?? inv.createdByMembershipId,
      }).returning({ id: schema.memberships.id });
      membershipId = m.id;
    }

    if (touchedProfile) {
      await saveProfile(tx as never, t.id, membershipId, input.profile, { ...DEFAULT_VISIBILITY, ...input.visibility });
      await tx.insert(schema.notificationPreferences).values({ membershipId, tenantId: t.id }).onConflictDoNothing();
    }
    await tx.update(schema.invites).set({ usedAt: new Date(), usedByUserId: user.id, prefill: null }).where(eq(schema.invites.id, inv.id));
    await audit(tx as never, { tenantId: t.id, actor: membershipId, action: "invite.accepted", targetType: "invite", targetId: inv.id, metadata: { bound, consent: "v1" } });
    return { userId: user.id, email, tenantSlug: t.slug, tenantName: t.name, bound };
  });

  if (!result) return { ok: false, reason: "invalid" };
  if (result.bound) return { ok: true, mode: "session", userId: result.userId, tenantSlug: result.tenantSlug };
  await issueLoginToken(result.userId, randomToken(), result.email, result.tenantName, "confirm");
  return { ok: true, mode: "confirm_email", tenantSlug: result.tenantSlug };
}
