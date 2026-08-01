-- AlterTable
ALTER TABLE "meals" ADD COLUMN     "meal_type" TEXT NOT NULL DEFAULT 'snack';

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "daily_steps_goal" INTEGER NOT NULL DEFAULT 8000,
ADD COLUMN     "today_steps" INTEGER NOT NULL DEFAULT 0;
