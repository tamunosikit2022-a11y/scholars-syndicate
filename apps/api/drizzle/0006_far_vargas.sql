CREATE TABLE "blocked_identities" (
	"google_sub_hash" text PRIMARY KEY NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_deletion_requested_at_idx" ON "users" USING btree ("deletion_requested_at");