import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema, type Tx } from "@/lib/db";
import { ANNOUNCEMENT_AUDIENCES, type MembershipRole } from "@/db/constants";
import { audit } from "@/lib/audit";

export const announcementSchema = z.object({
  subject: z.string().trim().min(2, "Enter a subject").max(140),
  body: z.string().trim().min(2, "Write your message").max(5000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
});

export async function createAnnouncement(tx: Tx, actor: { membershipId: string; tenantId: string }, input: z.infer<typeof announcementSchema>) {
  const [row] = await tx.insert(schema.announcements).values({ tenantId: actor.tenantId, authorMembershipId: actor.membershipId, subject: input.subject, bodyMarkdown: input.body, audience: input.audience, sentAt: new Date() }).returning({ id: schema.announcements.id });
  await audit(tx, { tenantId: actor.tenantId, actor: actor.membershipId, action: "announcement.sent", targetType: "announcement", targetId: row.id, metadata: { audience: input.audience } });
  return row.id;
}

const audiencesFor = (role: MembershipRole) => (role === "guest" ? [] : role === "member" ? ["all_members"] : role === "founding_member" ? ["all_members", "founding_only"] : ["all_members", "founding_only", "admins"]) as (typeof ANNOUNCEMENT_AUDIENCES)[number][];

export async function listAnnouncements(tx: Tx, role: MembershipRole, limit = 50) {
  const aud = audiencesFor(role);
  if (!aud.length) return [];
  return tx.select({ a: schema.announcements, author: schema.memberProfiles.displayName }).from(schema.announcements)
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.announcements.authorMembershipId))
    .where(inArray(schema.announcements.audience, aud)).orderBy(desc(schema.announcements.sentAt)).limit(limit);
}
