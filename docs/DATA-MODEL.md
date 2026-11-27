# Data model

Source of truth: `src/db/schema.ts` (Drizzle) + `drizzle/*.sql`. Every tenant-owned table has `tenant_id`, RLS enabled and a policy `tenant_id = app_tenant_id()`. A trigger (`enforce_same_tenant`) rejects references to another tenant's parent row.

## Global (no tenant_id; owner connection only, except where noted)

| Table | Purpose |
|---|---|
| `tenants` | id, slug, name, created_at, settings jsonb (branding tint, default timezone, allowed event types, sponsorship on/off). App role may read/update only its own row. |
| `users` | id, email (citext unique), created_at, last_login_at, deleted_at. One person, one login. App role: SELECT only, and only users who are members of the current tenant (RLS). |
| `sessions` | token SHA-256, expiry. No app-role grant. |
| `login_tokens` | single-use magic-link tokens (SHA-256), 15 min. No app-role grant. |
| `rate_limits` | keyed (HMAC) buckets. No app-role grant. |
| `email_outbox` | transactional outbox with unique `dedupe_key`; bodies of delivered essential mail are scrubbed. No app-role grant. |

## Tenant-owned (RLS)

| Table | Notes |
|---|---|
| `memberships` | role `owner/admin/founding_member/member/guest`, status `invited/active/paused/left`, joined_at, left_at, last_active_at, invited_by. unique(tenant, user). `invited` = accepted via link-only invite, awaiting email confirmation. |
| `member_profiles` | pk membership_id. Name, title, company, city, country, timezone, bio, sports[], level, pace (s/km), speed (km/h), open_to[], photo_url, strava_athlete_id, strava_verified. |
| `field_visibility` | (membership, field) → `nobody/admins/members`. Applied only in `src/lib/visibility.ts`. |
| `invites` | token hash, optional bound email, role, sponsor, expiry, used/revoked, note, `prefill` (CSV import, wiped on use), `emailed_at`. |
| `applications` | sponsor-submitted nominations: pending/approved/declined. |
| `events` | type, title, times (UTC) + IANA timezone, location, route, distance, capacity, rsvp cutoff, visibility, `attendee_visibility` (names/counts), status, external_url, reminder_sent_at. |
| `event_invitees` | audience for `invite_list` events. |
| `event_signups` | going/waitlist/maybe/declined/cancelled, waitlist `position`. unique(event, member). |
| `race_declarations` | race name/date/location/distance/goal, visible_to, optional link to an `external_race` event. |
| `announcements`, `event_recaps` | markdown bodies; recaps carry https photo URLs only. |
| `calendar_tokens` | one secret iCal URL per member (SHA-256), revocable. |
| `notification_preferences` | announcements, reminders, waitlist, digest. |
| `audit_log` | action, target, metadata (ids only). `actor_membership_id` has no FK so purging a member never rewrites history. |
| `strava_connections` | AES-256-GCM encrypted tokens, scope. |
| `event_results` | Strava-derived leaderboard rows. |

## Differences from the brief (and why)
Added `sessions`, `login_tokens`, `rate_limits`, `email_outbox`, `event_invitees`, `event_results`, `strava_connections`; `tenant_id` on child tables (uniform RLS); `events.attendee_visibility`, `events.reminder_sent_at`; `memberships.left_at/last_active_at`; `invites.prefill/emailed_at`; `applications.invite_id`. See DECISIONS D-3, D-5, D-24, D-31, D-34.
