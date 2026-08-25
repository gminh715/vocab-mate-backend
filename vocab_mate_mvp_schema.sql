-- Current Vocab Mate database structure generated from the Prisma schema.
-- Committed migrations remain authoritative for PostgreSQL CHECK constraints,
-- expression indexes, updated_at triggers, and production data transitions.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

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
CREATE TYPE "learning_status" AS ENUM ('NEW', 'LEARNING', 'REVIEWING', 'MASTERED', 'IGNORED');

-- CreateEnum
CREATE TYPE "reading_status" AS ENUM ('READING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "lexical_unit_type" AS ENUM ('WORD', 'PHRASE');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('SELECT_MEANING', 'SELECT_WORD', 'SELECT_CORRECT_CONTEXT', 'FILL_BLANK');

-- CreateEnum
CREATE TYPE "review_question_generation_source" AS ENUM ('AI');

-- CreateEnum
CREATE TYPE "review_session_item_status" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "review_session_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "review_goal" AS ENUM ('BALANCED', 'RECALL', 'SPELLING', 'CONTEXT');

-- CreateEnum
CREATE TYPE "review_skill_dimension" AS ENUM ('RECOGNITION', 'RECALL', 'SPELLING', 'CONTEXT', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "review_error_type" AS ENUM ('LOW_RECALL', 'MEANING_CONFUSION', 'CONFUSABLE_WORD', 'SPELLING_ERROR', 'WORD_FORM_ERROR', 'COLLOCATION_ERROR', 'CONTEXT_MISUNDERSTANDING', 'CARELESS_ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "review_agent_action" AS ENUM ('CONTINUE', 'REQUEUE_WITH_NEW_TYPE', 'TEACH_AND_REQUEUE', 'FLAG_FOR_FUTURE_FOCUS');

-- CreateEnum
CREATE TYPE "review_decision_kind" AS ENUM ('SESSION_PLAN', 'ANSWER_INTERVENTION', 'SESSION_SUMMARY');

-- CreateEnum
CREATE TYPE "review_decision_source" AS ENUM ('AI', 'RULE');

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
    "import_source" TEXT,
    "external_id" TEXT,
    "canonical_url" TEXT,
    "content_hash" CHAR(64),
    "source_published_at" TIMESTAMPTZ(6),
    "ai_analysis_status" "ai_generation_status",
    "ai_analysis_error" TEXT,
    "cefr_level" "cefr_level" NOT NULL,
    "status" "article_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
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
    "explanation_vi" TEXT,
    "reference_explanation" TEXT,
    "skill" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_sentences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_sentence_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sentence_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "word_display" TEXT,
    "lemma" TEXT NOT NULL,
    "normalized_lemma" CITEXT,
    "unit_type" "lexical_unit_type" NOT NULL DEFAULT 'WORD',
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
    "vocabulary_topic" TEXT,
    "examples" JSONB NOT NULL DEFAULT '[]',
    "skill" TEXT,
    "origin" "term_origin" NOT NULL DEFAULT 'MANUAL',
    "review_status" "term_review_status" NOT NULL DEFAULT 'APPROVED',
    "selection_reason" TEXT,
    "explanation_status" "ai_generation_status" NOT NULL DEFAULT 'READY',
    "explanation_error" TEXT,
    "explanation_generated_at" TIMESTAMPTZ(6),
    "is_lookup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
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
    "description" TEXT,
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
    "status" "reading_status" NOT NULL DEFAULT 'READING',
    "first_opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "last_block_key" TEXT,
    "progress_percent" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_article_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_sentence_term_id" UUID NOT NULL,
    "question_type" "question_type" NOT NULL,
    "generation_source" "review_question_generation_source" NOT NULL DEFAULT 'AI',
    "generation_version" VARCHAR(50),
    "difficulty_cefr" "cefr_level" NOT NULL,
    "prompt" TEXT NOT NULL,
    "blank_sentence" TEXT,
    "correct_answer_text" TEXT,
    "answer_explanation" TEXT,
    "is_case_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 1,
    "display_order" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_question_id" UUID NOT NULL,
    "option_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "generation_source" "review_question_generation_source" NOT NULL DEFAULT 'AI',
    "explanation" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "review_session_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "target_duration_minutes" SMALLINT,
    "review_goal" "review_goal",
    "planned_item_count" SMALLINT,
    "plan_summary" TEXT,
    "ai_call_count" SMALLINT NOT NULL DEFAULT 0,
    "ai_diagnosis_call_count" SMALLINT NOT NULL DEFAULT 0,
    "agent_version" VARCHAR(50),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_session_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_session_id" UUID NOT NULL,
    "user_vocabulary_id" UUID,
    "review_question_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "status" "review_session_item_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "final_inferred_score" SMALLINT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_session_item_id" UUID NOT NULL,
    "review_question_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "user_answer_text" TEXT,
    "is_correct" BOOLEAN,
    "response_time_ms" INTEGER,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "hints_used" SMALLINT NOT NULL DEFAULT 0,
    "inferred_review_score" SMALLINT,
    "skill_dimension" "review_skill_dimension",
    "error_type" "review_error_type",
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_agent_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_session_id" UUID NOT NULL,
    "review_session_item_id" UUID,
    "review_answer_id" UUID,
    "kind" "review_decision_kind" NOT NULL,
    "source" "review_decision_source" NOT NULL,
    "action" "review_agent_action",
    "skill_dimension" "review_skill_dimension",
    "error_type" "review_error_type",
    "confidence" DOUBLE PRECISION,
    "reason_code" VARCHAR(80) NOT NULL,
    "state_snapshot" JSONB NOT NULL,
    "decision_payload" JSONB NOT NULL,
    "provider" VARCHAR(30),
    "model" VARCHAR(100),
    "prompt_version" VARCHAR(50) NOT NULL,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_agent_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
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
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "current_cefr_level" "cefr_level" NOT NULL,
    "learning_goal" TEXT,
    "daily_study_minutes" SMALLINT,
    "preferred_language" VARCHAR(20) NOT NULL DEFAULT 'vi',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_vocabularies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "article_sentence_term_id" UUID NOT NULL,
    "learning_status" "learning_status" NOT NULL DEFAULT 'NEW',
    "personal_note" TEXT,
    "saved_word_display" TEXT NOT NULL,
    "saved_lemma" TEXT NOT NULL,
    "saved_part_of_speech" TEXT NOT NULL,
    "saved_ipa" TEXT,
    "saved_cefr_level" "cefr_level" NOT NULL,
    "saved_context_sentence" TEXT NOT NULL,
    "saved_context_translation_vi" TEXT NOT NULL,
    "saved_meaning_vi" TEXT NOT NULL,
    "saved_explanation" TEXT,
    "saved_examples" JSONB NOT NULL DEFAULT '[]',
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_reviewed_at" TIMESTAMPTZ(6),
    "next_review_at" TIMESTAMPTZ(6),
    "review_interval_days" INTEGER,
    "consecutive_correct_reviews" SMALLINT NOT NULL DEFAULT 0,
    "lapse_count" SMALLINT NOT NULL DEFAULT 0,
    "last_review_score" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_slug" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "idx_articles_published_filters" ON "articles"("category_id", "cefr_level", "published_at" DESC) WHERE (status = 'PUBLISHED');

-- CreateIndex
CREATE INDEX "idx_articles_created_by" ON "articles"("created_by_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_import_source_external_id" ON "articles"("import_source", "external_id") WHERE (import_source IS NOT NULL AND external_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_canonical_url" ON "articles"("canonical_url") WHERE (canonical_url IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_content_hash" ON "articles"("content_hash") WHERE (content_hash IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_article_sentences_article_active_order" ON "article_sentences"("article_id", "content_version", "is_active", "sentence_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_sentences_order" ON "article_sentences"("article_id", "content_version", "sentence_order");

-- CreateIndex
CREATE INDEX "idx_article_sentence_terms_cefr_active" ON "article_sentence_terms"("cefr_level", "is_active", "is_lookup_enabled");

-- CreateIndex
CREATE INDEX "idx_article_sentence_terms_sentence_lookup" ON "article_sentence_terms"("sentence_id", "is_lookup_enabled", "is_active");

-- CreateIndex
CREATE INDEX "idx_article_sentence_terms_normalized_lemma" ON "article_sentence_terms"("normalized_lemma", "part_of_speech");

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
CREATE INDEX "idx_user_article_progress_user_status" ON "user_article_progress"("user_id", "status", "last_read_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_article_progress_user_article" ON "user_article_progress"("user_id", "article_id");

-- CreateIndex
CREATE INDEX "idx_review_questions_sentence_term" ON "review_questions"("article_sentence_term_id");

-- CreateIndex
CREATE INDEX "idx_review_questions_cached" ON "review_questions"("article_sentence_term_id", "generation_source", "difficulty_cefr", "question_type", "generation_version") WHERE (is_active = true);

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_questions_ai_cache" ON "review_questions"("article_sentence_term_id", "difficulty_cefr", "question_type", "generation_version") WHERE (is_active = true AND generation_source = 'AI');

-- CreateIndex
CREATE INDEX "idx_review_question_options_question_correct" ON "review_question_options"("review_question_id", "is_correct");

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_question_options_display_order" ON "review_question_options"("review_question_id", "display_order");

-- CreateIndex
CREATE INDEX "idx_review_sessions_user_started" ON "review_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_review_sessions_active" ON "review_sessions"("user_id", "status") WHERE (status = 'IN_PROGRESS');

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_sessions_active_daily" ON "review_sessions"("user_id") WHERE (status = 'IN_PROGRESS');

-- CreateIndex
CREATE INDEX "idx_review_session_items_active" ON "review_session_items"("review_session_id", "status", "sequence_number") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "idx_review_session_items_vocabulary_history" ON "review_session_items"("user_vocabulary_id", "created_at" DESC) WHERE (user_vocabulary_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_session_items_sequence" ON "review_session_items"("review_session_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_session_items_question" ON "review_session_items"("review_session_id", "review_question_id");

-- CreateIndex
CREATE INDEX "idx_review_answers_item_history" ON "review_answers"("review_session_item_id", "answered_at" DESC);

-- CreateIndex
CREATE INDEX "idx_review_answers_review_question" ON "review_answers"("review_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_review_answers_item_attempt" ON "review_answers"("review_session_item_id", "attempt_number");

-- CreateIndex
CREATE INDEX "idx_agent_decisions_session_kind" ON "review_agent_decisions"("review_session_id", "kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_agent_decisions_item" ON "review_agent_decisions"("review_session_item_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_agent_decision_answer_kind" ON "review_agent_decisions"("review_answer_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_refresh_sessions_token_hash" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uq_refresh_sessions_replaced_by" ON "refresh_sessions"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "idx_refresh_sessions_user_revoked" ON "refresh_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "idx_user_vocabularies_user_status_saved" ON "user_vocabularies"("user_id", "learning_status", "saved_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_vocabularies_due_review" ON "user_vocabularies"("user_id", "lapse_count" DESC, "next_review_at") WHERE (learning_status IN ('NEW', 'LEARNING', 'REVIEWING'));

-- CreateIndex
CREATE INDEX "idx_user_vocabularies_sentence_term" ON "user_vocabularies"("article_sentence_term_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_vocabularies_user_sentence_term" ON "user_vocabularies"("user_id", "article_sentence_term_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentences" ADD CONSTRAINT "fk_article_sentences_article" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentences" ADD CONSTRAINT "fk_article_sentences_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentences" ADD CONSTRAINT "fk_article_sentences_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "fk_article_sentence_terms_sentence" FOREIGN KEY ("sentence_id") REFERENCES "article_sentences"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "fk_article_sentence_terms_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "fk_article_sentence_terms_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

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
ALTER TABLE "review_questions" ADD CONSTRAINT "fk_review_questions_article_sentence_term" FOREIGN KEY ("article_sentence_term_id") REFERENCES "article_sentence_terms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_question_options" ADD CONSTRAINT "fk_review_question_options_question" FOREIGN KEY ("review_question_id") REFERENCES "review_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "fk_review_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_session_items" ADD CONSTRAINT "fk_review_session_items_session" FOREIGN KEY ("review_session_id") REFERENCES "review_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_session_items" ADD CONSTRAINT "fk_review_session_items_user_vocabulary" FOREIGN KEY ("user_vocabulary_id") REFERENCES "user_vocabularies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_session_items" ADD CONSTRAINT "fk_review_session_items_review_question" FOREIGN KEY ("review_question_id") REFERENCES "review_questions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_answers" ADD CONSTRAINT "fk_review_answers_session_item" FOREIGN KEY ("review_session_item_id") REFERENCES "review_session_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_answers" ADD CONSTRAINT "fk_review_answers_review_question" FOREIGN KEY ("review_question_id") REFERENCES "review_questions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_answers" ADD CONSTRAINT "fk_review_answers_selected_option" FOREIGN KEY ("selected_option_id") REFERENCES "review_question_options"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_agent_decisions" ADD CONSTRAINT "fk_review_agent_decisions_session" FOREIGN KEY ("review_session_id") REFERENCES "review_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_agent_decisions" ADD CONSTRAINT "fk_review_agent_decisions_item" FOREIGN KEY ("review_session_item_id") REFERENCES "review_session_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_agent_decisions" ADD CONSTRAINT "fk_review_agent_decisions_answer" FOREIGN KEY ("review_answer_id") REFERENCES "review_answers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "fk_refresh_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "fk_refresh_sessions_replaced_by" FOREIGN KEY ("replaced_by_session_id") REFERENCES "refresh_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "fk_user_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "fk_user_vocabularies_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_vocabularies" ADD CONSTRAINT "fk_user_vocabularies_article_sentence_term" FOREIGN KEY ("article_sentence_term_id") REFERENCES "article_sentence_terms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
