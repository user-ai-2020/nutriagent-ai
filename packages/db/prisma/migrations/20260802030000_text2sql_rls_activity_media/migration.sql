-- Text2SQL could never read the activity.* and media.* tables.
--
-- 20260731235959_text2sql_rls granted text2sql_user USAGE on schema `public`
-- and SELECT on five public tables — but ALLOWED_TABLES and the schema
-- description handed to the LLM also advertise activity.daily_steps,
-- activity.exercise_logs, media.meal_images and media.exercise_images. SQL
-- against those passed validation and then died at execution with
-- "permission denied for schema activity", because the restricted role has no
-- USAGE there. Any steps, exercise or meal-photo question was unanswerable.
--
-- Grants + RLS mirror the public tables exactly: SELECT only, scoped to
-- app.current_user_id, which executeSQL sets per transaction.

GRANT USAGE ON SCHEMA activity TO text2sql_user;
GRANT USAGE ON SCHEMA media TO text2sql_user;

GRANT SELECT ON activity.daily_steps, activity.exercise_logs TO text2sql_user;
GRANT SELECT ON media.meal_images, media.exercise_images TO text2sql_user;

ALTER TABLE activity.daily_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.meal_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE media.exercise_images ENABLE ROW LEVEL SECURITY;

-- All four carry user_id directly, so no join-through policy is needed.
-- DROP first so re-running against a partially-migrated database is safe.
DROP POLICY IF EXISTS text2sql_policy ON activity.daily_steps;
CREATE POLICY text2sql_policy ON activity.daily_steps FOR SELECT TO text2sql_user
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);

DROP POLICY IF EXISTS text2sql_policy ON activity.exercise_logs;
CREATE POLICY text2sql_policy ON activity.exercise_logs FOR SELECT TO text2sql_user
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);

DROP POLICY IF EXISTS text2sql_policy ON media.meal_images;
CREATE POLICY text2sql_policy ON media.meal_images FOR SELECT TO text2sql_user
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);

DROP POLICY IF EXISTS text2sql_policy ON media.exercise_images;
CREATE POLICY text2sql_policy ON media.exercise_images FOR SELECT TO text2sql_user
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);
