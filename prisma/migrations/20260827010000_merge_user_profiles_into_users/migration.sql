-- Move the 1:1 profile attributes onto their owning user account. Columns are
-- added nullable first so existing profile data can be copied without losing
-- rows, then tightened to the same invariants as the former profile table.
ALTER TABLE "users"
ADD COLUMN "display_name" TEXT,
ADD COLUMN "avatar_url" TEXT,
ADD COLUMN "current_cefr_level" "cefr_level",
ADD COLUMN "learning_goal" TEXT,
ADD COLUMN "daily_study_minutes" SMALLINT,
ADD COLUMN "preferred_language" VARCHAR(20) NOT NULL DEFAULT 'vi';

-- Keep the original account timestamp unless the profile was changed later.
-- The trigger is temporarily disabled so this backfill does not stamp every
-- account with the migration time.
ALTER TABLE "users" DISABLE TRIGGER "trg_users_set_updated_at";

UPDATE "users" AS "user"
SET
    "display_name" = COALESCE("profile"."display_name", SPLIT_PART("user"."email"::TEXT, '@', 1)),
    "avatar_url" = "profile"."avatar_url",
    "current_cefr_level" = COALESCE("profile"."current_cefr_level", 'A1'::"cefr_level"),
    "learning_goal" = "profile"."learning_goal",
    "daily_study_minutes" = "profile"."daily_study_minutes",
    "preferred_language" = COALESCE("profile"."preferred_language", 'vi'),
    "updated_at" = GREATEST("user"."updated_at", COALESCE("profile"."updated_at", "user"."updated_at"))
FROM "user_profiles" AS "profile"
WHERE "profile"."user_id" = "user"."id";

-- A profile-less historical account still receives the safe account-level
-- defaults needed by the new non-null User fields.
UPDATE "users"
SET
    "display_name" = COALESCE("display_name", SPLIT_PART("email"::TEXT, '@', 1)),
    "current_cefr_level" = COALESCE("current_cefr_level", 'A1'::"cefr_level")
WHERE "display_name" IS NULL OR "current_cefr_level" IS NULL;

ALTER TABLE "users" ENABLE TRIGGER "trg_users_set_updated_at";

ALTER TABLE "users"
ALTER COLUMN "display_name" SET NOT NULL,
ALTER COLUMN "current_cefr_level" SET NOT NULL;

ALTER TABLE "users"
ADD CONSTRAINT "ck_users_display_name_not_blank" CHECK (BTRIM("display_name") <> ''),
ADD CONSTRAINT "ck_users_preferred_language_not_blank" CHECK (BTRIM("preferred_language") <> ''),
ADD CONSTRAINT "ck_users_daily_study_minutes" CHECK (
    "daily_study_minutes" IS NULL OR "daily_study_minutes" IN (5, 10, 15)
);

DROP TABLE "user_profiles";
