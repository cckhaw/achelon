ALTER TABLE "strava_connections" ADD COLUMN "share_results" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "strava_connections" ADD COLUMN "derived_level" "level";