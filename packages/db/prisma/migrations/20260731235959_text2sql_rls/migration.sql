-- Create role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'text2sql_user') THEN
    CREATE ROLE text2sql_user NOLOGIN;
  END IF;
END
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO text2sql_user;
GRANT SELECT ON meals, meal_items, chat_history, user_profiles, nutrition_values TO text2sql_user;

-- Enable RLS (owner 'nutriagent' will bypass this by default)
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_values ENABLE ROW LEVEL SECURITY;

-- Create policies scoped to app.current_user_id
CREATE POLICY text2sql_policy ON meals FOR SELECT TO text2sql_user USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY text2sql_policy ON chat_history FOR SELECT TO text2sql_user USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY text2sql_policy ON user_profiles FOR SELECT TO text2sql_user USING (user_id = nullif(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY text2sql_policy ON meal_items FOR SELECT TO text2sql_user USING (meal_id IN (SELECT meal_id FROM meals WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::integer));

CREATE POLICY text2sql_policy ON nutrition_values FOR SELECT TO text2sql_user USING (item_id IN (SELECT item_id FROM meal_items WHERE meal_id IN (SELECT meal_id FROM meals WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::integer)));
