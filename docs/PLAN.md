# Achelon — Plan

Achelon is the private member platform for the Executive Endurance Network (EEN). Directory, events and races, sign-ups and a shared calendar in one place, replacing Google Forms + WhatsApp + Strava Club logistics. "Achelon" nods to "echelon", the staggered formation cyclists ride in a crosswind.

## 1. What the sibling apps taught us (Step 1)

| Topic | Finding | Achelon decision |
|---|---|---|
| Framework | khawcc / PaceVelo / SplitLine: Next 16 App Router, React 19, Tailwind 4, zod 4, jose. Bibliotek: Next 15. | Next 16, React 19, Tailwind 4, TS strict, zod 4. |
| Database | khawcc + PaceVelo: Neon + Drizzle, migrations in `drizzle/` or `db/migrations`, applied by a small script in CI. Bibliotek: Prisma + Postgres RLS with two roles. | **Neon Postgres + Drizzle** (house standard) with **Bibliotek's two-role RLS pattern** (multi-tenant is its job). |
| Multi-tenancy | Bibliotek: `app.tenant_id` set with transaction-local `set_config`, non-owner runtime role, plus an application-level scope, plus a start-up guard that refuses to serve if the role bypasses RLS. | Same, re-implemented on Drizzle. |
| Auth | Signed httpOnly cookies (jose), bcrypt passwords. | Passwordless magic link; **DB-backed revocable sessions** (random token, hashed at rest) in an httpOnly `__Host-` cookie. |
| Email | Resend (PaceVelo, Bibliotek) with console fallback, outbox with dedupe key. | Resend via HTTPS `fetch`, console fallback, transactional outbox with dedupe key. |
| Rate limit | PaceVelo: Postgres `rate_limits` table, atomic upsert. | Same. |
| Strava | PaceVelo `lib/strava`: OAuth code exchange, refresh, AES-256-GCM token encryption (`TOKEN_ENCRYPTION_KEY`), `STRAVA_API_BASE_URL` override. | Reuse the approach; read-only scopes; feature flag + mock provider. |
| CI/CD | `deploy-production.yml` (push to main → `vercel deploy --prod`, wait for READY, cleanup of old deployments); `ci.yml` on PRs; `vercel.json` with `"git": {"deploymentEnabled": false}`. | Identical convention. |
| Look | Bibliotek: neutral canvas, one softened Apple-green tint, Geist, materials, Apple-design skill. khawcc: warm paper + Fraunces. PaceVelo: teal. | Bibliotek's language (closest to the HIG), tinted for EEN. Conflicts with HIG favour the HIG (see DECISIONS). |

## 2. Stack

Next.js 16 (App Router, server components + server actions) · TypeScript · Tailwind 4 · Drizzle ORM + `pg` · Neon Postgres (pooled URL) · zod 4 · Resend · Vitest (unit + integration against real Postgres) · Playwright (e2e, iPhone + desktop) · GitHub Actions → Vercel (production only).

`pg` over TCP (not the Neon HTTP driver) because RLS needs interactive transactions (`set_config(..., true)` then queries); works identically on Neon's pooler and local Postgres.

## 3. Architecture

- **Two DB roles.** `DATABASE_URL` → `achelon_app` (not owner, RLS enforced). `DATABASE_URL_OWNER` → owner (migrations, login, session lookup, cron fan-out). The app verifies at runtime that the app role is not RLS-exempt and fails closed.
- **`withTenant(tenantId, fn)`** is the only way to touch tenant tables: opens a transaction, sets `app.tenant_id`, runs `fn(tx)`. Every tenant table has `tenant_id` and a policy `tenant_id = current_setting('app.tenant_id', true)::uuid`.
- **Visibility in one place**: `src/lib/visibility.ts` is the only code that decides which profile fields a viewer sees. Directory, profile page, attendee lists, exports all call it.
- **Permissions in one place**: `src/lib/rbac.ts` permission map; pages/actions check permissions, never roles.
- **Capacity/waitlist in one place**: `src/lib/services/signups.ts`, single transaction with a row lock on the event.
- **Services** are plain functions taking a tenant transaction; pages and actions are thin.

## 4. Routes

Public: `/login`, `/login/verify`, `/invite/[token]`, plus `/manifest.webmanifest`, icons, `/api/health`, `/api/cron/*` (bearer secret), `/cal/[token].ics` (secret URL, not indexable).
Member: `/[tenant]` (Home), `/directory`, `/members/[id]`, `/me` (profile + visibility), `/events`, `/events/[id]`, `/races`, `/calendar`, `/settings`, `/apply` is public per-tenant? **No** — applications are submitted by sponsors on behalf of candidates (member sponsorship), so there is no public form. See DECISIONS D-11.
Admin: `/[tenant]/admin/{members,invites,events,applications,announcements,settings,audit,import,insights}`.

## 4b. Schema

See `docs/DATA-MODEL.md` (generated from `src/db/schema.ts`). Changes from the brief, each justified in DECISIONS: added `sessions`, `login_tokens`, `rate_limits`, `email_outbox`, `event_invitees`, `event_results`, `strava_connections`; `tenant_id` on every tenant-owned table (incl. children) so RLS is one uniform predicate; `events.attendee_visibility`; `memberships.left_at`/`last_active_at`; `audit_log` has no FK to memberships so purging a member never rewrites history.

## 5. Phasing

1. **Foundations** — scaffold, design system + PWA shell, schema + RLS, magic-link auth + sessions, invites, profiles + field visibility, directory, admin members/invites, audit log, CSV import (dry-run), tenant-isolation + permission tests, CI.
2. **Events** — create/publish/cancel, RSVP with capacity + waitlist, event detail, calendar (month + agenda), per-member iCal feed.
3. **Race board + comms** — race declarations, notification emails (new event, RSVP confirmation, 48h reminder, waitlist promotion), announcements, recaps, applications + sponsorship.
4. **Strava** — opt-in OAuth, verified badge, event leaderboard, behind `STRAVA_MODE=off|mock|live`.
5. **Insight + polish** — engagement summary, empty/error/loading states, export/delete end to end + purge job, Lighthouse pass, final HIG audit, docs.

After each phase: typecheck, lint, tests, HIG audit, docs, commit.

## 6. Open questions — answers

Recorded in `docs/DECISIONS.md` (D-20 onward) and summarised: admin invites + sponsorship requiring admin approval; guests see events only; UTC + IANA zone, viewer's zone first with event-local beside it; names visible by default with per-event "counts only"; departed members soft-deleted 30 days then purged, audit keeps actor ids only.

## 7. Delivery

GitHub Actions only (`deploy-production.yml`), Vercel `git.deploymentEnabled=false`, domain `achelon.khaw.cc`, env vars via Vercel (never in repo). Anything needing a secret I do not have (Neon URL, Resend key, Strava client) is built against a local stand-in and listed in `docs/HANDOVER.md`.
