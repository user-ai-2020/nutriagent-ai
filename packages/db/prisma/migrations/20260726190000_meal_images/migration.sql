-- CreateTable
CREATE TABLE "meal_images" (
    "id" TEXT NOT NULL,
    "meal_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "recognized_at" TIMESTAMP(3),
    "vision_model_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_images_meal_id_idx" ON "meal_images"("meal_id");

-- CreateIndex
CREATE INDEX "meal_images_content_hash_idx" ON "meal_images"("content_hash");

-- AddForeignKey
ALTER TABLE "meal_images" ADD CONSTRAINT "meal_images_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("meal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_images" ADD CONSTRAINT "meal_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
