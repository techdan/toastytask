CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color_hex` text DEFAULT '#6b7280' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`default_priority` text DEFAULT 'medium' NOT NULL,
	`default_bucket` text DEFAULT 'todo' NOT NULL,
	`default_due_date` text DEFAULT 'today' NOT NULL,
	`heat_decay_half_life_todo` integer DEFAULT 48 NOT NULL,
	`heat_decay_half_life_watch` integer DEFAULT 168 NOT NULL,
	`heat_decay_half_life_later` integer DEFAULT 720 NOT NULL,
	`activity_normalization_constant` integer DEFAULT 20 NOT NULL,
	`new_task_heat_boost` real DEFAULT 0.7 NOT NULL,
	`new_task_heat_half_life` integer DEFAULT 24 NOT NULL,
	`escalation_threshold` real DEFAULT 0.75 NOT NULL,
	`de_escalation_threshold_todo_watch` real DEFAULT 0.25 NOT NULL,
	`de_escalation_threshold_watch_later` real DEFAULT 0.15 NOT NULL,
	`retirement_threshold` real DEFAULT 0.05 NOT NULL,
	`retirement_days` integer DEFAULT 90 NOT NULL,
	`review_cadence_watch` integer DEFAULT 7 NOT NULL,
	`review_cadence_later` integer DEFAULT 30 NOT NULL,
	`snooze_todo_days` integer DEFAULT 1 NOT NULL,
	`snooze_watch_days` integer DEFAULT 7 NOT NULL,
	`snooze_later_days` integer DEFAULT 30 NOT NULL,
	`grouping_mode` text DEFAULT 'ungrouped' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`project_id` integer,
	`priority` text DEFAULT 'medium' NOT NULL,
	`star` integer DEFAULT false NOT NULL,
	`due_at` integer,
	`bucket` text DEFAULT 'todo' NOT NULL,
	`heat` real DEFAULT 0 NOT NULL,
	`touch_count` integer DEFAULT 0 NOT NULL,
	`last_touched_at` integer,
	`next_surface_at` integer,
	`importance_v1` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
