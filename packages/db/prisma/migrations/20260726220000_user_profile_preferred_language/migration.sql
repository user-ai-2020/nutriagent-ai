-- Task 6.0: persist user language preference on profile (he | en)
ALTER TABLE "user_profiles" ADD COLUMN "preferred_language" TEXT;
