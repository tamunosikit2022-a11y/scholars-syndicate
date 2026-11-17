CREATE TABLE "question_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_title" text NOT NULL,
	"rights" text NOT NULL,
	"rights_evidence" text,
	"imported_by" uuid,
	"rights_cleared_by" uuid,
	"rights_cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_packs_rights_valid" CHECK ("question_packs"."rights" in ('owned', 'permission_granted', 'licensed', 'public_domain', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_revisions_question_version_unique" UNIQUE("question_id","version")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"reference_id" text NOT NULL,
	"exam" text NOT NULL,
	"origin" text NOT NULL,
	"year" smallint,
	"subject" text NOT NULL,
	"topic" text,
	"stem" text NOT NULL,
	"options" jsonb NOT NULL,
	"answer" text NOT NULL,
	"explanation" text NOT NULL,
	"difficulty" smallint DEFAULT 3 NOT NULL,
	"source_page" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_pack_reference_unique" UNIQUE("pack_id","reference_id"),
	CONSTRAINT "questions_exam_valid" CHECK ("questions"."exam" in ('jamb', 'waec', 'neco', 'post_utme')),
	CONSTRAINT "questions_origin_valid" CHECK ("questions"."origin" in ('past_question', 'teacher_authored', 'generated_from_pdf')),
	CONSTRAINT "questions_status_valid" CHECK ("questions"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "questions_difficulty_range" CHECK ("questions"."difficulty" between 1 and 5),
	CONSTRAINT "questions_version_positive" CHECK ("questions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "question_packs" ADD CONSTRAINT "question_packs_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_packs" ADD CONSTRAINT "question_packs_rights_cleared_by_users_id_fk" FOREIGN KEY ("rights_cleared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_pack_id_question_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."question_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status","created_at");