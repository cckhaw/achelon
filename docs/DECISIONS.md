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

## Added during Phase 4
- **D-48 Strava mode and verified-level rule.** `STRAVA_MODE=off|mock|live`; production defaults to **off** because no client id/secret exists yet; `live` additionally needs `STRAVA_CLIENT_ID/SECRET` or the feature stays off. "Strava verified" means the last 8 weeks of rides/runs support at least the level the member declared: *competitive* = ≥28 km/h average and ≥120 km/week riding, or ≤5:00/km and ≥30 km/week running; *intermediate* = ≥23 km/h and ≥60 km/week, or ≤6:00/km and ≥20 km/week; *social* = at least 4 activities otherwise; fewer than 4 activities → no badge. Only the boolean badge is shown to others (subject to the member's visibility setting for it); the inferred level is shown to the member alone.
- **D-49 Read-only, opt-in, minimal.** Scopes `read,activity:read` (never `activity:read_all`, never write). Connecting is optional and has its own consent switch for leaderboards (default on, shown before connecting, changeable any time; switching it off deletes the member's results). The OAuth state is a signed JWT bound to the signed-in user (callback must match the session), tokens are AES-256-GCM at rest, one Strava account per member per community, a revoked refresh token clears the connection locally, and a 5xx/bad-client error is never mistaken for a revocation.
- **D-50 Leaderboards** exist for rides (ranked by distance, then climbing), runs and external races (ranked by pace); socials/trips have none. A result is the activity of the right sport starting within 30 min before the start to the end of the event (4 h if no end), closest to the start, for members who were *going*. They appear only when the event shows names (counts-only events show a member only their own line), never to people who can't see the event. Results are fetched by the daily job for events that ended in the last 14 days and on "Sync now".
- **D-51 API calls never hold a DB transaction open.** The sync reads, calls Strava, then writes in separate short transactions.

## Added at deployment
- **D-52 One database URL is enough: tenant transactions `SET LOCAL ROLE achelon_app`.** Managed Postgres (Neon via the Vercel integration) provides a single owner URL. Rather than require a second login role and URL, every tenant transaction switches to the restricted, NOLOGIN `achelon_app` role (granted to the owner with the SET option by the migration) before setting `app.tenant_id`. RLS therefore applies whichever role the connection logged in as, the fail-closed guard inspects the role that actually runs the queries, `DATABASE_URL_OWNER` and `APP_DB_PASSWORD` became optional, and tests prove isolation over an owner connection and that pointing the app role at the owner is refused.
- **D-53 Cleanup is gated on "live", not on the smoke test.** Old Vercel deployments are deleted as soon as the new production deployment is READY.

## Added with password sign-in and the platform portal
- **D-54 Password sign-in, with the emailed link kept for first-time setup and reset.** Hashing is scrypt (Node built-in, N=2^15, parameters stored per hash). The login form never reveals whether an address exists (same message, and a real hash is verified for unknown addresses). Throttling counts *failed* attempts per address (8 per 15 min, so a stranger can't lock someone out by trying, and correct logins never count) plus an overall per-IP limit; the email link is unaffected. Setting a password needs the current one unless the session began with an emailed link in the last 15 minutes (the reset path); changing it ends all other sessions. A password is accepted at sign-up only for **email-bound invites** (the token already proves the mailbox); for link-only invites none is stored until the email is confirmed, otherwise a stranger could pre-set the password on someone else's address. Tenant code cannot read `users.password_hash` (column-level grant).
- **D-55 Platform operators are configured by environment variable only** (`PLATFORM_ADMIN_EMAILS`). They create communities, add owners and suspend/reactivate communities, but see no member data. Suspension is enforced everywhere a community is entered (member area, picker, invites, calendar feeds, daily jobs). Operators can sign in without belonging to any community.
- **D-56 Failed form submissions keep what the user typed.** React 19 resets uncontrolled fields after every server action; the forms cancel that reset so a wrong password does not clear the email, and a validation error does not wipe a long profile or event form.

## Front page redesign
- **D-57 The "front page" is the sign-in screen, and it stays generic.** The product is invisible by default, so the only public pages are sign-in, link confirmation and invitations. The redesign (black and yellow, bold type, announcement bar, nav with a primary "Sign in" button, hero with the sign-in card, trust strip, three value props, four panels with large yellow numbers, three short guides, footer) takes its structure from a modern SaaS home page but contains no member, community or event information, no external scripts, fonts, images or tracking, and every claim on it is literally true (1 single-use link per invitation, reminders 48 h before events, 0 trackers, 30 days until erased).
- **D-58 Yellow is a fill, never small text.** In dark mode: black page, yellow buttons, highlights and big numbers. In light mode: yellow hero band with black type, black buttons with yellow text, white card; links are black and underlined. Both schemes were checked with axe (contrast), at 200% text, on iPhone and desktop. The member app keeps its own calm theme; only the public pages use the brand theme (`src/app/brand.css`, scoped under `.brand`).

## D-59: Public Terms and Privacy pages
`/terms` and `/privacy` are public, generic pages (route group `src/app/(legal)`, brand theme, `force-dynamic` so the proxy's CSP nonce applies) linked from the front-page footer, legal line and sign-in card. "terms" and "privacy" are reserved community slugs. The text is a starting template that mirrors `docs/PRIVACY.md`; it names no legal entity, governing jurisdiction or contact address, so the owner should have it reviewed and add those before relying on it.

## D-60: Password-only sign-in; email links only to reset
The sign-in form has no "Email me a link" option. Email and password sign in; "Forgot password?" emails a single-use link that lands on the set-password page (also how a member with no password yet sets one). Invitation and confirm-email links are unchanged.

## D-61: One black-and-yellow theme everywhere
The member app uses the same palette as the front door: dark = black surfaces with yellow accents; light = pale-yellow page, white cards, black controls with yellow labels (yellow is a fill, never text on white). The per-community accent colour setting was removed. Email templates, the PWA manifest, theme-color and app icons follow the palette.

## D-62: Malaysia (GMT+8) default time zone, dropdown everywhere
`Asia/Kuala_Lumpur` is the default for new communities, new events and the viewer fallback. Every time-zone field is a dropdown ("Common" zones first, then all IANA zones by GMT offset). Migration 0006 moves communities that never chose a zone (unset, UTC or Asia/Singapore) to Malaysia.

## D-63: Inviting people to an event
`invites.event_id` (migration 0006). An admin can email an invitation from the event's admin page; accepting it creates the account (guest by default) and puts the person on that event's invite list. `canViewEvent`: being on an event's invite list always grants access, including guests on all-members events. The admin page also shows the event link for members who are already signed up.

## D-64: Tablet layout
The sidebar takes at most 30% of the screen (`--side-w`), so iPad-size screens at 200% text keep room for content. A `tablet` Playwright project (iPad metrics) runs the visual checks.

## D-65: Legal page details
Operator named as "Achelon", contact `me@khaw.cc`, governing law Malaysia (Terms §11, §12; Privacy §1, §9, §12). Have the text reviewed by a lawyer before relying on it.

## D-66: Black trim on the app shell
Sidebar and phone tab bar are black with a 4px yellow edge; the active item is a yellow fill with black text. Sign out sits at the bottom of the sidebar (on phones it stays under Me). On wide screens the page bar lines up with the content and has padding above and to the right, so action buttons no longer touch the window edge.

## D-67: Front-page footer pages; browser only
Every Product and Privacy footer item has a public page at `/features/<slug>` (content in `src/lib/feature-pages.ts`, generic, names no community). The Install column, nav link and guide were removed because Achelon is used in the browser. Terms and Privacy links appear in the Legal column, the footer line, the sign-in card, and under every invite and confirm page; the invite consent text links to both. The Legal links were invisible before (dark link colour on black): fixed with matching specificity.

## D-68: Footer link style
Front-page footer links have no underline, a yellow highlight with black text on hover (only on devices that hover), the same highlight while pressed, a yellow focus ring, and 44pt minimum touch targets. On phones the columns are two across with Legal below. The Terms/Privacy links sit in their own row, apart from the copyright text, so they pass the "link in a text block" accessibility rule without an underline.
