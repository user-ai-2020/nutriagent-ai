/** Allowed tables/columns exposed to the Text2SQL LLM (not the full DB). */
export const TEXT2SQL_SCHEMA_DESCRIPTION = `
PostgreSQL schema (read-only SELECT queries):

meals (
  meal_id INT PRIMARY KEY,
  user_id INT,
  meal_datetime TIMESTAMP,
  meal_type TEXT,  -- breakfast | lunch | dinner | snack
  source TEXT,
  image_url TEXT,
  created_at TIMESTAMP
)

meal_items (
  item_id INT PRIMARY KEY,
  meal_id INT REFERENCES meals(meal_id),
  food_type TEXT,
  estimated_quantity TEXT,
  vision_confidence FLOAT,
  created_at TIMESTAMP
)

nutrition_values (
  value_id INT PRIMARY KEY,
  item_id INT REFERENCES meal_items(item_id),
  calories FLOAT,
  protein FLOAT,
  fat FLOAT,
  carbs FLOAT,
  sugar FLOAT,
  created_at TIMESTAMP
)

meal_images (
  id TEXT PRIMARY KEY,
  meal_id INT REFERENCES meals(meal_id),
  user_id INT,
  storage_key TEXT,
  width INT,
  height INT,
  file_size_bytes INT,
  content_hash TEXT,
  captured_at TIMESTAMP,
  recognized_at TIMESTAMP,
  vision_model_version TEXT,
  created_at TIMESTAMP
)

user_profiles (
  profile_id INT PRIMARY KEY,
  user_id INT,
  diet_type TEXT,
  weight FLOAT,
  height FLOAT,
  age INT,
  daily_steps_goal INT,
  today_steps INT,
  created_at TIMESTAMP
)

daily_steps (
  id INT PRIMARY KEY,
  user_id INT,
  date DATE,
  steps INT,
  source TEXT,
  created_at TIMESTAMP
)

Join paths:
  meal_items.meal_id = meals.meal_id
  nutrition_values.item_id = meal_items.item_id
  meal_images.meal_id = meals.meal_id

Rules for generated SQL:
- SELECT only (no INSERT/UPDATE/DELETE/DROP/ALTER)
- Do NOT filter by user_id — it is injected automatically after generation
- Use PostgreSQL syntax
- Include LIMIT (max 500)
- When querying meal_items or nutrition_values, JOIN meals
`.trim();

export const ALLOWED_TABLES = new Set([
  "meals",
  "meal_items",
  "nutrition_values",
  "meal_images",
  "user_profiles",
  "daily_steps",
]);

/** Tables that carry user_id and receive an automatic scope filter. */
export const USER_SCOPED_TABLES = new Set([
  "meals",
  "meal_images",
  "user_profiles",
  "daily_steps",
]);

/** Child tables that require meals in the query for user scoping. */
export const MEALS_REQUIRED_TABLES = new Set(["meal_items", "nutrition_values"]);

export const TEXT2SQL_MAX_ROWS = Number(process.env.TEXT2SQL_MAX_ROWS || 500);
export const TEXT2SQL_TIMEOUT_MS = Number(process.env.TEXT2SQL_TIMEOUT_MS || 5000);
