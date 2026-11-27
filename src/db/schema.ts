import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { TenantSettings } from "./constants";
import {
  ANNOUNCEMENT_AUDIENCES,
  APPLICATION_STATUSES,
  ATTENDEE_VISIBILITIES,
  DIGEST_MODES,
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  LEVELS,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  OPEN_TO,
  OUTBOX_CATEGORIES,
  OUTBOX_STATUSES,
  RACE_VISIBILITIES,
  SIGNUP_STATUSES,
  SPORTS,
  VISIBLE_TO,
} from "./constants";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const pk = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const membershipRole = pgEnum("membership_role", MEMBERSHIP_ROLES);
export const membershipStatus = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const sport = pgEnum("sport", SPORTS);
export const level = pgEnum("level", LEVELS);
export const openTo = pgEnum("open_to", OPEN_TO);
export const visibleTo = pgEnum("visible_to", VISIBLE_TO);
export const eventType = pgEnum("event_type", EVENT_TYPES);
export const eventVisibility = pgEnum("event_visibility", EVENT_VISIBILITIES);
export const eventStatus = pgEnum("event_status", EVENT_STATUSES);
export const attendeeVisibility = pgEnum("attendee_visibility", ATTENDEE_VISIBILITIES);
export const signupStatus = pgEnum("signup_status", SIGNUP_STATUSES);
export const raceVisibility = pgEnum("race_visibility", RACE_VISIBILITIES);
export const applicationStatus = pgEnum("application_status", APPLICATION_STATUSES);
export const announcementAudience = pgEnum("announcement_audience", ANNOUNCEMENT_AUDIENCES);
export const digestMode = pgEnum("digest_mode", DIGEST_MODES);
export const outboxStatus = pgEnum("outbox_status", OUTBOX_STATUSES);
export const outboxCategory = pgEnum("outbox_category", OUTBOX_CATEGORIES);

/* ───────────────────────────── global (non-tenant) tables ───────────────────────────── */

export const tenants = pgTable("tenants", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  settings: jsonb("settings").$type<TenantSettings>().notNull().default(sql`'{}'::jsonb`),
});

export const users = pgTable("users", {
  id: pk(),
  email: citext("email").notNull().unique(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  lastLoginAt: tstz("last_login_at"),
  deletedAt: tstz("deleted_at"),
});

/** Login sessions. Token is random, only its SHA-256 is stored. System table: owner connection only. */
export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Single-use magic-link tokens. System table. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
  },
  (t) => [index("login_tokens_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: tstz("window_start").notNull().defaultNow(),
});

/** Transactional outbox. System table: the app role has no grants on it. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: pk(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    category: outboxCategory("category").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Lease: a flusher owns the row until this is 5 minutes old (then it may be retried). Prevents double delivery. */
    claimedAt: tstz("claimed_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    sentAt: tstz("sent_at"),
    error: text("error"),
  },
  (t) => [index("outbox_status_idx").on(t.status, t.createdAt)],
);

/* ───────────────────────────── tenant-owned tables (RLS) ───────────────────────────── */

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("member"),
    status: membershipStatus("status").notNull().default("invited"),
    joinedAt: tstz("joined_at"),
    leftAt: tstz("left_at"),
    lastActiveAt: tstz("last_active_at"),
    invitedByMembershipId: uuid("invited_by_membership_id"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("memberships_tenant_user_uq").on(t.tenantId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const memberProfiles = pgTable("member_profiles", {
  membershipId: uuid("membership_id").primaryKey().references(() => memberships.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  jobTitle: text("job_title"),
  company: text("company"),
  city: text("city"),
  country: text("country"),
  timezone: text("timezone"),
  bio: text("bio"),
  sports: sport("sports").array().notNull().default(sql`'{}'::sport[]`),
  level: level("level"),
  typicalPaceRunSecPerKm: integer("typical_pace_run_sec_per_km"),
  typicalSpeedRideKmh: numeric("typical_speed_ride_kmh", { precision: 4, scale: 1 }),
  openTo: openTo("open_to").array().notNull().default(sql`'{}'::open_to[]`),
  photoUrl: text("photo_url"),
  stravaAthleteId: bigint("strava_athlete_id", { mode: "number" }),
  stravaVerified: boolean("strava_verified").notNull().default(false),
});

export const fieldVisibility = pgTable(
  "field_visibility",
  {
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    visibleTo: visibleTo("visible_to").notNull(),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.fieldName] })],
);

export const invites = pgTable(
  "invites",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: citext("email"),
    tokenHash: text("token_hash").notNull().unique(),
    createdByMembershipId: uuid("created_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    sponsorMembershipId: uuid("sponsor_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    roleGranted: membershipRole("role_granted").notNull().default("member"),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    usedByUserId: uuid("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: tstz("revoked_at"),
    note: text("note"),
    /** Profile details from a CSV import, shown prefilled on the accept screen and wiped on use (D-33). */
    prefill: jsonb("prefill").$type<{ name?: string; company?: string; jobTitle?: string; city?: string; country?: string } | null>(),
    emailedAt: tstz("emailed_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("invites_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const applications = pgTable(
  "applications",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    message: text("message"),
    sponsorMembershipId: uuid("sponsor_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    status: applicationStatus("status").notNull().default("pending"),
    decidedBy: uuid("decided_by"),
    decidedAt: tstz("decided_at"),
    inviteId: uuid("invite_id"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("applications_tenant_idx").on(t.tenantId, t.status)],
);

export const events = pgTable(
  "events",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    createdByMembershipId: uuid("created_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    type: eventType("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at"),
    timezone: text("timezone").notNull(),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationLat: real("location_lat"),
    locationLng: real("location_lng"),
    routeUrl: text("route_url"),
    distanceKm: numeric("distance_km", { precision: 7, scale: 1 }),
    paceOrLevelNote: text("pace_or_level_note"),
    capacity: integer("capacity"),
    rsvpCutoffAt: tstz("rsvp_cutoff_at"),
    visibility: eventVisibility("visibility").notNull().default("all_members"),
    attendeeVisibility: attendeeVisibility("attendee_visibility").notNull().default("names"),
    status: eventStatus("status").notNull().default("draft"),
    externalUrl: text("external_url"),
    reminderSentAt: tstz("reminder_sent_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("events_tenant_start_idx").on(t.tenantId, t.startsAt),
    check("events_capacity_pos", sql`${t.capacity} IS NULL OR ${t.capacity} > 0`),
    check("events_end_after_start", sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  ],
);

export const eventInvitees = pgTable(
  "event_invitees",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.membershipId] })],
);

export const eventSignups = pgTable(
  "event_signups",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    status: signupStatus("status").notNull(),
    position: integer("position"),
    note: text("note"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("event_signups_event_member_uq").on(t.eventId, t.membershipId),
    index("event_signups_event_idx").on(t.eventId, t.status),
    index("event_signups_member_idx").on(t.membershipId),
  ],
);

export const raceDeclarations = pgTable(
  "race_declarations",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    raceName: text("race_name").notNull(),
    raceDate: text("race_date").notNull(), // ISO date (YYYY-MM-DD): a calendar day, not an instant
    location: text("location"),
    distance: text("distance"),
    goalTime: text("goal_time"),
    visibleTo: raceVisibility("visible_to").notNull().default("members"),
    externalEventId: uuid("external_event_id").references(() => events.id, { onDelete: "set null" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("races_tenant_date_idx").on(t.tenantId, t.raceDate)],
);

export const announcements = pgTable("announcements", {
  id: pk(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  authorMembershipId: uuid("author_membership_id").references(() => memberships.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  audience: announcementAudience("audience").notNull().default("all_members"),
  sentAt: tstz("sent_at"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const eventRecaps = pgTable("event_recaps", {
  id: pk(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  authorMembershipId: uuid("author_membership_id").references(() => memberships.id, { onDelete: "set null" }),
  bodyMarkdown: text("body_markdown").notNull(),
  photoUrls: text("photo_urls").array().notNull().default(sql`'{}'::text[]`),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const calendarTokens = pgTable(
  "calendar_tokens",
  {
    membershipId: uuid("membership_id").primaryKey().references(() => memberships.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [uniqueIndex("calendar_tokens_hash_uq").on(t.tokenHash)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  membershipId: uuid("membership_id").primaryKey().references(() => memberships.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  eventAnnouncements: boolean("event_announcements").notNull().default(true),
  reminders: boolean("reminders").notNull().default(true),
  waitlist: boolean("waitlist").notNull().default(true),
  digest: digestMode("digest").notNull().default("off"),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

/** actor_membership_id has no FK on purpose: purging a member must not rewrite history. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    actorMembershipId: uuid("actor_membership_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    at: tstz("at").notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index("audit_tenant_at_idx").on(t.tenantId, t.at)],
);

export const stravaConnections = pgTable("strava_connections", {
  membershipId: uuid("membership_id").primaryKey().references(() => memberships.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  athleteId: bigint("athlete_id", { mode: "number" }).notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: tstz("expires_at").notNull(),
  scope: text("scope"),
  connectedAt: tstz("connected_at").notNull().defaultNow(),
  lastSyncAt: tstz("last_sync_at"),
});

export const eventResults = pgTable(
  "event_results",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
    stravaActivityId: bigint("strava_activity_id", { mode: "number" }),
    distanceM: integer("distance_m").notNull(),
    movingTimeS: integer("moving_time_s").notNull(),
    elevationM: integer("elevation_m"),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
  },
  (t) => [unique("event_results_event_member_uq").on(t.eventId, t.membershipId)],
);

/** Every table with a tenant_id column; RLS is enabled on exactly these (see drizzle/*_rls.sql and tests). */
export const TENANT_TABLES = [
  "memberships",
  "member_profiles",
  "field_visibility",
  "invites",
  "applications",
  "events",
  "event_invitees",
  "event_signups",
  "race_declarations",
  "announcements",
  "event_recaps",
  "calendar_tokens",
  "notification_preferences",
  "audit_log",
  "strava_connections",
  "event_results",
] as const;
