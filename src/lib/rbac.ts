import type { MembershipRole } from "@/db/constants";

/** One permission map. Pages and actions check permissions, never roles. */
export type Permission =
  | "directory.view"
  | "events.view"
  | "events.rsvp"
  | "races.view"
  | "races.declare"
  | "sponsor.nominate"
  | "admin.access"
  | "members.manage"
  | "members.assign_privileged" // owner/admin roles
  | "invites.manage"
  | "events.manage"
  | "applications.review"
  | "announcements.send"
  | "settings.manage"
  | "audit.view"
  | "import.run"
  | "insights.view"
  | "recaps.write";

const ADMIN: Permission[] = [
  "admin.access", "members.manage", "invites.manage", "events.manage", "applications.review",
  "announcements.send", "settings.manage", "audit.view", "import.run", "insights.view", "recaps.write",
];
const MEMBERISH: Permission[] = ["directory.view", "events.view", "events.rsvp", "races.view", "races.declare", "sponsor.nominate"];

const MAP: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([...MEMBERISH, ...ADMIN, "members.assign_privileged"]),
  admin: new Set<Permission>([...MEMBERISH, ...ADMIN]),
  founding_member: new Set<Permission>([...MEMBERISH, "recaps.write"]),
  member: new Set<Permission>([...MEMBERISH, "recaps.write"]),
  guest: new Set<Permission>(["events.view", "events.rsvp"]),
};

export const can = (role: MembershipRole, p: Permission) => MAP[role].has(p);
export const isAdminRole = (role: MembershipRole) => role === "owner" || role === "admin";
export const isMemberRole = (role: MembershipRole) => role !== "guest";

/** Which roles an actor may grant or change. Owners: anything. Admins: not owner/admin. */
export function canAssignRole(actor: MembershipRole, target: MembershipRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner" && target !== "admin";
  return false;
}
/** May `actor` modify (pause/remove/change role of) a member currently holding `target`? */
export function canManageMember(actor: MembershipRole, target: MembershipRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner" && target !== "admin";
  return false;
}
