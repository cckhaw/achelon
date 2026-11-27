import { and, eq, inArray } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import { VISIBILITY_FIELDS, type MembershipRole, type VisibleTo, type VisibilityField } from "@/db/constants";
import type { ProfileInput } from "@/lib/validation";
import { parsePace } from "@/lib/validation";
import { projectProfile, type ProfileData, type Viewer, type VisibilitySettings, type VisibleProfile } from "@/lib/visibility";

export type DirectoryEntry = VisibleProfile & { role: MembershipRole; joinedAt: Date | null };

function toProfileData(r: typeof schema.memberProfiles.$inferSelect): ProfileData {
  return {
    membershipId: r.membershipId, displayName: r.displayName, jobTitle: r.jobTitle, company: r.company, city: r.city,
    country: r.country, timezone: r.timezone, bio: r.bio, sports: r.sports, level: r.level,
    typicalPaceRunSecPerKm: r.typicalPaceRunSecPerKm, typicalSpeedRideKmh: r.typicalSpeedRideKmh, openTo: r.openTo,
    photoUrl: r.photoUrl, stravaVerified: r.stravaVerified,
  };
}

export async function visibilityFor(tx: Tx, membershipIds: string[]): Promise<Map<string, VisibilitySettings>> {
  const map = new Map<string, VisibilitySettings>();
  if (!membershipIds.length) return map;
  const rows = await tx.select().from(schema.fieldVisibility).where(inArray(schema.fieldVisibility.membershipId, membershipIds));
  for (const r of rows) {
    const cur = map.get(r.membershipId) ?? {};
    cur[r.fieldName as VisibilityField] = r.visibleTo;
    map.set(r.membershipId, cur);
  }
  return map;
}

export async function ownProfile(tx: Tx, membershipId: string) {
  const [row] = await tx.select().from(schema.memberProfiles).where(eq(schema.memberProfiles.membershipId, membershipId)).limit(1);
  if (!row) return null;
  const vis = (await visibilityFor(tx, [membershipId])).get(membershipId) ?? {};
  return { data: toProfileData(row), visibility: vis };
}

/** Active, non-guest members as seen by `viewer`. Every field passes through projectProfile. */
export async function directoryFor(tx: Tx, viewer: Viewer): Promise<DirectoryEntry[]> {
  const rows = await tx
    .select({ p: schema.memberProfiles, role: schema.memberships.role, joinedAt: schema.memberships.joinedAt })
    .from(schema.memberProfiles)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.memberProfiles.membershipId))
    .where(and(eq(schema.memberships.status, "active"), inArray(schema.memberships.role, ["owner", "admin", "founding_member", "member"])));
  const vis = await visibilityFor(tx, rows.map((r) => r.p.membershipId));
  const out: DirectoryEntry[] = [];
  for (const r of rows) {
    const v = projectProfile(toProfileData(r.p), vis.get(r.p.membershipId) ?? {}, viewer);
    if (v) out.push({ ...v, role: r.role, joinedAt: r.joinedAt });
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function profileFor(tx: Tx, viewer: Viewer, membershipId: string): Promise<DirectoryEntry | null> {
  const [r] = await tx
    .select({ p: schema.memberProfiles, role: schema.memberships.role, status: schema.memberships.status, joinedAt: schema.memberships.joinedAt })
    .from(schema.memberProfiles)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.memberProfiles.membershipId))
    .where(eq(schema.memberProfiles.membershipId, membershipId)).limit(1);
  if (!r || (r.status !== "active" && viewer.membershipId !== membershipId)) return null;
  if (r.role === "guest" && viewer.membershipId !== membershipId) return null;
  const vis = (await visibilityFor(tx, [membershipId])).get(membershipId) ?? {};
  const v = projectProfile(toProfileData(r.p), vis, viewer);
  return v ? { ...v, role: r.role, joinedAt: r.joinedAt } : null;
}

/** Display names only (attendee lists, race board). Names are shown to members by default; see D-23. */
export async function namesFor(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await tx.select({ id: schema.memberProfiles.membershipId, n: schema.memberProfiles.displayName }).from(schema.memberProfiles).where(inArray(schema.memberProfiles.membershipId, ids));
  return new Map(rows.map((r) => [r.id, r.n]));
}

export function profileValues(input: ProfileInput) {
  return {
    displayName: input.displayName,
    jobTitle: input.jobTitle,
    company: input.company,
    city: input.city,
    country: input.country,
    timezone: input.timezone,
    bio: input.bio,
    sports: input.sports,
    level: input.level,
    typicalPaceRunSecPerKm: input.pace ? parsePace(input.pace) : null,
    typicalSpeedRideKmh: input.speed ? Number(input.speed).toFixed(1) : null,
    openTo: input.openTo,
    photoUrl: input.photoUrl,
  };
}

export async function saveProfile(tx: Tx, tenantId: string, membershipId: string, input: ProfileInput, visibility: VisibilitySettings) {
  const values = profileValues(input);
  await tx.insert(schema.memberProfiles).values({ membershipId, tenantId, ...values })
    .onConflictDoUpdate({ target: schema.memberProfiles.membershipId, set: values });
  await saveVisibility(tx, tenantId, membershipId, visibility);
}

export async function saveVisibility(tx: Tx, tenantId: string, membershipId: string, visibility: VisibilitySettings) {
  const rows = VISIBILITY_FIELDS.filter((f) => visibility[f]).map((f) => ({ membershipId, tenantId, fieldName: f, visibleTo: visibility[f] as VisibleTo }));
  if (!rows.length) return;
  await tx.insert(schema.fieldVisibility).values(rows)
    .onConflictDoUpdate({ target: [schema.fieldVisibility.membershipId, schema.fieldVisibility.fieldName], set: { visibleTo: sqlExcluded() } });
}

import { sql } from "drizzle-orm";
function sqlExcluded() {
  return sql`excluded.visible_to`;
}
