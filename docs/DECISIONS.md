# Decisions

Format: **D-n** decision — why. Newest at the bottom of each section.

## Stack and architecture
- **D-1 Drizzle + `pg` on Neon, not Prisma.** House standard for Neon apps (khawcc, PaceVelo). `pg` (TCP) rather than the Neon HTTP driver because RLS needs interactive transactions.
- **D-2 Two Postgres roles + RLS + app-level `withTenant`.** Bibliotek's proven pattern; isolation does not depend on remembering a `where`. The app refuses to serve tenant data if its role can bypass RLS.
- **D-3 `tenant_id` on every tenant-owned table, including child tables** (profiles, visibility, signups, recaps, tokens, preferences). Makes one uniform RLS predicate; costs one column.
- **D-4 Users are global, memberships are tenant-scoped.** `users`, `sessions`, `login_tokens` are not tenant tables and are reached only through the owner connection in a few auth modules.
- **D-5 DB-backed sessions, not stateless JWT.** Revocation on removal/pause/logout/delete must be immediate. Token is 32 random bytes, stored as SHA-256; cookie is `__Host-achelon_session` (httpOnly, Secure, SameSite=Lax).
- **D-6 Magic link lands on a confirm page and a POST consumes it.** Email scanners and link previews issue GETs; consuming on GET would burn links. Single use, 15 min, hashed at rest.
- **D-7 Login never reveals existence.** Same response, same status, same approximate timing; the email is queued and sent after the response (`after()`), and unknown/inactive addresses simply send nothing. Rate limited per IP and per address.
- **D-8 CSRF:** server actions (framework Origin check) + SameSite=Lax + explicit Origin check on the few non-action POST route handlers.
- **D-9 Rate limiting in Postgres** (`rate_limits`, atomic upsert), as PaceVelo. Per-instance memory limits are useless on serverless.
- **D-10 Email via Resend over `fetch`, outbox with dedupe key.** Without `RESEND_API_KEY` it logs to the console. Preference checks happen when enqueuing. Essential mail (magic link, invite, RSVP confirmation) ignores preferences.
- **D-11 Applications are sponsor-submitted.** The brief forbids public pages other than login and invite-accept, so there is no public apply form. A member nominates someone (name, email, company, message); an admin approves, which creates an email invite with the sponsor recorded. `applications.sponsor_membership_id` is required.
- **D-12 No image hosting in v1.** `photo_url` and recap `photo_urls` accept https URLs only. Avoids storing member photos and a blob dependency; initials avatars by default. Revisit with Vercel Blob if EEN wants uploads.
- **D-13 Reminders run from a daily Vercel cron** (works on every plan) selecting events starting in the next 36–60h not yet reminded, so reminders land ~48h before ±12h. The outbox is also flushed right after enqueue. Hourly scheduling can be added via GitHub Actions if wanted.
- **D-14 Strava behind `STRAVA_MODE=off|mock|live`.** No credentials are available, so default is `off` in production and `mock` locally/in tests. Scopes `read,activity:read` only. Tokens AES-256-GCM encrypted, as PaceVelo.
- **D-15 Localisation-ready:** UI chrome and status strings live in `src/lib/i18n/en.ts` behind `t()`. Dates/numbers always through `Intl` with the viewer's locale and time zone. Long-form admin copy is partly inline; noted as a known gap in HANDOVER.
- **D-16 No analytics, no third-party scripts, no external fonts** (system font stack: SF on Apple devices). This departs from Bibliotek's Geist, in favour of the HIG's system fonts and privacy.

## Design
- **D-17 Visual language:** Bibliotek's neutral canvas + a single tint, adapted: tint is a deep "club blue-green" (EEN), system font stack, translucent chrome that respects `prefers-reduced-transparency`. Where Bibliotek's choices (custom font) conflict with the HIG, the HIG wins.
- **D-18 Navigation:** bottom tab bar (Home, Events, Directory, Calendar, Me) below 768px; sidebar at ≥768px. Admin lives under Me on mobile and as a sidebar section on wide screens. Guests only see Events and Me.
- **D-19 Sheets for create/filter** use the native `<dialog>` element (focus trap, Esc, inert background for free).

## Open questions (from the brief)
- **D-20 Invites:** launch with admin-issued invites plus member sponsorship that requires admin approval (tenant setting `sponsorship` on/off).
- **D-21 Guests** see events only (no directory, no race board, no member profiles). Tab bar for guests: Events, Calendar, Me.
- **D-22 Time zones:** `timestamptz` UTC + event IANA zone. Display in viewer's zone first with the event-local time beside it when they differ.
- **D-23 Sign-ups:** names visible to members by default; per-event `attendee_visibility = names | counts` ("counts only"). Admins always see names.
- **D-24 Retention:** leaving/removed members and deleted accounts are soft-deleted; a purge job hard-deletes their personal data after 30 days. `audit_log` stores actor ids only (no FK, no names).
- **D-25 Field visibility semantics:** `nobody` < `admins` < `members`. `members` means all active members (and admins); `admins` means owner/admin only; the member themself always sees everything. Defaults: display name, city, sports, level, open-to → members; job title, company, country, bio, pace/speed, photo, Strava → admins. These defaults are shown as editable choices on the invite-accept screen. Guests never see other members' profiles.
- **D-26 Membership listing:** a member appears in the directory only when `status = active` and role ≠ guest.
- **D-27 First tenant and first owner** are created by `npm run db:bootstrap` (owner email from env), never by a public sign-up.

## Added during Phase 1
- **D-28 Email-bound invites open a session; link-only invites must confirm the mailbox.** For an email-bound invite the token was delivered to that mailbox, so possession proves ownership. A link-only invite lets the holder type any address; if that opened a session it could be used to sign in as someone else. So link-only acceptance creates the membership as `invited` and emails a confirm link; redeeming any magic link for that user activates it. Already-active members accepting a link-only invite change nothing.
- **D-29 Event audience by role:** `all_members` = owner/admin/founding_member/member; `founding_only` = owner/admin/founding_member; `invite_list` = listed people (guests included) plus admins. Guests only ever see events they are listed on.
- **D-30 Directory filtering happens in the app, after visibility projection** (`directoryFor` + `matchesFilters`). Filters and search can only match what the viewer can see, so "filter by city" can't reveal a hidden city. Fine up to a few thousand members per community; revisit with a SQL projection if one ever grows past that.
- **D-31 Cross-tenant FK integrity is enforced by a trigger** (`enforce_same_tenant`), because Postgres FK checks bypass RLS. It re-reads the parent under RLS and rejects missing/foreign parents.
- **D-32 Pausing or removing a member cancels their upcoming sign-ups** so capacity is freed and waitlists can promote.
- **D-33 No service worker.** Authenticated pages are never cached on-device by us and iOS "Add to Home Screen" works from the manifest alone. Revisit only if offline is requested.
- **D-34 Imports create email-bound invites, not memberships.** Imported people have not consented yet; their CRM details are held as `invites.prefill` (wiped on use) so the accept screen is pre-filled. Nobody is emailed until an admin sends from Invites.
- **D-35 Sent essential mail is scrubbed.** When a real provider is configured, delivered sign-in/invite email bodies (which contain single-use links) are replaced with a stub in `email_outbox`.
- **D-36 Active nav state is not colour-only** (weight + stroke), and the tab bar caps label growth like iOS does.

## Added during Phase 2
- **D-37 One lock, one transaction for sign-ups.** `rsvp()` locks the event row (`FOR UPDATE`), re-reads counts and applies `decideRsvp()`. A 12-way concurrent test proves capacity is never exceeded and waitlist positions are unique. Waitlist is strict FIFO (a free seat is never taken by someone who joined later).
- **D-38 The iCal link is shown once.** Tokens are hashed at rest, so they cannot be re-displayed; "Subscribe" creates one (or a new one, killing the old) and the member can switch it off. The feed excludes drafts and includes cancelled events with `STATUS:CANCELLED` so calendars remove them.
- **D-39 Calendar views bucket instants into the viewer's local day** (cookie zone → profile → community default), so an event at 06:00 Singapore appears on the right day for a viewer in London.
- **D-40 Admin attendee override:** "Move to going" can exceed capacity (audited) for the cases where the organiser wants to squeeze someone in.
- **D-41 CSV export neutralises spreadsheet formulas** (cells starting `= + - @` are prefixed), and every export is audited.

## Added during Phase 3
- **D-42 Permission guards live in segment layouts**, not only in pages: a layout runs before any `loading.tsx` boundary streams, so a refused request is a true HTTP 404 (not a 200 containing a "not found" screen). Pages still re-check their specific permission (cached per request).
- **D-43 Outbox rows are leased.** `claimed_at` is set when a flusher takes a row; others skip it for 5 minutes. Found by a concurrency test (two overlapping flushes delivered the same mail).
- **D-44 Goal times are private to their owner**, even when the race itself is shared with members; "I'm going too" never copies one.
- **D-45 Nomination responses are uniform.** The sponsor sees the same confirmation whether the nominee is new, already invited or already a member; only admins see "Already a member". Rate-limited to 5/day per member.
- **D-46 Cancellation and RSVP confirmation are essential mail** (ignore preferences): people may have booked travel. New events, reminders, waitlist and announcements respect preferences; digest members get one Monday mail instead of separate ones.
- **D-47 Reminders**: a 36-60 h window and the `reminder_sent_at` marker make the daily job idempotent; a missed day simply skips that cohort rather than double-sending.
