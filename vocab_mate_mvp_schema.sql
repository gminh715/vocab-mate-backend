-- Proposed target Vocab Mate PostgreSQL schema snapshot.
-- Incorporates the split Prisma models and migrations through
-- 20260828000000_remove_review_feature. This file is a fresh-schema definition, not
-- an in-place migration for an existing database.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required by UUID defaults and case-insensitive text columns.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "cefr_level" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "article_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ai_generation_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "term_origin" AS ENUM ('MANUAL', 'AI', 'NLP');

-- CreateEnum
CREATE TYPE "term_review_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "reading_status" AS ENUM ('READING', 'COMPLETED');

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_version" INTEGER NOT NULL DEFAULT 1,
    "source_name" TEXT,
    "source_url" TEXT,
    "author_name" TEXT,
    "thumbnail_url" TEXT,
    "external_id" TEXT,
    "source_published_at" TIMESTAMPTZ(6),
    "ai_analysis_status" "ai_generation_status",
    "ai_analysis_error" TEXT,
    "cefr_level" "cefr_level" NOT NULL,
    "status" "article_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_sentences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "content_version" INTEGER NOT NULL,
    "sentence_order" INTEGER NOT NULL,
    "sentence_text" TEXT NOT NULL,
    "translation_vi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_sentences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_sentence_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sentence_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "part_of_speech" TEXT,
    "ipa" TEXT,
    "cefr_level" "cefr_level",
    "contextual_meaning_vi" TEXT,
    "definition_en" TEXT,
    "contextual_explanation" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "antonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "related_terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "examples" JSONB NOT NULL DEFAULT '[]',
    "origin" "term_origin" NOT NULL DEFAULT 'MANUAL',
    "review_status" "term_review_status" NOT NULL DEFAULT 'APPROVED',
    "explanation_status" "ai_generation_status" NOT NULL DEFAULT 'READY',
    "explanation_error" TEXT,
    "is_lookup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_sentence_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_collection_items" (
    "collection_id" UUID NOT NULL,
    "user_vocabulary_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_vocabulary_collection_items" PRIMARY KEY ("collection_id","user_vocabulary_id")
);

-- CreateTable
CREATE TABLE "user_article_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "first_opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "progress_percent" DECIMAL(5,2),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_article_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "current_cefr_level" "cefr_level" NOT NULL,
    "learning_goal" TEXT,
    "preferred_language" VARCHAR(20) NOT NULL DEFAULT 'vi',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_session_id" UUID,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vocabularies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "article_sentence_term_id" UUID NOT NULL,
    "saved_word_display" TEXT NOT NULL,
    "saved_lemma" TEXT NOT NULL,
    "saved_part_of_speech" TEXT NOT NULL,
    "saved_ipa" TEXT,
    "saved_cefr_level" "cefr_level" NOT NULL,
    "saved_meaning_vi" TEXT NOT NULL,
    "definition_en" TEXT,
    "saved_examples" JSONB NOT NULL DEFAULT '[]',
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_slug" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "idx_articles_published_filters" ON "articles"("category_id", "cefr_level", "published_at" DESC) WHERE (status = 'PUBLISHED');

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_external_id" ON "articles"("external_id") WHERE (external_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_article_sentences_article_active_order" ON "article_sentences"("article_id", "content_version", "is_active", "sentence_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_sentences_order" ON "article_sentences"("article_id", "content_version", "sentence_order");

-- CreateIndex
CREATE INDEX "idx_article_sentence_terms_cefr_active" ON "article_sentence_terms"("cefr_level", "is_active", "is_lookup_enabled");

-- CreateIndex
CREATE INDEX "idx_article_sentence_terms_sentence_lookup" ON "article_sentence_terms"("sentence_id", "is_lookup_enabled", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_categories_slug" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "idx_categories_active_order" ON "categories"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "idx_vocabulary_collections_user" ON "vocabulary_collections"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_vocabulary_collections_user_name" ON "vocabulary_collections"("user_id", "name");

-- CreateIndex
CREATE INDEX "idx_vocabulary_collection_items_vocabulary" ON "vocabulary_collection_items"("user_vocabulary_id");

-- CreateIndex
CREATE INDEX "idx_user_article_progress_user_last_read" ON "user_article_progress"("user_id", "last_read_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_article_progress_user_article" ON "user_article_progress"("user_id", "article_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_refresh_sessions_token_hash" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uq_refresh_sessions_replaced_by" ON "refresh_sessions"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "idx_refresh_sessions_user_revoked" ON "refresh_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "idx_user_vocabularies_sentence_term" ON "user_vocabularies"("article_sentence_term_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_vocabularies_user_sentence_term" ON "user_vocabularies"("user_id", "article_sentence_term_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentences" ADD CONSTRAINT "fk_article_sentences_article" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "fk_article_sentence_terms_sentence" FOREIGN KEY ("sentence_id") REFERENCES "article_sentences"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vocabulary_collections" ADD CONSTRAINT "fk_vocabulary_collections_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vocabulary_collection_items" ADD CONSTRAINT "fk_vocabulary_collection_items_collection" FOREIGN KEY ("collection_id") REFERENCES "vocabulary_collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vocabulary_collection_items" ADD CONSTRAINT "fk_vocabulary_collection_items_user_vocabulary" FOREIGN KEY ("user_vocabulary_id") REFERENCES "user_vocabularies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_article_progress" ADD CONSTRAINT "fk_user_article_progress_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_article_progress" ADD CONSTRAINT "fk_user_article_progress_article" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "fk_refresh_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "fk_refresh_sessions_replaced_by" FOREIGN KEY ("replaced_by_session_id") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "fk_user_vocabularies_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "fk_user_vocabularies_article_sentence_term" FOREIGN KEY ("article_sentence_term_id") REFERENCES "article_sentence_terms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Prisma Schema Language cannot represent this normalized expression index.
CREATE UNIQUE INDEX "uq_article_sentence_terms_value" ON "article_sentence_terms"(
    "sentence_id",
    LOWER(BTRIM("value")),
    "part_of_speech"
);

-- Named CHECK constraints intentionally maintained outside Prisma Schema
-- Language.
ALTER TABLE "users" ADD CONSTRAINT "ck_users_email_not_blank" CHECK (BTRIM("email"::TEXT) <> '');
ALTER TABLE "users" ADD CONSTRAINT "ck_users_password_hash_not_blank" CHECK (BTRIM("password_hash") <> '');
ALTER TABLE "users" ADD CONSTRAINT "ck_users_display_name_not_blank" CHECK (BTRIM("display_name") <> '');
ALTER TABLE "users" ADD CONSTRAINT "ck_users_preferred_language_not_blank" CHECK (BTRIM("preferred_language") <> '');

ALTER TABLE "categories" ADD CONSTRAINT "ck_categories_name_not_blank" CHECK (BTRIM("name") <> '');
ALTER TABLE "categories" ADD CONSTRAINT "ck_categories_slug_not_blank" CHECK (BTRIM("slug"::TEXT) <> '');
ALTER TABLE "categories" ADD CONSTRAINT "ck_categories_display_order_non_negative" CHECK ("display_order" >= 0);

ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_title_not_blank" CHECK (BTRIM("title") <> '');
ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_slug_not_blank" CHECK (BTRIM("slug"::TEXT) <> '');
ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_summary_not_blank" CHECK (BTRIM("summary") <> '');
ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_content_not_blank" CHECK (BTRIM("content_html") <> '');
ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_content_version_positive" CHECK ("content_version" > 0);
ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_status_timestamps" CHECK (
    (
        "status" = 'DRAFT'
        AND "published_at" IS NULL
        AND "archived_at" IS NULL
    )
    OR (
        "status" = 'PUBLISHED'
        AND "published_at" IS NOT NULL
        AND "archived_at" IS NULL
    )
    OR (
        "status" = 'ARCHIVED'
        AND "archived_at" IS NOT NULL
    )
);
ALTER TABLE "article_sentences" ADD CONSTRAINT "ck_article_sentences_content_version_positive" CHECK ("content_version" > 0);
ALTER TABLE "article_sentences" ADD CONSTRAINT "ck_article_sentences_order_positive" CHECK ("sentence_order" > 0);
ALTER TABLE "article_sentences" ADD CONSTRAINT "ck_article_sentences_text_not_blank" CHECK (BTRIM("sentence_text") <> '');
ALTER TABLE "article_sentences" ADD CONSTRAINT "ck_article_sentences_translation_not_blank" CHECK (
    "translation_vi" IS NULL OR BTRIM("translation_vi") <> ''
);

ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_value_not_blank" CHECK (BTRIM("value") <> '');
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_lemma_not_blank" CHECK (BTRIM("lemma") <> '');
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_part_of_speech_not_blank" CHECK (BTRIM("part_of_speech") <> '');
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_meaning_not_blank" CHECK (BTRIM("contextual_meaning_vi") <> '');
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_examples_array" CHECK (JSONB_TYPEOF("examples") = 'array');
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_review_activation" CHECK (
    "review_status" = 'APPROVED'
    OR ("is_active" = FALSE AND "is_lookup_enabled" = FALSE)
);

ALTER TABLE "user_article_progress" ADD CONSTRAINT "ck_user_article_progress_percent" CHECK (
    "progress_percent" IS NULL
    OR ("progress_percent" >= 0 AND "progress_percent" <= 100)
);
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "ck_user_vocabularies_word_display_not_blank" CHECK (BTRIM("saved_word_display") <> '');
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "ck_user_vocabularies_lemma_not_blank" CHECK (BTRIM("saved_lemma") <> '');
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "ck_user_vocabularies_part_of_speech_not_blank" CHECK (BTRIM("saved_part_of_speech") <> '');
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "ck_user_vocabularies_meaning_not_blank" CHECK (BTRIM("saved_meaning_vi") <> '');
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "ck_user_vocabularies_examples_array" CHECK (JSONB_TYPEOF("saved_examples") = 'array');

ALTER TABLE "vocabulary_collections" ADD CONSTRAINT "ck_vocabulary_collections_name_not_blank" CHECK (BTRIM("name") <> '');

ALTER TABLE "refresh_sessions" ADD CONSTRAINT "ck_refresh_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");

-- Preserve automatic updated_at behavior that is outside Prisma Schema
-- Language. Tables without an updated_at column intentionally receive no
-- trigger.
CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."updated_at" = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_users_set_updated_at"
BEFORE UPDATE ON "users"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_categories_set_updated_at"
BEFORE UPDATE ON "categories"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_articles_set_updated_at"
BEFORE UPDATE ON "articles"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_article_sentences_set_updated_at"
BEFORE UPDATE ON "article_sentences"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_article_sentence_terms_set_updated_at"
BEFORE UPDATE ON "article_sentence_terms"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_user_article_progress_set_updated_at"
BEFORE UPDATE ON "user_article_progress"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_user_vocabularies_set_updated_at"
BEFORE UPDATE ON "user_vocabularies"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

CREATE TRIGGER "trg_vocabulary_collections_set_updated_at"
BEFORE UPDATE ON "vocabulary_collections"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
