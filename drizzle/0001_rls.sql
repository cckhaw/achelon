-- Row-Level Security and cross-tenant integrity. Hand-written (see docs/DATA-MODEL.md).
-- The app connects as `achelon_app` (not the table owner), so these policies apply to every tenant request.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "memberships" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "member_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "member_profiles" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "field_visibility" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "field_visibility" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invites" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "applications" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "events" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "event_invitees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_invitees" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "event_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_signups" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "race_declarations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "race_declarations" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "announcements" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "event_recaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_recaps" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "calendar_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "calendar_tokens" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "notification_preferences" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_log" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "strava_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "strava_connections" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "event_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "event_results" USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_self ON "tenants" USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id());--> statement-breakpoint
-- A tenant can read a user row only if that user has a membership in the current tenant. Writes to users are owner-only (no grant).
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY users_visible_in_tenant ON "users" FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.tenant_id = app_tenant_id())
);--> statement-breakpoint

-- FK checks bypass RLS, so a row could otherwise point at another tenant's parent. This trigger re-reads the parent
-- (through RLS for the app role) and rejects a missing or foreign parent.
CREATE OR REPLACE FUNCTION enforce_same_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  fk_val uuid;
  parent_tenant uuid;
BEGIN
  fk_val := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF fk_val IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', TG_ARGV[1]) INTO parent_tenant USING fk_val;
  IF parent_tenant IS NULL OR parent_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'cross-tenant reference rejected (%.% -> %)', TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1] USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER memberships_invited_by_membership_id_same_tenant BEFORE INSERT OR UPDATE OF invited_by_membership_id, tenant_id ON "memberships" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('invited_by_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER member_profiles_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "member_profiles" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER field_visibility_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "field_visibility" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER invites_created_by_membership_id_same_tenant BEFORE INSERT OR UPDATE OF created_by_membership_id, tenant_id ON "invites" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('created_by_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER invites_sponsor_membership_id_same_tenant BEFORE INSERT OR UPDATE OF sponsor_membership_id, tenant_id ON "invites" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('sponsor_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER applications_sponsor_membership_id_same_tenant BEFORE INSERT OR UPDATE OF sponsor_membership_id, tenant_id ON "applications" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('sponsor_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER events_created_by_membership_id_same_tenant BEFORE INSERT OR UPDATE OF created_by_membership_id, tenant_id ON "events" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('created_by_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER event_invitees_event_id_same_tenant BEFORE INSERT OR UPDATE OF event_id, tenant_id ON "event_invitees" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('event_id', 'events');--> statement-breakpoint
CREATE TRIGGER event_invitees_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "event_invitees" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER event_signups_event_id_same_tenant BEFORE INSERT OR UPDATE OF event_id, tenant_id ON "event_signups" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('event_id', 'events');--> statement-breakpoint
CREATE TRIGGER event_signups_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "event_signups" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER race_declarations_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "race_declarations" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER race_declarations_external_event_id_same_tenant BEFORE INSERT OR UPDATE OF external_event_id, tenant_id ON "race_declarations" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('external_event_id', 'events');--> statement-breakpoint
CREATE TRIGGER announcements_author_membership_id_same_tenant BEFORE INSERT OR UPDATE OF author_membership_id, tenant_id ON "announcements" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('author_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER event_recaps_event_id_same_tenant BEFORE INSERT OR UPDATE OF event_id, tenant_id ON "event_recaps" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('event_id', 'events');--> statement-breakpoint
CREATE TRIGGER event_recaps_author_membership_id_same_tenant BEFORE INSERT OR UPDATE OF author_membership_id, tenant_id ON "event_recaps" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('author_membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER calendar_tokens_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "calendar_tokens" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER notification_preferences_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "notification_preferences" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER strava_connections_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "strava_connections" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
CREATE TRIGGER event_results_event_id_same_tenant BEFORE INSERT OR UPDATE OF event_id, tenant_id ON "event_results" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('event_id', 'events');--> statement-breakpoint
CREATE TRIGGER event_results_membership_id_same_tenant BEFORE INSERT OR UPDATE OF membership_id, tenant_id ON "event_results" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('membership_id', 'memberships');--> statement-breakpoint
