import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emailSchema } from "@/lib/validation";
import { z } from "zod";
import { createInvite } from "./invites";
import type { MembershipRole } from "@/db/constants";

export const applicationSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: emailSchema,
  company: z.string().trim().max(100).optional().transform((v) => v || null),
  message: z.string().trim().min(10, "Tell us a little about why they'd be a good fit").max(800),
});

/** Sponsor-submitted nomination. Always succeeds from the sponsor's point of view: duplicates are not revealed (D-11). */
export async function submitApplication(tx: Tx, sponsor: { tenantId: string; membershipId: string }, input: z.infer<typeof applicationSchema>) {
  const [dup] = await tx.select({ id: schema.applications.id }).from(schema.applications).where(and(eq(schema.applications.email, input.email), eq(schema.applications.status, "pending"))).limit(1);
  if (dup) return { created: false };
  const [row] = await tx.insert(schema.applications).values({ tenantId: sponsor.tenantId, email: input.email, name: input.name, company: input.company, message: input.message, sponsorMembershipId: sponsor.membershipId }).returning({ id: schema.applications.id });
  await audit(tx, { tenantId: sponsor.tenantId, actor: sponsor.membershipId, action: "application.submitted", targetType: "application", targetId: row.id });
  return { created: true };
}

export async function listApplications(tx: Tx) {
  return tx
    .select({
      a: schema.applications, sponsor: schema.memberProfiles.displayName,
      isMember: sql<boolean>`EXISTS (SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = ${schema.applications.email} AND m.status IN ('active','paused','invited'))`,
    })
    .from(schema.applications)
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.applications.sponsorMembershipId))
    .orderBy(sql`(${schema.applications.status} = 'pending') DESC`, desc(schema.applications.createdAt)).limit(200);
}

export async function myApplications(tx: Tx, membershipId: string) {
  return tx.select({ id: schema.applications.id, name: schema.applications.name, status: schema.applications.status, createdAt: schema.applications.createdAt }).from(schema.applications).where(eq(schema.applications.sponsorMembershipId, membershipId)).orderBy(desc(schema.applications.createdAt));
}

/** Approve → an email-bound invite crediting the sponsor. Returns what the caller needs to email it. */
export async function approveApplication(tx: Tx, actor: { membershipId: string; role: MembershipRole; tenantId: string }, id: string) {
  const [a] = await tx.select().from(schema.applications).where(and(eq(schema.applications.id, id), eq(schema.applications.status, "pending"))).limit(1).for("update");
  if (!a) return null;
  const inv = await createInvite(tx, actor, { email: a.email, role: "member", sponsorMembershipId: a.sponsorMembershipId, note: null });
  await tx.update(schema.invites).set({ prefill: { name: a.name, company: a.company ?? undefined } }).where(eq(schema.invites.id, inv.id));
  await tx.update(schema.applications).set({ status: "approved", decidedBy: actor.membershipId, decidedAt: new Date(), inviteId: inv.id }).where(eq(schema.applications.id, id));
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "application.approved", targetType: "application", targetId: id });
  return { application: a, invite: inv };
}

export async function declineApplication(tx: Tx, actor: { membershipId: string; tenantId: string }, id: string) {
  const [a] = await tx.update(schema.applications).set({ status: "declined", decidedBy: actor.membershipId, decidedAt: new Date() }).where(and(eq(schema.applications.id, id), eq(schema.applications.status, "pending"))).returning();
  if (a) await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "application.declined", targetType: "application", targetId: id });
  return a ?? null;
}
