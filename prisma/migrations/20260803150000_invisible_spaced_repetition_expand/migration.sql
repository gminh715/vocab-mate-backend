-- Expand the review schema without removing legacy columns. Enum changes live
-- in the preceding migration because PostgreSQL requires a commit before new
-- enum values may be referenced. The cleanup migration removes redundant
-- columns only after every row is linked to a review_session_item.

ALTER TABLE "user_vocabularies"
ADD COLUMN "consecutive_correct_reviews" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "lapse_count" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "last_review_score" SMALLINT;

ALTER TABLE "user_vocabularies"
ADD CONSTRAINT "ck_user_vocabularies_consecutive_correct_reviews_non_negative"
CHECK ("consecutive_correct_reviews" >= 0),
ADD CONSTRAINT "ck_user_vocabularies_lapse_count_non_negative"
CHECK ("lapse_count" >= 0),
ADD CONSTRAINT "ck_user_vocabularies_last_review_score"
CHECK ("last_review_score" IS NULL OR "last_review_score" BETWEEN 0 AND 5);

DROP INDEX "idx_user_vocabularies_due_review";
CREATE INDEX "idx_user_vocabularies_due_review"
ON "user_vocabularies"("user_id", "lapse_count" DESC, "next_review_at")
WHERE "learning_status" IN ('NEW', 'LEARNING', 'REVIEWING');

ALTER TABLE "quiz_questions"
ADD COLUMN "article_sentence_term_id" UUID,
ADD COLUMN "generation_source" "question_generation_source" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN "difficulty_cefr" "cefr_level";

UPDATE "quiz_questions"
SET "article_sentence_term_id" = "article_vocabulary_id";

UPDATE "quiz_questions" AS question
SET "difficulty_cefr" = COALESCE(term."cefr_level", article."cefr_level")
FROM "article_sentence_terms" AS term
JOIN "article_sentences" AS sentence ON sentence."id" = term."sentence_id"
JOIN "articles" AS article ON article."id" = sentence."article_id"
WHERE question."article_vocabulary_id" = term."id";

ALTER TABLE "quiz_questions"
ALTER COLUMN "article_sentence_term_id" SET NOT NULL,
ALTER COLUMN "difficulty_cefr" SET NOT NULL,
ALTER COLUMN "quiz_id" DROP NOT NULL,
ALTER COLUMN "created_by_user_id" DROP NOT NULL,
ALTER COLUMN "updated_by_user_id" DROP NOT NULL;

ALTER TABLE "quiz_questions"
ADD CONSTRAINT "fk_quiz_questions_article_sentence_term"
FOREIGN KEY ("article_sentence_term_id") REFERENCES "article_sentence_terms"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION,
ADD CONSTRAINT "ck_quiz_questions_admin_provenance" CHECK (
  "generation_source" <> 'ADMIN'
  OR (
    "quiz_id" IS NOT NULL
    AND "created_by_user_id" IS NOT NULL
    AND "updated_by_user_id" IS NOT NULL
  )
);

CREATE INDEX "idx_quiz_questions_sentence_term"
ON "quiz_questions"("article_sentence_term_id");
CREATE INDEX "idx_quiz_questions_cached"
ON "quiz_questions"(
  "article_sentence_term_id",
  "generation_source",
  "difficulty_cefr",
  "question_type"
)
WHERE "quiz_id" IS NULL AND "is_active" = true;

ALTER TABLE "review_sessions" ADD COLUMN "collection_id" UUID;
ALTER TABLE "review_sessions"
ADD CONSTRAINT "fk_review_sessions_collection"
FOREIGN KEY ("collection_id") REFERENCES "vocabulary_collections"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "review_sessions"
DROP CONSTRAINT "ck_review_sessions_quiz_requirement";
ALTER TABLE "review_sessions"
ADD CONSTRAINT "ck_review_sessions_scope_requirement" CHECK (
  ("session_type" = 'QUIZ' AND "quiz_id" IS NOT NULL
    AND "article_id" IS NOT NULL AND "collection_id" IS NULL)
  OR ("session_type" = 'DAILY_REVIEW' AND "quiz_id" IS NULL
    AND "article_id" IS NULL AND "collection_id" IS NULL)
  OR ("session_type" = 'ARTICLE_REVIEW' AND "quiz_id" IS NULL
    AND "article_id" IS NOT NULL AND "collection_id" IS NULL)
  OR ("session_type" = 'COLLECTION_REVIEW' AND "quiz_id" IS NULL
    AND "article_id" IS NULL AND "collection_id" IS NOT NULL)
);

CREATE INDEX "idx_review_sessions_collection"
ON "review_sessions"("collection_id") WHERE "collection_id" IS NOT NULL;
CREATE INDEX "idx_review_sessions_active"
ON "review_sessions"("user_id", "status", "session_type")
WHERE "status" = 'IN_PROGRESS';
CREATE UNIQUE INDEX "uq_review_sessions_active_daily"
ON "review_sessions"("user_id")
WHERE "status" = 'IN_PROGRESS' AND "session_type" = 'DAILY_REVIEW';
CREATE UNIQUE INDEX "uq_review_sessions_active_quiz"
ON "review_sessions"("user_id", "quiz_id")
WHERE "status" = 'IN_PROGRESS' AND "session_type" = 'QUIZ';
CREATE UNIQUE INDEX "uq_review_sessions_active_article"
ON "review_sessions"("user_id", "article_id")
WHERE "status" = 'IN_PROGRESS' AND "session_type" = 'ARTICLE_REVIEW';
CREATE UNIQUE INDEX "uq_review_sessions_active_collection"
ON "review_sessions"("user_id", "collection_id")
WHERE "status" = 'IN_PROGRESS' AND "session_type" = 'COLLECTION_REVIEW';

CREATE TABLE "review_session_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "review_session_id" UUID NOT NULL,
  "user_vocabulary_id" UUID,
  "quiz_question_id" UUID NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "status" "review_session_item_status" NOT NULL DEFAULT 'PENDING',
  "retry_count" SMALLINT NOT NULL DEFAULT 0,
  "final_inferred_score" SMALLINT,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_session_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_review_session_items_sequence"
    UNIQUE ("review_session_id", "sequence_number"),
  CONSTRAINT "uq_review_session_items_question"
    UNIQUE ("review_session_id", "quiz_question_id"),
  CONSTRAINT "fk_review_session_items_session"
    FOREIGN KEY ("review_session_id") REFERENCES "review_sessions"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_review_session_items_user_vocabulary"
    FOREIGN KEY ("user_vocabulary_id") REFERENCES "user_vocabularies"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_review_session_items_quiz_question"
    FOREIGN KEY ("quiz_question_id") REFERENCES "quiz_questions"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_review_session_items_sequence_positive"
    CHECK ("sequence_number" > 0),
  CONSTRAINT "ck_review_session_items_retry_count_non_negative"
    CHECK ("retry_count" >= 0),
  CONSTRAINT "ck_review_session_items_final_inferred_score"
    CHECK ("final_inferred_score" IS NULL OR "final_inferred_score" BETWEEN 0 AND 5),
  CONSTRAINT "ck_review_session_items_status_time" CHECK (
    ("status" = 'PENDING' AND "completed_at" IS NULL)
    OR ("status" IN ('COMPLETED', 'SKIPPED') AND "completed_at" IS NOT NULL)
  )
);

INSERT INTO "review_session_items" (
  "review_session_id",
  "user_vocabulary_id",
  "quiz_question_id",
  "sequence_number",
  "status",
  "retry_count",
  "final_inferred_score",
  "completed_at",
  "created_at",
  "updated_at"
)
SELECT
  session."id",
  COALESCE(answer."user_vocabulary_id", vocabulary."id"),
  question."id",
  question."display_order",
  CASE
    WHEN answer."id" IS NOT NULL THEN 'COMPLETED'::"review_session_item_status"
    WHEN session."status" = 'ABANDONED' THEN 'SKIPPED'::"review_session_item_status"
    ELSE 'PENDING'::"review_session_item_status"
  END,
  GREATEST(COALESCE(answer."attempt_number", 1) - 1, 0)::SMALLINT,
  CASE
    WHEN answer."is_correct" = true THEN 5::SMALLINT
    WHEN answer."is_correct" = false THEN 0::SMALLINT
    ELSE NULL
  END,
  CASE
    WHEN answer."id" IS NOT NULL THEN answer."answered_at"
    WHEN session."status" = 'ABANDONED' THEN session."updated_at"
    ELSE NULL
  END,
  session."created_at",
  CURRENT_TIMESTAMP
FROM "review_sessions" AS session
JOIN "quiz_questions" AS question
  ON question."quiz_id" = session."quiz_id"
LEFT JOIN LATERAL (
  SELECT legacy_answer.*
  FROM "review_answers" AS legacy_answer
  WHERE legacy_answer."review_session_id" = session."id"
    AND legacy_answer."quiz_question_id" = question."id"
  ORDER BY legacy_answer."attempt_number" DESC,
    legacy_answer."answered_at" DESC,
    legacy_answer."id" ASC
  LIMIT 1
) AS answer ON true
LEFT JOIN "user_vocabularies" AS vocabulary
  ON vocabulary."user_id" = session."user_id"
  AND vocabulary."article_sentence_term_id" = question."article_vocabulary_id"
WHERE question."is_active" = true OR answer."id" IS NOT NULL;

CREATE INDEX "idx_review_session_items_active"
ON "review_session_items"("review_session_id", "status", "sequence_number")
WHERE "status" = 'PENDING';
CREATE INDEX "idx_review_session_items_vocabulary_history"
ON "review_session_items"("user_vocabulary_id", "created_at" DESC)
WHERE "user_vocabulary_id" IS NOT NULL;

CREATE TRIGGER "trg_review_session_items_set_updated_at"
BEFORE UPDATE ON "review_session_items"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

ALTER TABLE "review_answers"
ADD COLUMN "review_session_item_id" UUID,
ADD COLUMN "hints_used" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "inferred_review_score" SMALLINT;

UPDATE "review_answers" AS answer
SET "review_session_item_id" = item."id",
    "inferred_review_score" = CASE
      WHEN answer."is_correct" = true THEN 5::SMALLINT
      WHEN answer."is_correct" = false THEN 0::SMALLINT
      ELSE NULL
    END
FROM "review_session_items" AS item
WHERE item."review_session_id" = answer."review_session_id"
  AND item."quiz_question_id" = answer."quiz_question_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "review_answers" WHERE "review_session_item_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill every review answer to a review session item';
  END IF;
END
$$;

ALTER TABLE "review_answers"
ALTER COLUMN "review_session_item_id" SET NOT NULL,
ADD CONSTRAINT "fk_review_answers_session_item"
FOREIGN KEY ("review_session_item_id") REFERENCES "review_session_items"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION,
ADD CONSTRAINT "ck_review_answers_hints_used_non_negative"
CHECK ("hints_used" >= 0),
ADD CONSTRAINT "ck_review_answers_inferred_review_score"
CHECK ("inferred_review_score" IS NULL OR "inferred_review_score" BETWEEN 0 AND 5);

CREATE INDEX "idx_review_answers_item_history"
ON "review_answers"("review_session_item_id", "answered_at" DESC);
