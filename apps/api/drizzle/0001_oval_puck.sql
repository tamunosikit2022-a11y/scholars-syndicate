CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_level" AS ENUM('jss', 'ss1', 'ss2', 'ss3', 'jamb_candidate', 'university_student', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'parent', 'teacher', 'school', 'university', 'mentor', 'staff', 'admin');--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"display_name" text,
	"date_of_birth" date,
	"level" "user_level",
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"onboarding_stage" integer DEFAULT 0 NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_display_name_length" CHECK ("users"."display_name" is null or char_length("users"."display_name") between 2 and 30),
	CONSTRAINT "users_onboarding_stage_range" CHECK ("users"."onboarding_stage" between 0 and 3),
	CONSTRAINT "users_date_of_birth_sane" CHECK ("users"."date_of_birth" is null or "users"."date_of_birth" >= date '1900-01-01')
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");