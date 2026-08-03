-- Contract cleanup after review_session_items and renamed term references have
-- been backfilled by the preceding expansion migration.
DROP INDEX "idx_quiz_questions_vocabulary";
ALTER TABLE "quiz_questions"
DROP CONSTRAINT "fk_quiz_questions_article_vocabulary";
ALTER TABLE "quiz_questions" DROP COLUMN "article_vocabulary_id";

DROP INDEX "idx_review_answers_session_answered";
DROP INDEX "idx_review_answers_vocabulary_answered";
DROP INDEX "idx_review_answers_user_vocabulary";
DROP INDEX "idx_review_answers_quiz_dashboard";

ALTER TABLE "review_answers"
DROP CONSTRAINT "ck_review_answers_item_shape",
DROP CONSTRAINT "fk_review_answers_session",
DROP CONSTRAINT "fk_review_answers_article_vocabulary",
DROP CONSTRAINT "fk_review_answers_user_vocabulary";

ALTER TABLE "review_answers"
DROP COLUMN "review_session_id",
DROP COLUMN "article_vocabulary_id",
DROP COLUMN "user_vocabulary_id",
DROP COLUMN "item_type";

DROP TYPE "review_item_type";

ALTER TABLE "review_answers"
ALTER COLUMN "quiz_question_id" SET NOT NULL;

ALTER TABLE "review_answers"
ADD CONSTRAINT "ck_review_answers_item_shape" CHECK (
  "is_correct" IS NOT NULL
  AND (
    "selected_option_id" IS NOT NULL
    OR (
      "user_answer_text" IS NOT NULL
      AND BTRIM("user_answer_text") <> ''
    )
  )
);

CREATE INDEX "idx_review_answers_quiz_question"
ON "review_answers"("quiz_question_id");
