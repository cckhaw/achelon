# Achelon

Private, invite-only member platform for the **Executive Endurance Network (EEN)**: senior telecom and tech leaders connected through cycling and running. One place for the member directory, events and races, sign-ups and a shared calendar, replacing Google Forms + WhatsApp + Strava Club logistics. Multi-tenant from day one: a tenant is a community; EEN is tenant one. ("Achelon" nods to "echelon", the staggered formation cyclists ride in a crosswind.)

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · Neon Postgres + Drizzle · row-level security · zod 4 · Resend · Vitest · Playwright · GitHub Actions → Vercel (production only).

Docs: [PLAN](docs/PLAN.md) · [DECISIONS](docs/DECISIONS.md) · [PROGRESS](docs/PROGRESS.md) · [DATA-MODEL](docs/DATA-MODEL.md) · [PRIVACY](docs/PRIVACY.md) · [ADMIN](docs/ADMIN.md) · [HIG-AUDIT](docs/HIG-AUDIT.md) · [HANDOVER](docs/HANDOVER.md)

## Quick start (local)

Requires Node 22 and PostgreSQL 14+ (16 recommended).

```bash
# 1. Database: an owner role that can create roles, and two databases
createuser --createrole --login --pwprompt achelon          # password: achelon
createdb -O achelon achelon && createdb -O achelon achelon_test

# 2. Config
cp .env.example .env     # then set APP_SECRET (openssl rand -base64 32) and CRON_SECRET
npm install

# 3. Schema, roles, demo data
npm run db:migrate       # applies drizzle/*.sql as the owner role, creates the RLS-enforced `achelon_app` role + grants
npm run db:seed          # fictional community "demo" (owen.owner@example.test is the owner)
npm run dev              # http://localhost:3000
```

Without `RESEND_API_KEY` emails are printed to the server console (and kept in `email_outbox`), so the magic link is in your terminal.

## Commands

| | |
|---|---|
| `npm run dev / build / start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc` |
| `npm test` | Vitest: unit + integration (real Postgres, database `achelon_test`) |
| `npm run test:e2e` | Playwright, iPhone and desktop viewports (starts the app unless `E2E_BASE_URL`/`E2E_REUSE` is set) |
| `npm run db:generate` | New migration from `src/db/schema.ts` (hand-edit RLS in a custom migration) |
| `npm run db:migrate` | Apply migrations + (re)provision the `achelon_app` role |
| `npm run db:bootstrap` | Create the first community and its owner (`BOOTSTRAP_*` env) |
| `npm run db:seed` | Fictional local data (refuses in production) |

## How tenant isolation works (read this before changing data code)

Two database roles. `DATABASE_URL` is `achelon_app`: not the table owner, so **row-level security applies**. Every tenant request runs inside `withTenant(tenantId, tx => …)`, which sets a transaction-local `app.tenant_id`; each tenant table has a policy `tenant_id = app_tenant_id()`. A trigger rejects rows that point at another tenant's parent. The owner role (`DATABASE_URL_OWNER`) is used only from `src/lib/system/*` (login, sessions, invite acceptance, cron) and is blocked elsewhere by an ESLint rule. At runtime the app refuses to serve tenant data if its role could bypass RLS. Tests in `tests/isolation.test.ts` prove it for every tenant table.

## Layout

```
src/app/            routes ([tenant]/… member + admin area, login, invite, api)
src/components/     ui primitives (tab bar, sheets, large titles), forms
src/db/             schema.ts (Drizzle), constants.ts (enums, defaults)
src/lib/            services/ (business logic), system/ (owner-connection modules), visibility.ts, rbac.ts, mail/, …
drizzle/            SQL migrations (0001 = RLS + cross-tenant triggers)
tests/  e2e/        Vitest · Playwright
scripts/            migrate, bootstrap, seed, icons, CSV guard
```

## Never commit member data

`.gitignore` blocks `import/*.csv`; `scripts/check-no-csv.sh` runs as a pre-commit hook (`npm install` activates it) and in CI. Seed data is entirely fictional (`*.example.test`).
