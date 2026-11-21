CREATE TABLE "staff_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_actions_action_valid" CHECK ("staff_actions"."action" in ('pack.import', 'pack.rights', 'question.edit', 'question.approve', 'question.reject')),
	CONSTRAINT "staff_actions_target_type_valid" CHECK ("staff_actions"."target_type" in ('pack', 'question'))
);
--> statement-breakpoint
ALTER TABLE "staff_actions" ADD CONSTRAINT "staff_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_actions_created_at_idx" ON "staff_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "staff_actions_target_idx" ON "staff_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "staff_actions_actor_idx" ON "staff_actions" USING btree ("actor_id");