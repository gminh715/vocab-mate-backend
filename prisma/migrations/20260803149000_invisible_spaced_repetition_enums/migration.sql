-- PostgreSQL requires enum values to be committed before they can be used by
-- later schema objects and constraints.
ALTER TYPE "review_session_type" ADD VALUE IF NOT EXISTS 'DAILY_REVIEW';
ALTER TYPE "review_session_type" ADD VALUE IF NOT EXISTS 'ARTICLE_REVIEW';
ALTER TYPE "review_session_type" ADD VALUE IF NOT EXISTS 'COLLECTION_REVIEW';

CREATE TYPE "question_generation_source" AS ENUM ('ADMIN', 'RULE_BASED', 'AI');
CREATE TYPE "review_session_item_status" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
