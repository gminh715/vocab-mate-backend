ALTER TABLE "user_profiles"
ADD COLUMN "daily_study_minutes" SMALLINT;

ALTER TABLE "user_profiles"
ADD CONSTRAINT "ck_user_profiles_daily_study_minutes"
CHECK (
  "daily_study_minutes" IS NULL
  OR "daily_study_minutes" IN (5, 10, 15)
);
