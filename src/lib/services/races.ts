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
