/** Pure engagement classification for the admin summary. "Went" means signed up as going to a published past event. */
export type Engagement = "new" | "active" | "quiet";

export interface EngagementInput {
  joinedAt: Date | null;
  lastActiveAt: Date | null;
  lastWentAt: Date | null;
  now?: Date;
}

const DAY = 86_400_000;
export const NEW_DAYS = 30;
export const ACTIVE_LOGIN_DAYS = 30;
export const ACTIVE_ATTEND_DAYS = 45;

export function classifyEngagement(i: EngagementInput): Engagement {
  const now = (i.now ?? new Date()).getTime();
  const within = (d: Date | null, days: number) => d !== null && now - d.getTime() <= days * DAY;
  if (within(i.joinedAt, NEW_DAYS)) return "new";
  if (within(i.lastActiveAt, ACTIVE_LOGIN_DAYS) || within(i.lastWentAt, ACTIVE_ATTEND_DAYS)) return "active";
  return "quiet";
}
