ALTER TABLE "invites" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER invites_event_id_same_tenant BEFORE INSERT OR UPDATE OF event_id, tenant_id ON "invites" FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('event_id', 'events');
--> statement-breakpoint
-- Malaysia (GMT+8) is the default time zone. Move communities that never chose one (unset, UTC or the old Singapore example) over.
UPDATE tenants SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{defaultTimezone}', '"Asia/Kuala_Lumpur"') WHERE coalesce(settings ->> 'defaultTimezone', 'UTC') IN ('UTC', 'Asia/Singapore');
