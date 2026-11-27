import type { EventVisibility, MembershipRole } from "@/db/constants";
import { isAdminRole } from "./rbac";

/** D-29: who may see an event. Drafts are admin-only. */
export function canViewEvent(o: { role: MembershipRole; visibility: EventVisibility; status: string; invited: boolean; isCreator?: boolean }): boolean {
  if (isAdminRole(o.role)) return true;
  if (o.status === "draft") return Boolean(o.isCreator);
  if (o.invited || o.isCreator) return true; // being on the event's invite list always grants access (guests included)
  if (o.visibility === "invite_list") return false;
  if (o.role === "guest") return false; // guests only see events they are listed on
  if (o.visibility === "founding_only") return o.role === "founding_member";
  return true; // all_members
}
