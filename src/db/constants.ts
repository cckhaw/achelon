/** Client-safe enums and shared types. No server imports here. */

export const MEMBERSHIP_ROLES = ["owner", "admin", "founding_member", "member", "guest"] as const;
export const MEMBERSHIP_STATUSES = ["invited", "active", "paused", "left"] as const;
export const SPORTS = ["cycling", "running", "triathlon", "other"] as const;
export const LEVELS = ["social", "intermediate", "competitive"] as const;
export const OPEN_TO = ["training_partners", "race_buddies", "introductions", "mentoring"] as const;
export const VISIBLE_TO = ["nobody", "admins", "members"] as const;
export const EVENT_TYPES = ["een_ride", "een_run", "een_social", "external_race", "trip"] as const;
export const EVENT_VISIBILITIES = ["all_members", "founding_only", "invite_list"] as const;
export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export const ATTENDEE_VISIBILITIES = ["names", "counts"] as const;
export const SIGNUP_STATUSES = ["going", "waitlist", "maybe", "declined", "cancelled"] as const;
export const RACE_VISIBILITIES = ["nobody", "members"] as const;
export const APPLICATION_STATUSES = ["pending", "approved", "declined"] as const;
export const ANNOUNCEMENT_AUDIENCES = ["all_members", "founding_only", "admins"] as const;
export const DIGEST_MODES = ["off", "weekly"] as const;
export const OUTBOX_STATUSES = ["pending", "sent", "failed"] as const;
export const OUTBOX_CATEGORIES = ["essential", "announcement", "reminder", "waitlist"] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type Sport = (typeof SPORTS)[number];
export type Level = (typeof LEVELS)[number];
export type OpenTo = (typeof OPEN_TO)[number];
export type VisibleTo = (typeof VISIBLE_TO)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type AttendeeVisibility = (typeof ATTENDEE_VISIBILITIES)[number];
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export interface TenantSettings {
  branding?: { tint?: string };
  defaultTimezone?: string;
  allowedEventTypes?: EventType[];
  /** Members may nominate new members (admin approves). */
  sponsorshipEnabled?: boolean;
}

export const DEFAULT_TENANT_SETTINGS: Required<Pick<TenantSettings, "defaultTimezone" | "allowedEventTypes" | "sponsorshipEnabled">> = {
  defaultTimezone: "UTC",
  allowedEventTypes: [...EVENT_TYPES],
  sponsorshipEnabled: true,
};

/** Profile fields that carry a per-field visibility setting. `displayName` is always shown to members. */
export const VISIBILITY_FIELDS = [
  "job_title",
  "company",
  "city",
  "country",
  "bio",
  "sports",
  "level",
  "pace",
  "speed",
  "open_to",
  "photo",
  "strava",
] as const;
export type VisibilityField = (typeof VISIBILITY_FIELDS)[number];

/** Conservative defaults (D-25). */
export const DEFAULT_VISIBILITY: Record<VisibilityField, VisibleTo> = {
  job_title: "admins",
  company: "admins",
  city: "members",
  country: "admins",
  bio: "admins",
  sports: "members",
  level: "members",
  pace: "admins",
  speed: "admins",
  open_to: "members",
  photo: "admins",
  strava: "admins",
};
