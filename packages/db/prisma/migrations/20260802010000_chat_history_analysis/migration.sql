-- Store the structured payload behind an assistant turn (multiModelMealAnalysis /
-- mealAnalysis / nutritionHistory). Without it, reopening a past chat from the
-- history picker could only re-render plain text plus citations — meal cards,
-- macro breakdowns and history charts were lost.

-- AlterTable
ALTER TABLE "chat_history" ADD COLUMN "analysis" JSONB;
