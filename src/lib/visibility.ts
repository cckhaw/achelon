import type { Level, MembershipRole, OpenTo, Sport, VisibilityField, VisibleTo } from "@/db/constants";
import { DEFAULT_VISIBILITY, VISIBILITY_FIELDS } from "@/db/constants";
import { isAdminRole, isMemberRole } from "./rbac";

/**
 * THE place that decides which profile fields a viewer may see (D-25). Directory, profile page, attendee lists,
 * race board and exports must all go through `projectProfile`. Hidden fields are omitted entirely (not "hidden"
 * placeholders), so a viewer cannot even tell whether a member filled them in.
 */

export interface ProfileData {
  membershipId: string;
  displayName: string;
  jobTitle: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  bio: string | null;
  sports: Sport[];
  level: Level | null;
  typicalPaceRunSecPerKm: number | null;
  typicalSpeedRideKmh: string | null;
  openTo: OpenTo[];
  photoUrl: string | null;
  stravaVerified: boolean;
}

export interface Viewer {
  membershipId: string;
  role: MembershipRole;
}

export type VisibilitySettings = Partial<Record<VisibilityField, VisibleTo>>;

export interface VisibleProfile {
  membershipId: string;
  displayName: string;
  jobTitle?: string | null;
  company?: string | null;
  city?: string | null;
  country?: string | null;
  bio?: string | null;
  sports?: Sport[];
  level?: Level | null;
  typicalPaceRunSecPerKm?: number | null;
  typicalSpeedRideKmh?: string | null;
  openTo?: OpenTo[];
  photoUrl?: string | null;
  stravaVerified?: boolean;
  /** Only present for the profile owner and admins. */
  timezone?: string | null;
}

export function effectiveSettings(settings: VisibilitySettings): Record<VisibilityField, VisibleTo> {
  const out = { ...DEFAULT_VISIBILITY };
  for (const f of VISIBILITY_FIELDS) if (settings[f]) out[f] = settings[f]!;
  return out;
}

/** May `viewer` see a field set to `setting` on `subjectId`'s profile? */
export function allows(setting: VisibleTo, viewer: Viewer, subjectId: string): boolean {
  if (viewer.membershipId === subjectId) return true;
  if (setting === "nobody") return false;
  if (setting === "admins") return isAdminRole(viewer.role);
  return isMemberRole(viewer.role); // "members": every non-guest member (admins included)
}

export function projectProfile(p: ProfileData, settings: VisibilitySettings, viewer: Viewer): VisibleProfile | null {
  const self = viewer.membershipId === p.membershipId;
  // Guests never see other members' profiles.
  if (!self && !isMemberRole(viewer.role)) return null;
  const eff = effectiveSettings(settings);
  const ok = (f: VisibilityField) => allows(eff[f], viewer, p.membershipId);

  const out: VisibleProfile = { membershipId: p.membershipId, displayName: p.displayName };
  if (ok("job_title")) out.jobTitle = p.jobTitle;
  if (ok("company")) out.company = p.company;
  if (ok("city")) out.city = p.city;
  if (ok("country")) out.country = p.country;
  if (ok("bio")) out.bio = p.bio;
  if (ok("sports")) out.sports = p.sports;
  if (ok("level")) out.level = p.level;
  if (ok("pace")) out.typicalPaceRunSecPerKm = p.typicalPaceRunSecPerKm;
  if (ok("speed")) out.typicalSpeedRideKmh = p.typicalSpeedRideKmh;
  if (ok("open_to")) out.openTo = p.openTo;
  if (ok("photo")) out.photoUrl = p.photoUrl;
  if (ok("strava")) out.stravaVerified = p.stravaVerified;
  if (self || isAdminRole(viewer.role)) out.timezone = p.timezone;
  return out;
}

export interface DirectoryFilters {
  q?: string;
  city?: string;
  sport?: Sport;
  level?: Level;
  openTo?: OpenTo;
}

/**
 * Filters run on the PROJECTED profile, so filtering by a field the viewer cannot see matches nothing. This avoids the
 * classic leak where "filter by city" reveals a hidden city.
 */
export function matchesFilters(v: VisibleProfile, f: DirectoryFilters): boolean {
  if (f.city && (v.city ?? "").toLowerCase() !== f.city.toLowerCase()) return false;
  if (f.sport && !(v.sports ?? []).includes(f.sport)) return false;
  if (f.level && v.level !== f.level) return false;
  if (f.openTo && !(v.openTo ?? []).includes(f.openTo)) return false;
  if (f.q) {
    const hay = [v.displayName, v.company, v.jobTitle, v.city].filter(Boolean).join(" ").toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
