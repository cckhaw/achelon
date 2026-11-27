# Handover: deploy, secrets, backups, second community

Everything below is already built and tested. What remains are the account-level steps only you can do (secrets, DNS, repo visibility). Nothing here needs code changes.

## Status at handover
- Phases 1 to 5 built; typecheck, lint, **170 unit/integration tests** and **34 browser tests** (iPhone + desktop) green locally; production build verified; Lighthouse mobile 94-99 / 100 / 100.
- Vercel project **`achelon`** exists (team `cckhaw-5201`, project id `prj_Vsd9XaM3Jc2EeGVbLXi2zaaWnVsU`), Node 22, no Git integration (production deploys only through GitHub Actions), preview deployments off. Domain **achelon.khaw.cc** is attached and ownership-verified. Non-secret env vars set: `APP_URL`, `STRAVA_MODE=off`, `MAIL_FROM`.
- **Not yet live**: there is no database, email key or DNS record yet (see checklist). Nothing was deployed, because an app without a database would only show errors.

## Your checklist (in order, about 20 minutes)

### 1. Make the repository private
GitHub → `cckhaw/achelon` → Settings → General → Danger zone → *Change visibility* → Private. (It was created public before this work started; the code contains no member data or secrets, but the brief asks for private.)

### 2. Database (Neon)
1. Create a Neon project/database (any region near Singapore, e.g. `aws-ap-southeast-1`).
2. Copy the **pooled** connection string of the owner role (the default `neondb_owner`): this is `DATABASE_URL_OWNER`.
3. Choose a long random password for the runtime role: this is `APP_DB_PASSWORD`. The first deploy creates the role `achelon_app` (non-owner, RLS-enforced) with that password.
4. Build `DATABASE_URL` from the same host: `postgresql://achelon_app:<APP_DB_PASSWORD>@<same pooled host>/<db>?sslmode=require`.

### 3. Email (Resend)
Create an API key (sending access) and verify the domain `khaw.cc` (or your sending domain). Set `MAIL_FROM` if it isn't `Achelon <noreply@khaw.cc>`. Until then email is written to the server log only.

### 4. Secrets and variables
Generate two app secrets: `openssl rand -base64 32` (APP_SECRET) and `openssl rand -hex 24` (CRON_SECRET).

**Vercel → Project `achelon` → Settings → Environment Variables (Production)**

| Name | Value | Type |
|---|---|---|
| `DATABASE_URL` | `achelon_app` connection string (step 2.4) | Sensitive |
| `DATABASE_URL_OWNER` | owner connection string (step 2.2) | Sensitive |
| `APP_SECRET` | random, 32+ chars | Sensitive |
| `CRON_SECRET` | random | Sensitive |
| `RESEND_API_KEY` | from Resend | Sensitive |
| `APP_URL`, `STRAVA_MODE`, `MAIL_FROM` | already set | Plain |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_MODE=live` | only when you want Strava (below) | Sensitive |

**GitHub → `cckhaw/achelon` → Settings → Secrets and variables → Actions → Secrets**

| Secret | Value |
|---|---|
| `VERCEL_TOKEN` | a Vercel access token (account settings → Tokens) |
| `VERCEL_ORG_ID` | `team_FdOJU6k0aSSHE2P7hHTWrNuP` |
| `VERCEL_TEAM_ID` | `team_FdOJU6k0aSSHE2P7hHTWrNuP` |
| `VERCEL_PROJECT_ID` | `prj_Vsd9XaM3Jc2EeGVbLXi2zaaWnVsU` |
| `DATABASE_URL_OWNER` | same as in Vercel (used to migrate and for the production smoke test) |
| `APP_DB_PASSWORD` | the runtime role password |

### 5. DNS (ClouDNS, where khaw.cc is hosted)
Add one record:

| Type | Host | Value |
|---|---|---|
| **CNAME** | `achelon` | `95ee175f815a5d81.vercel-dns-017.com.` |

(`cname.vercel-dns.com.` also works. This mirrors how `bibliotek.khaw.cc` is set up.) Vercel issues the TLS certificate automatically once it resolves.

### 6. Deploy
Merge the pull request (or run *Deploy production* manually). The workflow: lint + typecheck + tests → **migrate the database** → `vercel deploy --prod` → wait for health → **end-to-end happy path against https://achelon.khaw.cc** → delete older deployments.

### 7. Create EEN and its owner
GitHub → Actions → **Bootstrap community** → Run workflow: slug `een`, name `Executive Endurance Network`, your email. Then open https://achelon.khaw.cc/login, enter that email, and follow the link. Then follow `docs/ADMIN.md` ("First day"): settings → import the CRM CSV → send invitations.

## Day-two operations

### Rotate secrets
- **`APP_SECRET`**: changes the key for rate-limit buckets, Strava token encryption and OAuth state. Rotating it invalidates stored Strava tokens (members reconnect) and nothing else. Update in Vercel, redeploy.
- **`CRON_SECRET`**: update in Vercel; Vercel Cron picks it up on the next deploy.
- **Database**: `ALTER ROLE achelon_app PASSWORD '…'` (as owner) or change `APP_DB_PASSWORD` and re-run *Deploy production*; update `DATABASE_URL` in Vercel to match. Rotate the Neon owner password in Neon, then both `DATABASE_URL_OWNER` copies.
- **Sessions**: to sign everyone out, run `DELETE FROM sessions;` as owner.
- **Resend / Strava keys**: replace in Vercel and redeploy.

### Backups and restore
Neon keeps point-in-time history (restore to any moment in the retention window from the Neon console: create a branch at a timestamp, check it, then promote or copy). For an off-site copy: `pg_dump --format=custom "$DATABASE_URL_OWNER" > achelon-$(date +%F).dump`; restore with `pg_restore --no-owner -d <new db> achelon-….dump`, then run `npm run db:migrate` against it to re-create the app role and grants. Members can also export their own data (Settings), and admins can export attendee lists. **Store dumps like member data**: encrypted, never in the repository (CSV/dump files are git-ignored).

### Monitoring
`GET /api/health` returns `{ok, checks:{db, rls}}` without secrets; point an uptime monitor at it. The daily job (Vercel Cron 05:10 UTC, `/api/cron/daily`) sends reminders, the Monday digest, syncs Strava, purges departed members after 30 days and flushes email. Its response lists what it did; failures are logged in Vercel.

### Add a second community
Run **Bootstrap community** with a new slug, name and owner email. That is all: every table is tenant-scoped (row-level security), branding/time zone/event types are per community under Admin → Settings, and the same person can belong to several communities with one login (a picker appears at `/`). To test isolation yourself: `npm test` includes `tests/isolation.test.ts`, which proves tenant A cannot read or write tenant B across every tenant table.

### Enable Strava later
Create a Strava API application (callback domain `achelon.khaw.cc`; callback URL `https://achelon.khaw.cc/api/strava/callback`). Set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` and `STRAVA_MODE=live` in Vercel, redeploy. Members then see *Settings → Strava*. Scopes requested: `read,activity:read` only. Strava's own approval limits new apps to a small number of athletes until it is reviewed; request a limit increase from Strava before inviting everyone to connect.

### Adding schema changes
Edit `src/db/schema.ts` → `npm run db:generate` → review the SQL (add RLS policies for any new tenant table in a custom migration and add the table to `TENANT_TABLES`; `tests/isolation.test.ts` fails until you do) → commit. The deploy workflow migrates before shipping.

## Known gaps and honest notes
- **Not exercised against real services**: Resend, Neon and Strava were not available to me. Email falls back to logs, the database was local Postgres 16 (Neon is Postgres 16/17 with the same role model), and the live Strava client was tested against stubbed HTTP only. First real-world sends are the moment to look at deliverability (SPF/DKIM via Resend) and one real Strava connection.
- **VoiceOver** was not run on a physical iPhone; axe, semantics and keyboard tests passed. Do a quick pass before launch.
- **Localisation**: UI chrome and status strings go through `src/lib/i18n`; long-form admin screens and email templates are English-only inline text. Dates and numbers are locale- and time-zone-correct everywhere.
- **Photos** are https links only (no upload/hosting), by design; revisit with Vercel Blob if members want uploads.
- Reminders are sent by a daily job (about 48 h ± 12 h before start). For exact timing add an hourly scheduler (e.g. a GitHub Actions cron calling the endpoint).
- The directory is filtered in the application after visibility rules (fine to a few thousand members per community).
