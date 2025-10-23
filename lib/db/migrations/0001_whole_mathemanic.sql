ALTER TABLE "projects" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "settings_user_id_idx" ON "settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_deleted_at_idx" ON "tasks" USING btree ("user_id","deleted_at");