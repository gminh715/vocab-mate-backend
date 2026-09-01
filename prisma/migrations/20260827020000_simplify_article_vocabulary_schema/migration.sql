-- Articles use the provider external identifier as their only import
-- deduplication key. Audit ownership remains enforced at the application
-- boundary and is no longer stored on article content rows.
ALTER TABLE "articles" DROP CONSTRAINT "fk_articles_created_by";
ALTER TABLE "articles" DROP CONSTRAINT "fk_articles_updated_by";
ALTER TABLE "articles" DROP CONSTRAINT "ck_articles_content_hash_sha256";
DROP INDEX "idx_articles_created_by";
DROP INDEX "uq_articles_import_source_external_id";
DROP INDEX "uq_articles_canonical_url";
DROP INDEX "uq_articles_content_hash";
ALTER TABLE "articles"
  DROP COLUMN "import_source",
  DROP COLUMN "canonical_url",
  DROP COLUMN "content_hash",
  DROP COLUMN "created_by_user_id",
  DROP COLUMN "updated_by_user_id";
CREATE UNIQUE INDEX "uq_articles_external_id"
  ON "articles"("external_id")
  WHERE "external_id" IS NOT NULL;

-- Sentence rows retain only reader-facing sentence data and lifecycle fields.
ALTER TABLE "article_sentences" DROP CONSTRAINT "fk_article_sentences_created_by";
ALTER TABLE "article_sentences" DROP CONSTRAINT "fk_article_sentences_updated_by";
ALTER TABLE "article_sentences"
  DROP COLUMN "created_by_user_id",
  DROP COLUMN "updated_by_user_id",
  DROP COLUMN "explanation_vi",
  DROP COLUMN "reference_explanation",
  DROP COLUMN "skill";

-- Contextual terms use value and lemma as their authoritative display and
-- lexical identity fields.
ALTER TABLE "article_sentence_terms" DROP CONSTRAINT "fk_article_sentence_terms_created_by";
ALTER TABLE "article_sentence_terms" DROP CONSTRAINT "fk_article_sentence_terms_updated_by";
ALTER TABLE "article_sentence_terms" DROP CONSTRAINT "ck_article_sentence_terms_word_display_not_blank";
ALTER TABLE "article_sentence_terms" DROP CONSTRAINT "ck_article_sentence_terms_normalized_lemma_not_blank";
DROP INDEX "idx_article_sentence_terms_normalized_lemma";
DROP INDEX "uq_article_sentence_terms_value";
ALTER TABLE "article_sentence_terms"
  DROP COLUMN "unit_type",
  DROP COLUMN "word_display",
  DROP COLUMN "normalized_lemma",
  DROP COLUMN "vocabulary_topic",
  DROP COLUMN "created_by_user_id",
  DROP COLUMN "updated_by_user_id",
  DROP COLUMN "selection_reason",
  DROP COLUMN "explanation_generated_at",
  DROP COLUMN "skill";
DROP TYPE "lexical_unit_type";
CREATE UNIQUE INDEX "uq_article_sentence_terms_value"
  ON "article_sentence_terms"(
    "sentence_id",
    LOWER(BTRIM("value")),
    "part_of_speech"
  );

-- Reading completion is represented by completed_at; API status is derived
-- from that timestamp.
ALTER TABLE "user_article_progress" DROP CONSTRAINT "ck_user_article_progress_status";
DROP INDEX "idx_user_article_progress_user_status";
ALTER TABLE "user_article_progress"
  DROP COLUMN "created_at",
  DROP COLUMN "status",
  DROP COLUMN "last_block_key";
CREATE INDEX "idx_user_article_progress_user_last_read"
  ON "user_article_progress"("user_id", "last_read_at" DESC);

-- Preserve the reusable vocabulary snapshot without copying its source
-- article sentence, translation, or contextual explanation.
ALTER TABLE "user_vocabularies" ADD COLUMN "definition_en" TEXT;
UPDATE "user_vocabularies" AS vocabulary
SET "definition_en" = term."definition_en"
FROM "article_sentence_terms" AS term
WHERE term."id" = vocabulary."article_sentence_term_id";
ALTER TABLE "user_vocabularies" DROP CONSTRAINT "ck_user_vocabularies_context_not_blank";
ALTER TABLE "user_vocabularies" DROP CONSTRAINT "ck_user_vocabularies_context_translation_not_blank";
ALTER TABLE "user_vocabularies"
  DROP COLUMN "saved_context_sentence",
  DROP COLUMN "saved_context_translation_vi",
  DROP COLUMN "saved_explanation";
