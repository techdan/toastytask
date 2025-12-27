CREATE TABLE "note_row_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_row_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"active_version_id" integer,
	"created_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color_hex" text DEFAULT '#6b7280' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"default_priority" text DEFAULT 'medium' NOT NULL,
	"default_bucket" text DEFAULT 'todo' NOT NULL,
	"default_due_date" text DEFAULT 'today' NOT NULL,
	"heat_decay_half_life_todo" integer DEFAULT 48 NOT NULL,
	"heat_decay_half_life_watch" integer DEFAULT 168 NOT NULL,
	"heat_decay_half_life_later" integer DEFAULT 720 NOT NULL,
	"activity_normalization_constant" integer DEFAULT 20 NOT NULL,
	"new_task_heat_boost" real DEFAULT 0.7 NOT NULL,
	"new_task_heat_half_life" integer DEFAULT 24 NOT NULL,
	"escalation_threshold" real DEFAULT 0.75 NOT NULL,
	"de_escalation_threshold_todo_watch" real DEFAULT 0.25 NOT NULL,
	"de_escalation_threshold_watch_later" real DEFAULT 0.15 NOT NULL,
	"retirement_threshold" real DEFAULT 0.05 NOT NULL,
	"retirement_days" integer DEFAULT 90 NOT NULL,
	"review_cadence_watch" integer DEFAULT 7 NOT NULL,
	"review_cadence_later" integer DEFAULT 30 NOT NULL,
	"grouping_mode" text DEFAULT 'ungrouped' NOT NULL,
	"sort_mode" text DEFAULT 'heat' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"project_id" integer,
	"user_id" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"star_level" integer DEFAULT 0 NOT NULL,
	"star_intent_version" bigint DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"bucket" text DEFAULT 'todo' NOT NULL,
	"repeat_type" text DEFAULT 'none' NOT NULL,
	"repeat_rule" text,
	"heat" real DEFAULT 0.5 NOT NULL,
	"heat_calculated_at" timestamp with time zone,
	"heat_adjustment" real DEFAULT 0 NOT NULL,
	"last_heat_touched_at" timestamp with time zone,
	"last_touched_at" timestamp with time zone,
	"touch_count" integer DEFAULT 0 NOT NULL,
	"importance_v1" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"is_focused" boolean DEFAULT false NOT NULL,
	"focus_snooze_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT (NOW() AT TIME ZONE 'UTC') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_row_versions" ADD CONSTRAINT "note_row_versions_note_row_id_note_rows_id_fk" FOREIGN KEY ("note_row_id") REFERENCES "public"."note_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_rows" ADD CONSTRAINT "note_rows_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_rows_task_id_ordinal_idx" ON "note_rows" USING btree ("task_id","ordinal");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_sort_order_idx" ON "projects" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "settings_user_id_idx" ON "settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_deleted_at_idx" ON "tasks" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_project_id_deleted_at_idx" ON "tasks" USING btree ("project_id","deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_bucket_heat_idx" ON "tasks" USING btree ("bucket","heat");--> statement-breakpoint
CREATE INDEX "tasks_due_at_idx" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "tasks_active_importance_idx" ON "tasks" USING btree ("deleted_at","importance_v1");--> statement-breakpoint
CREATE INDEX "tasks_heat_sort_idx" ON "tasks" USING btree ("heat","completed_at");--> statement-breakpoint
CREATE INDEX "tasks_is_focused_idx" ON "tasks" USING btree ("is_focused");