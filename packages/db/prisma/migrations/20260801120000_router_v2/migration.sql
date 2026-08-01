-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "activity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "media";

-- DropForeignKey
ALTER TABLE "daily_steps" DROP CONSTRAINT "daily_steps_user_id_fkey";

-- DropForeignKey
ALTER TABLE "meal_images" DROP CONSTRAINT "meal_images_meal_id_fkey";

-- DropForeignKey
ALTER TABLE "meal_images" DROP CONSTRAINT "meal_images_user_id_fkey";

-- Move Tables to New Schemas
ALTER TABLE "daily_steps" SET SCHEMA "activity";
ALTER TABLE "meal_images" SET SCHEMA "media";

-- CreateTable
CREATE TABLE "activity"."exercise_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "activity_type" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "calories_burned" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_answers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cached_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_logs_user_id_timestamp_idx" ON "activity"."exercise_logs"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "cached_answers_embedding_idx" ON "cached_answers" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "activity"."daily_steps" ADD CONSTRAINT "daily_steps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media"."meal_images" ADD CONSTRAINT "meal_images_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("meal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media"."meal_images" ADD CONSTRAINT "meal_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity"."exercise_logs" ADD CONSTRAINT "exercise_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cached_answers" ADD CONSTRAINT "cached_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
