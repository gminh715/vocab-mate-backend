-- Record provenance for cached answer options as well as their parent question.
ALTER TABLE "question_options"
ADD COLUMN "generation_source" "question_generation_source" NOT NULL DEFAULT 'ADMIN';

UPDATE "question_options" AS option
SET "generation_source" = question."generation_source"
FROM "quiz_questions" AS question
WHERE question."id" = option."quiz_question_id";

-- Only one active AI cache entry may win for a term context, target CEFR and
-- requested question type. The application handles a concurrent loser by
-- loading this winning row instead of creating duplicate options.
CREATE UNIQUE INDEX "uq_quiz_questions_ai_cache"
ON "quiz_questions"(
  "article_sentence_term_id",
  "difficulty_cefr",
  "question_type"
)
WHERE "quiz_id" IS NULL
  AND "is_active" = true
  AND "generation_source" = 'AI';
