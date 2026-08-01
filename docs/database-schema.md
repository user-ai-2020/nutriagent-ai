# Database Schema - NutriAgent AI

> Reference ERD for the Postgres schema. Live schema and migrations: `packages/db/prisma/`.

## ERD Overview

```
Roles (1) ──< Users (N)
Users (1) ── UserProfile (1)
Users (1) ──< Meals (N)
Meals (1) ──< MealItems (N)
Meals (1) ──< MealImages (N)
MealItems (1) ── NutritionValues (1)
Users (1) ──< DailySteps (N)
Users (1) ──< ChatHistory (N)
Users (1) ──< AuditLog (N)
KnowledgeDocument (RAG vector store)
RagDocument (1) ──< RagChunk (N)
LlmSettings (Singleton)
```

## Entities

| Entity | PK | Key Fields |
|--------|-----|------------|
| roles | role_id | role_name (User/Admin) |
| users | user_id | name, email, password_hash, role_id, account_status |
| user_profiles | profile_id | user_id, diet_goals, health_restrictions, allergies, diet_type |
| daily_steps | id | user_id, date, steps, source |
| meals | meal_id | user_id, meal_datetime, source, image_url |
| meal_images | id | meal_id, user_id, storage_key, content_hash, captured_at |
| meal_items | item_id | meal_id, food_type, estimated_quantity, vision_confidence |
| nutrition_values | value_id | item_id, calories, protein, fat, carbs, sugar |
| chat_history | message_id | user_id, meal_id?, content, role, sources |
| audit_logs | log_id | user_id, action_type, details, source_ip, timestamp |
| knowledge_documents | id | title, content, category, embedding (vector) |
| llm_settings | id | open_router_api_key, chat_model, vision_model_1, rag_model |
| rag_documents | id | source_url, source_domain, title, status, raw_text_hash |
| rag_chunks | id | document_id, content, embedding (vector), tsv, chunk_index |

## Indexes

- users(email), users(role_id)
- daily_steps(user_id, date)
- meals(user_id, meal_datetime)
- meal_images(meal_id), meal_images(content_hash), meal_images(user_id, content_hash)
- chat_history(user_id, timestamp)
- audit_logs(timestamp), audit_logs(user_id), audit_logs(action_type)
- rag_documents(source_domain), rag_documents(status)
- rag_chunks(document_id)

## Audit Log Strategy

- **Postgres**: Append-only source of truth for all audit events
- **Redis**: Sorted set `audit:recent` with 48h TTL for fast admin dashboard reads
- **Fallback**: If Redis unavailable, admin panel reads directly from Postgres
