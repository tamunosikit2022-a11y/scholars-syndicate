CREATE TYPE "public"."journey_exam_type" AS ENUM('jamb', 'waec', 'neco', 'post_utme');--> statement-breakpoint
CREATE TYPE "public"."journey_quality_level" AS ENUM('high', 'standard', 'data_saver');--> statement-breakpoint
CREATE TYPE "public"."journey_study_time" AS ENUM('early_morning', 'morning', 'afternoon', 'evening', 'night');--> statement-breakpoint
CREATE TABLE "student_journey" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"state" text,
	"school_name" text,
	"exams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subjects" text[] DEFAULT '{}' NOT NULL,
	"course_interest" text,
	"university_interests" text[] DEFAULT '{}' NOT NULL,
	"daily_study_goal_minutes" smallint,
	"preferred_study_time" "journey_study_time",
	"quality_level" "journey_quality_level" DEFAULT 'high' NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_journey_state_length" CHECK ("student_journey"."state" is null or char_length("student_journey"."state") <= 50),
	CONSTRAINT "student_journey_school_name_length" CHECK ("student_journey"."school_name" is null or char_length("student_journey"."school_name") <= 160),
	CONSTRAINT "student_journey_course_interest_length" CHECK ("student_journey"."course_interest" is null or char_length("student_journey"."course_interest") <= 120),
	CONSTRAINT "student_journey_daily_goal_range" CHECK ("student_journey"."daily_study_goal_minutes" is null or "student_journey"."daily_study_goal_minutes" between 5 and 600),
	CONSTRAINT "student_journey_subject_count" CHECK (cardinality("student_journey"."subjects") <= 20),
	CONSTRAINT "student_journey_university_count" CHECK (cardinality("student_journey"."university_interests") <= 3)
);
--> statement-breakpoint
ALTER TABLE "student_journey" ADD CONSTRAINT "student_journey_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;