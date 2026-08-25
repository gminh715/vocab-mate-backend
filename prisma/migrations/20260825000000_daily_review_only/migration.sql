-- Remove source-specific review sessions and sessions backed by retired
-- admin-authored quiz questions before narrowing the schema to Daily Review.
CREATE TEMPORARY TABLE "retired_review_sessions" AS
SELECT DISTINCT session."id"
FROM "review_sessions" session
LEFT JOIN "review_session_items" item
  ON item."review_session_id" = session."id"
LEFT JOIN "quiz_questions" question
  ON question."id" = item."quiz_question_id"
WHERE session."session_type" <> 'DAILY_REVIEW'
   OR question."quiz_id" IS NOT NULL
   OR question."generation_source" <> 'AI';

DELETE FROM "review_agent_decisions"
WHERE "review_session_id" IN (SELECT "id" FROM "retired_review_sessions");

DELETE FROM "review_answers"
WHERE "review_session_item_id" IN (
  SELECT item."id"
  FROM "review_session_items" item
  WHERE item."review_session_id" IN (
    SELECT "id" FROM "retired_review_sessions"
  )
);

DELETE FROM "review_session_items"
WHERE "review_session_id" IN (SELECT "id" FROM "retired_review_sessions");

DELETE FROM "review_sessions"
WHERE "id" IN (SELECT "id" FROM "retired_review_sessions");

DROP TABLE "retired_review_sessions";

DROP INDEX IF EXISTS "uq_review_sessions_active_quiz";
DROP INDEX IF EXISTS "uq_review_sessions_active_article";
DROP INDEX IF EXISTS "uq_review_sessions_active_collection";
DROP INDEX IF EXISTS "idx_review_sessions_quiz";
DROP INDEX IF EXISTS "idx_review_sessions_collection";
DROP INDEX IF EXISTS "idx_review_sessions_active";
DROP INDEX IF EXISTS "uq_review_sessions_active_daily";

ALTER TABLE "review_sessions"
DROP CONSTRAINT IF EXISTS "ck_review_sessions_scope_requirement",
DROP CONSTRAINT IF EXISTS "fk_review_sessions_quiz",
DROP CONSTRAINT IF EXISTS "fk_review_sessions_article",
DROP CONSTRAINT IF EXISTS "fk_review_sessions_collection",
DROP COLUMN "session_type",
DROP COLUMN "quiz_id",
DROP COLUMN "article_id",
DROP COLUMN "collection_id";

CREATE UNIQUE INDEX "uq_review_sessions_active_daily"
ON "review_sessions"("user_id")
WHERE "status" = 'IN_PROGRESS';

CREATE INDEX "idx_review_sessions_active"
ON "review_sessions"("user_id", "status")
WHERE "status" = 'IN_PROGRESS';

DROP TYPE "review_session_type";

-- Retain only AI-generated questions used by Daily Review.
DELETE FROM "quiz_questions"
WHERE "quiz_id" IS NOT NULL OR "generation_source" <> 'AI';

DROP INDEX IF EXISTS "uq_quiz_questions_display_order";
DROP INDEX IF EXISTS "uq_quiz_questions_ai_cache";
DROP INDEX IF EXISTS "idx_quiz_questions_sentence_term";
DROP INDEX IF EXISTS "idx_quiz_questions_cached";

ALTER TABLE "quiz_questions"
DROP CONSTRAINT IF EXISTS "fk_quiz_questions_quiz",
DROP CONSTRAINT IF EXISTS "fk_quiz_questions_created_by",
DROP CONSTRAINT IF EXISTS "fk_quiz_questions_updated_by",
DROP CONSTRAINT IF EXISTS "ck_quiz_questions_admin_provenance",
DROP COLUMN "quiz_id",
DROP COLUMN "created_by_user_id",
DROP COLUMN "updated_by_user_id";

DROP TABLE "quizzes";
DROP TYPE "quiz_status";

ALTER TABLE "quiz_questions"
ALTER COLUMN "generation_source" DROP DEFAULT,
ALTER COLUMN "generation_source" TYPE TEXT
  USING "generation_source"::TEXT;

ALTER TABLE "question_options"
ALTER COLUMN "generation_source" DROP DEFAULT,
ALTER COLUMN "generation_source" TYPE TEXT
  USING "generation_source"::TEXT;

DROP TYPE "question_generation_source";
CREATE TYPE "review_question_generation_source" AS ENUM ('AI');

ALTER TABLE "quiz_questions"
ALTER COLUMN "generation_source" TYPE "review_question_generation_source"
  USING "generation_source"::"review_question_generation_source",
ALTER COLUMN "generation_source" SET DEFAULT 'AI';

ALTER TABLE "question_options"
ALTER COLUMN "generation_source" TYPE "review_question_generation_source"
  USING "generation_source"::"review_question_generation_source",
ALTER COLUMN "generation_source" SET DEFAULT 'AI';

ALTER TABLE "quiz_questions" RENAME TO "review_questions";
ALTER TABLE "question_options" RENAME TO "review_question_options";
ALTER TABLE "review_question_options"
RENAME COLUMN "quiz_question_id" TO "review_question_id";
ALTER TABLE "review_session_items"
RENAME COLUMN "quiz_question_id" TO "review_question_id";
ALTER TABLE "review_answers"
RENAME COLUMN "quiz_question_id" TO "review_question_id";

ALTER TABLE "review_questions"
RENAME CONSTRAINT "quiz_questions_pkey" TO "review_questions_pkey";
ALTER TABLE "review_questions"
RENAME CONSTRAINT "fk_quiz_questions_article_sentence_term" TO "fk_review_questions_article_sentence_term";
ALTER TABLE "review_questions"
RENAME CONSTRAINT "ck_quiz_questions_prompt_not_blank" TO "ck_review_questions_prompt_not_blank";
ALTER TABLE "review_questions"
RENAME CONSTRAINT "ck_quiz_questions_points_positive" TO "ck_review_questions_points_positive";
ALTER TABLE "review_questions"
RENAME CONSTRAINT "ck_quiz_questions_display_order_positive" TO "ck_review_questions_display_order_positive";
ALTER TABLE "review_questions"
RENAME CONSTRAINT "ck_quiz_questions_fill_blank_fields" TO "ck_review_questions_fill_blank_fields";

ALTER TABLE "review_question_options"
RENAME CONSTRAINT "question_options_pkey" TO "review_question_options_pkey";
ALTER TABLE "review_question_options"
RENAME CONSTRAINT "fk_question_options_question" TO "fk_review_question_options_question";
ALTER TABLE "review_question_options"
RENAME CONSTRAINT "ck_question_options_text_not_blank" TO "ck_review_question_options_text_not_blank";
ALTER TABLE "review_question_options"
RENAME CONSTRAINT "ck_question_options_display_order_positive" TO "ck_review_question_options_display_order_positive";

ALTER INDEX "uq_question_options_display_order"
RENAME TO "uq_review_question_options_display_order";
ALTER INDEX "idx_question_options_question_correct"
RENAME TO "idx_review_question_options_question_correct";

ALTER TABLE "review_session_items"
RENAME CONSTRAINT "fk_review_session_items_quiz_question" TO "fk_review_session_items_review_question";
ALTER TABLE "review_answers"
RENAME CONSTRAINT "fk_review_answers_quiz_question" TO "fk_review_answers_review_question";
ALTER INDEX "idx_review_answers_quiz_question"
RENAME TO "idx_review_answers_review_question";

ALTER TRIGGER "trg_quiz_questions_set_updated_at" ON "review_questions"
RENAME TO "trg_review_questions_set_updated_at";
ALTER TRIGGER "trg_question_options_set_updated_at" ON "review_question_options"
RENAME TO "trg_review_question_options_set_updated_at";

CREATE UNIQUE INDEX "uq_review_questions_ai_cache"
ON "review_questions"(
  "article_sentence_term_id",
  "difficulty_cefr",
  "question_type",
  "generation_version"
)
WHERE "is_active" = TRUE AND "generation_source" = 'AI';

CREATE INDEX "idx_review_questions_sentence_term"
ON "review_questions"("article_sentence_term_id");

CREATE INDEX "idx_review_questions_cached"
ON "review_questions"(
  "article_sentence_term_id",
  "generation_source",
  "difficulty_cefr",
  "question_type",
  "generation_version"
)
WHERE "is_active" = TRUE;
