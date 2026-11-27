import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type Tx } from "@/lib/db";
import type { MembershipRole } from "@/db/constants";
import { isAdminRole } from "@/lib/rbac";
import { httpsUrl } from "@/lib/validation";

export const recapSchema = z.object({
  body: z.string().trim().min(5, "Write a few words").max(4000),
  photos: z.string().optional().transform((s) => (s ?? "").split(/\s+/).map((x) => x.trim()).filter(Boolean)).pipe(z.array(httpsUrl).max(6, "Up to 6 photo links")),
});

/** Admins, or members who were going, may write a recap once the event has started. */
export async function addRecap(tx: Tx, who: { tenantId: string; membershipId: string; role: MembershipRole }, eventId: string, input: z.infer<typeof recapSchema>): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [ev] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId));
  if (!ev || ev.status !== "published") return { ok: false, reason: "Event not found." };
  if (ev.startsAt > new Date()) return { ok: false, reason: "You can write a recap once the event has started." };
  if (!isAdminRole(who.role)) {
    const [s] = await tx.select({ s: schema.eventSignups.status }).from(schema.eventSignups).where(and(eq(schema.eventSignups.eventId, eventId), eq(schema.eventSignups.membershipId, who.membershipId)));
    if (s?.s !== "going") return { ok: false, reason: "Only people who were going can write a recap." };
  }
  await tx.insert(schema.eventRecaps).values({ tenantId: who.tenantId, eventId, authorMembershipId: who.membershipId, bodyMarkdown: input.body, photoUrls: input.photos });
  return { ok: true };
}

export async function listRecaps(tx: Tx, eventId: string) {
  return tx.select({ r: schema.eventRecaps, author: schema.memberProfiles.displayName }).from(schema.eventRecaps)
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.eventRecaps.authorMembershipId))
    .where(eq(schema.eventRecaps.eventId, eventId)).orderBy(asc(schema.eventRecaps.createdAt));
}

export async function deleteRecap(tx: Tx, who: { membershipId: string; role: MembershipRole }, id: string) {
  await tx.delete(schema.eventRecaps).where(and(eq(schema.eventRecaps.id, id), isAdminRole(who.role) ? undefined : eq(schema.eventRecaps.authorMembershipId, who.membershipId)));
}
