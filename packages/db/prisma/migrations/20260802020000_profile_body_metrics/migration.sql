-- Body-composition inputs needed to derive BMI, BMR (Mifflin-St Jeor), TDEE and
-- goal-adjusted calorie/protein targets. Weight/height/age already existed; sex is
-- required by the BMR equation, activity_level selects the FAO/WHO PAL multiplier,
-- and fitness_goal decides the calorie delta (cut / maintain / lean gain).
-- All nullable: existing profiles keep working, the UI just can't compute targets
-- until they're filled in.

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN "sex" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "activity_level" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN "fitness_goal" TEXT;
