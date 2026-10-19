CREATE SCHEMA IF NOT EXISTS "audit";
--> statement-breakpoint
CREATE TABLE "answers" (
	"pair_id" text PRIMARY KEY NOT NULL,
	"draft_choice" integer NOT NULL,
	"version" integer NOT NULL,
	"submitted_choice" integer,
	"submitted_at" timestamp with time zone,
	"time_on_task_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"classroom_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"config" jsonb NOT NULL,
	"criteria" jsonb NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"seed" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domains" jsonb NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"classroom_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"assignment_id" text,
	"action" text NOT NULL,
	"reason" text,
	"detail" jsonb,
	"request_id" text NOT NULL,
	"ip" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"classroom_id" text NOT NULL,
	"name" text NOT NULL,
	"artifact_url" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"classroom_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"group_id" text
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"student_id" text NOT NULL,
	"value" numeric(14, 8) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"criterion_id" text NOT NULL,
	"side" text NOT NULL,
	"evaluator_id" text NOT NULL,
	"item_a_id" text NOT NULL,
	"item_b_id" text NOT NULL,
	"left_id" text NOT NULL,
	"generation" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"pair_id" text NOT NULL,
	"choice" integer NOT NULL,
	"version" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"student_id" text NOT NULL,
	"value" numeric(14, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"google_subject" text,
	"notice_accepted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_subject_unique" UNIQUE("google_subject")
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_evaluator_id_users_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_class_user" ON "members" USING btree ("classroom_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pair_once" ON "pairs" USING btree ("assignment_id","criterion_id","evaluator_id","item_a_id","item_b_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_retry" ON "submissions" USING btree ("assignment_id","user_id","key");--> statement-breakpoint
ALTER TABLE answers ADD CONSTRAINT answer_draft_choice CHECK (draft_choice BETWEEN 1 AND 6);
--> statement-breakpoint
ALTER TABLE answers ADD CONSTRAINT answer_submitted_choice CHECK (submitted_choice IS NULL OR submitted_choice BETWEEN 1 AND 6);
--> statement-breakpoint
ALTER TABLE members ADD CONSTRAINT valid_role CHECK (role IN ('OWNER','CO_TEACHER','TA','STUDENT'));
--> statement-breakpoint
ALTER TABLE pairs ADD CONSTRAINT pair_integrity CHECK (item_a_id <> item_b_id AND left_id IN (item_a_id,item_b_id) AND side IN ('GROUP','INDIVIDUAL'));
--> statement-breakpoint
CREATE INDEX assignment_classroom ON assignments(classroom_id);
--> statement-breakpoint
CREATE INDEX member_user ON members(user_id);
--> statement-breakpoint
CREATE INDEX pair_assignment_evaluator ON pairs(assignment_id,evaluator_id,generation);
--> statement-breakpoint
CREATE INDEX audit_assignment ON audit.events(assignment_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only record cannot be changed'; END; $$;
--> statement-breakpoint
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit.events FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON revisions FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER scores_immutable BEFORE UPDATE OR DELETE ON scores FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER overrides_immutable BEFORE UPDATE OR DELETE ON overrides FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
--> statement-breakpoint
CREATE FUNCTION audit.guard_final_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.snapshot IS NOT NULL AND (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.config IS DISTINCT FROM OLD.config OR NEW.criteria IS DISTINCT FROM OLD.criteria OR NEW.status <> 'FINALIZED') THEN
    RAISE EXCEPTION 'Final snapshot is immutable; use a score override';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER final_snapshot_immutable BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION audit.guard_final_snapshot();
--> statement-breakpoint
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['answers','assignments','classrooms','groups','members','overrides','pairs','revisions','scores','submissions','users'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tab);
  END LOOP;
END; $$;
