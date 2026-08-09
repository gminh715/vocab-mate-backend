-- Keep older AI questions available to historical sessions while allowing a
-- new prompt contract to build a fresh cache alongside them.
ALTER TABLE "quiz_questions"
ADD COLUMN "generation_version" VARCHAR(50);

DROP INDEX "uq_quiz_questions_ai_cache";
DROP INDEX "idx_quiz_questions_cached";

CREATE UNIQUE INDEX "uq_quiz_questions_ai_cache"
ON "quiz_questions"(
  "article_sentence_term_id",
  "difficulty_cefr",
  "question_type",
  "generation_version"
)
WHERE "quiz_id" IS NULL
  AND "is_active" = true
  AND "generation_source" = 'AI';

CREATE INDEX "idx_quiz_questions_cached"
ON "quiz_questions"(
  "article_sentence_term_id",
  "generation_source",
  "difficulty_cefr",
  "question_type",
  "generation_version"
)
WHERE "quiz_id" IS NULL
  AND "is_active" = true;
