-- CreateEnum
CREATE TYPE "ai_generation_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "term_origin" AS ENUM ('MANUAL', 'AI');

-- CreateEnum
CREATE TYPE "term_review_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "ai_analysis_error" TEXT,
ADD COLUMN     "ai_analysis_status" "ai_generation_status",
ADD COLUMN     "canonical_url" TEXT,
ADD COLUMN     "content_hash" CHAR(64),
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "import_source" TEXT,
ADD COLUMN     "source_published_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "article_sentence_terms" ADD COLUMN     "explanation_error" TEXT,
ADD COLUMN     "explanation_generated_at" TIMESTAMPTZ(6),
ADD COLUMN     "explanation_status" "ai_generation_status" NOT NULL DEFAULT 'READY',
ADD COLUMN     "origin" "term_origin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "review_status" "term_review_status" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "selection_reason" TEXT,
ALTER COLUMN "contextual_meaning_vi" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_import_source_external_id" ON "articles"("import_source", "external_id") WHERE (import_source IS NOT NULL AND external_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_canonical_url" ON "articles"("canonical_url") WHERE (canonical_url IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_content_hash" ON "articles"("content_hash") WHERE (content_hash IS NOT NULL);

-- Enforce the canonical 64-character hexadecimal SHA-256 representation.
ALTER TABLE "articles" ADD CONSTRAINT "ck_articles_content_hash_sha256" CHECK (
    "content_hash" IS NULL
    OR BTRIM("content_hash") ~ '^[0-9A-Fa-f]{64}$'
);

-- Pending and rejected moderation candidates must stay hidden until approval.
ALTER TABLE "article_sentence_terms" ADD CONSTRAINT "ck_article_sentence_terms_review_activation" CHECK (
    "review_status" = 'APPROVED'
    OR (
        "is_active" = FALSE
        AND "is_lookup_enabled" = FALSE
    )
);
