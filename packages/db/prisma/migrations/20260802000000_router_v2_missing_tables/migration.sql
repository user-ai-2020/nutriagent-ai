-- Router v2 follow-up: tables present in schema.prisma but never created by a
-- migration (chat_sessions, user_action_logs, local_foods, media.exercise_images)
-- plus chat_history.session_id, which the ChatSession relation requires.
-- Without these the API gateway fails with P2021 "table does not exist" on
-- /api/chat/message.

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "chat_history" ADD COLUMN "session_id" INTEGER;

-- CreateIndex
CREATE INDEX "chat_history_session_id_idx" ON "chat_history"("session_id");

-- AddForeignKey
ALTER TABLE "chat_history" ADD CONSTRAINT "chat_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "user_action_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "request_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_action_logs_user_id_idx" ON "user_action_logs"("user_id");

-- AddForeignKey
ALTER TABLE "user_action_logs" ADD CONSTRAINT "user_action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "local_foods" (
    "fdc_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "local_foods_pkey" PRIMARY KEY ("fdc_id")
);

-- CreateTable
CREATE TABLE "media"."exercise_images" (
    "id" TEXT NOT NULL,
    "exercise_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_images_exercise_id_idx" ON "media"."exercise_images"("exercise_id");

-- CreateIndex
CREATE INDEX "exercise_images_content_hash_idx" ON "media"."exercise_images"("content_hash");

-- CreateIndex
CREATE INDEX "exercise_images_user_id_content_hash_idx" ON "media"."exercise_images"("user_id", "content_hash");

-- AddForeignKey
ALTER TABLE "media"."exercise_images" ADD CONSTRAINT "exercise_images_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "activity"."exercise_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
