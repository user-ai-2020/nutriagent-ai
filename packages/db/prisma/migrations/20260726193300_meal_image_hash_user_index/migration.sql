-- Composite index for per-user content-hash lookups (dedup scoped by user, not global)
CREATE INDEX "meal_images_user_id_content_hash_idx" ON "meal_images"("user_id", "content_hash");
