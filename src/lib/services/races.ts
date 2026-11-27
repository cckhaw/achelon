import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import type { MembershipRole } from "@/db/constants";
import { isMemberRole } from "@/lib/rbac";

export interface RaceItem {
  id: string; membershipId: string; memberName: string; mine: boolean; raceName: string; raceDate: string; location: string | null;
  distance: string | null; goalTime: string | null; visibleTo: "nobody" | "members"; externalEventId: string | null;
}

/**
 * Declared races the viewer may see: their own, plus others' set to "members" (never for guests). The goal time is only
 * ever returned for the member's own declarations unless they chose to share the declaration with members.
 */
export async function listRaces(tx: Tx, viewer: { membershipId: string; role: MembershipRole }, o: { from?: string; to?: string } = {}): Promise<RaceItem[]> {
  if (!isMemberRole(viewer.role)) return [];
  const rows = await tx
    .select({ r: schema.raceDeclarations, name: schema.memberProfiles.displayName, status: schema.memberships.status })
    .from(schema.raceDeclarations)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.raceDeclarations.membershipId))
    .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.raceDeclarations.membershipId))
    .where(and(
      o.from ? gte(schema.raceDeclarations.raceDate, o.from) : undefined,
      o.to ? lte(schema.raceDeclarations.raceDate, o.to) : undefined,
      or(eq(schema.raceDeclarations.membershipId, viewer.membershipId), and(eq(schema.raceDeclarations.visibleTo, "members"), eq(schema.memberships.status, "active"))),
    ))
    .orderBy(asc(schema.raceDeclarations.raceDate), asc(schema.raceDeclarations.raceName));
  return rows.map(({ r, name }) => {
    const mine = r.membershipId === viewer.membershipId;
    return { id: r.id, membershipId: r.membershipId, memberName: name ?? "Member", mine, raceName: r.raceName, raceDate: r.raceDate, location: r.location, distance: r.distance, goalTime: mine ? r.goalTime : null, visibleTo: r.visibleTo, externalEventId: r.externalEventId };
  });
}

import { z } from "zod";
import { RACE_VISIBILITIES } from "@/db/constants";
import { httpsUrl } from "@/lib/validation";
void httpsUrl;

export const raceSchema = z.object({
  raceName: z.string().trim().min(2, "Enter the race name").max(120),
  raceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the race date").refine((d) => !Number.isNaN(Date.parse(d + "T00:00:00Z")), "Choose the race date"),
  location: z.string().trim().max(120).optional().transform((v) => v || null),
  distance: z.string().trim().max(40).optional().transform((v) => v || null),
  goalTime: z.string().trim().max(20).optional().transform((v) => v || null),
  visibleTo: z.enum(RACE_VISIBILITIES).default("members"),
  externalEventId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
});
export type RaceInput = z.infer<typeof raceSchema>;

export async function declareRace(tx: Tx, who: { tenantId: string; membershipId: string }, input: RaceInput) {
  // A linked event must exist in this tenant and be an external race (RLS hides other tenants' events).
  let externalEventId = input.externalEventId;
  if (externalEventId) {
    const [ev] = await tx.select({ id: schema.events.id, type: schema.events.type }).from(schema.events).where(eq(schema.events.id, externalEventId));
    if (!ev || ev.type !== "external_race") externalEventId = null;
  }
  const [row] = await tx.insert(schema.raceDeclarations).values({ tenantId: who.tenantId, membershipId: who.membershipId, raceName: input.raceName, raceDate: input.raceDate, location: input.location, distance: input.distance, goalTime: input.goalTime, visibleTo: input.visibleTo, externalEventId }).returning({ id: schema.raceDeclarations.id });
  return row.id;
}

/** "I'm going too": copy the race (not the goal time) from a declaration the viewer can see. */
export async function joinRace(tx: Tx, who: { tenantId: string; membershipId: string; role: MembershipRole }, sourceId: string): Promise<boolean> {
  const visible = await listRaces(tx, who);
  const src = visible.find((r) => r.id === sourceId);
  if (!src) return false;
  const dup = visible.find((r) => r.mine && (src.externalEventId ? r.externalEventId === src.externalEventId : r.raceName.toLowerCase() === src.raceName.toLowerCase() && r.raceDate === src.raceDate));
  if (dup) return true;
  await declareRace(tx, who, { raceName: src.raceName, raceDate: src.raceDate, location: src.location, distance: src.distance, goalTime: null, visibleTo: "members", externalEventId: src.externalEventId });
  return true;
}

export async function removeRace(tx: Tx, membershipId: string, id: string) {
  await tx.delete(schema.raceDeclarations).where(and(eq(schema.raceDeclarations.id, id), eq(schema.raceDeclarations.membershipId, membershipId)));
}

export async function setRaceVisibility(tx: Tx, membershipId: string, id: string, visibleTo: "nobody" | "members") {
  await tx.update(schema.raceDeclarations).set({ visibleTo }).where(and(eq(schema.raceDeclarations.id, id), eq(schema.raceDeclarations.membershipId, membershipId)));
}

/** Members racing at an external-race event (for the event page). Honours per-declaration visibility. */
export async function racersForEvent(tx: Tx, viewer: { membershipId: string; role: MembershipRole }, eventId: string) {
  return (await listRaces(tx, viewer)).filter((r) => r.externalEventId === eventId);
}
