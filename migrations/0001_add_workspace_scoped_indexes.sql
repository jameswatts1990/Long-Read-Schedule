CREATE INDEX IF NOT EXISTS "assignments_workspace_id_idx" ON "assignments" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "assignments_workspace_week_start_idx" ON "assignments" USING btree ("workspace_id", "week_start_date");
CREATE INDEX IF NOT EXISTS "assignments_workspace_person_day_week_idx" ON "assignments" USING btree ("workspace_id", "person_id", "day", "week_start_date");
CREATE INDEX IF NOT EXISTS "people_workspace_id_idx" ON "people" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "tasks_workspace_id_idx" ON "tasks" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "premade_filters_workspace_id_idx" ON "premade_filters" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_users_user_workspace_idx" ON "workspace_users" USING btree ("user_id", "workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_users_workspace_user_idx" ON "workspace_users" USING btree ("workspace_id", "user_id");
