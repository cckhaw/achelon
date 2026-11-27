# Progress

- [x] Step 1 orient (sibling apps inspected)
- [x] Step 2 plan (PLAN, DECISIONS)
- [x] **Phase 1 Foundations**: schema + RLS + cross-tenant trigger; magic-link auth, DB sessions; invites (email-bound / link-only); profiles + per-field visibility; directory; admin members, invites, audit log, settings; CSV import with dry run; design system + PWA shell; tenant-isolation, RBAC, visibility, invite lifecycle, CSV tests; e2e (iPhone + desktop) incl. axe; HIG audit #1; CI + deploy workflows
- [x] **Phase 2 Events**: event CRUD + audience rules; RSVP with capacity/waitlist in one locked transaction (concurrency-tested); event detail with viewer/event time zones; month + agenda calendar; per-member secret iCal feed + single-event .ics; attendee management + CSV export; pull-to-refresh; happy-path e2e (invite → profile → event → RSVP → iCal) on iPhone + desktop; HIG audit 2
- [ ] Phase 3 Race board + comms
- [ ] Phase 4 Strava
- [ ] Phase 5 Insight + polish
- [ ] Delivery (repo private, Vercel project, domain, prod e2e, HANDOVER)

## Blocked on the owner
- Neon database URLs (owner + `achelon_app` password), Resend API key + verified sender domain, Strava client id/secret, DNS record for `achelon.khaw.cc`, GitHub repo visibility (currently public; make private).
