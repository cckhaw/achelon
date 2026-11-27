ALTER TABLE "invites" ADD COLUMN "prefill" jsonb;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "emailed_at" timestamp with time zone;