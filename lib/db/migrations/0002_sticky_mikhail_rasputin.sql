CREATE INDEX `note_rows_task_id_ordinal_idx` ON `note_rows` (`task_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `tasks_project_id_deleted_at_idx` ON `tasks` (`project_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `tasks_bucket_heat_idx` ON `tasks` (`bucket`,`heat`);