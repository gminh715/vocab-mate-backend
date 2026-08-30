-- Migration: add_tutor_fsrs_schema
-- Adds dailyStudyMinutes to users, FSRS fields to user_vocabularies,
-- and creates TutorSession / TutorSessionItem tables.
--
-- Safety notes:
--   * All new columns on existing tables use DEFAULT so no row is left NULL-invalid.
--   * Existing user_vocabularies rows are backfilled to fsrs_state = 'NEW',
--     numeric FSRS fields to 0/null, review timestamps to null.
--   * No data is destroyed; review tables were already removed in the previous migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New enums
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "fsrs_card_state" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');
CREATE TYPE "tutor_session_status" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');
CREATE TYPE "tutor_session_item_status" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED');
CREATE TYPE "tutor_question_type" AS ENUM ('MULTIPLE_CHOICE', 'CONTEXTUAL_CLOZE', 'TYPED_RECALL', 'MICRO_LESSON_RETEST');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend users: dailyStudyMinutes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN "daily_study_minutes" INTEGER NOT NULL DEFAULT 10,
  ALTER COLUMN "current_cefr_level" DROP NOT NULL;

ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_daily_study_minutes"
    CHECK ("daily_study_minutes" IN (5, 10, 15, 20));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extend user_vocabularies: FSRS card fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "user_vocabularies"
  ADD COLUMN "fsrs_state"          "fsrs_card_state" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "fsrs_stability"      DOUBLE PRECISION,
  ADD COLUMN "fsrs_difficulty"     DOUBLE PRECISION,
  ADD COLUMN "fsrs_scheduled_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fsrs_learning_steps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "review_count"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lapse_count"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_reviewed_at"    TIMESTAMPTZ(6),
  ADD COLUMN "next_review_at"      TIMESTAMPTZ(6);

-- Backfill existing rows: all vocabulary is new (state already set by DEFAULT).
-- Numeric FSRS fields are already 0/null by column defaults above.
-- No further backfill needed; rows are valid for FSRS as NEW cards.

-- Index for candidate selection queries
CREATE INDEX "idx_user_vocabularies_fsrs_candidate"
  ON "user_vocabularies" ("user_id", "fsrs_state", "next_review_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Create tutor_sessions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "tutor_sessions" (
  "id"                       UUID        NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                  UUID        NOT NULL,
  "study_date"               DATE        NOT NULL,
  "status"                   "tutor_session_status" NOT NULL DEFAULT 'ACTIVE',
  "target_duration_minutes"  INTEGER     NOT NULL,
  "target_activity_count"    INTEGER     NOT NULL,
  "new_word_target"          INTEGER     NOT NULL,
  "started_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "completed_at"             TIMESTAMPTZ(6),
  "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pk_tutor_sessions" PRIMARY KEY ("id")
);

ALTER TABLE "tutor_sessions"
  ADD CONSTRAINT "fk_tutor_sessions_user"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

-- One session per user per study day (deterministic date in Asia/Ho_Chi_Minh computed by service)
CREATE UNIQUE INDEX "uq_tutor_sessions_user_study_date"
  ON "tutor_sessions" ("user_id", "study_date");

-- Index for resume / readiness queries
CREATE INDEX "idx_tutor_sessions_user_status_date"
  ON "tutor_sessions" ("user_id", "status", "study_date");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Create tutor_session_items
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "tutor_session_items" (
  "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  "session_id"         UUID        NOT NULL,
  "user_vocabulary_id" UUID,                    -- nullable: SetNull when vocabulary deleted
  "position"           INTEGER     NOT NULL,
  "status"             "tutor_session_item_status" NOT NULL DEFAULT 'PENDING',
  "question_type"      "tutor_question_type" NOT NULL,
  "is_new_word"        BOOLEAN     NOT NULL,
  "question_payload"   JSONB       NOT NULL,    -- public prompt data, no correct answer
  "grading_spec"       JSONB       NOT NULL,    -- private canonical answer, never sent before ANSWERED
  "user_answer"        JSONB,
  "is_correct"         BOOLEAN,
  "hint_used"          BOOLEAN     NOT NULL DEFAULT FALSE,
  "response_time_ms"   INTEGER,
  "fsrs_rating"        SMALLINT,
  "feedback_vi"        TEXT,
  "generated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "answered_at"        TIMESTAMPTZ(6),

  CONSTRAINT "pk_tutor_session_items" PRIMARY KEY ("id"),
  CONSTRAINT "ck_tutor_session_items_fsrs_rating"
    CHECK ("fsrs_rating" IS NULL OR "fsrs_rating" BETWEEN 1 AND 4),
  CONSTRAINT "ck_tutor_session_items_response_time_ms"
    CHECK ("response_time_ms" IS NULL OR "response_time_ms" >= 0)
);

ALTER TABLE "tutor_session_items"
  ADD CONSTRAINT "fk_tutor_session_items_session"
    FOREIGN KEY ("session_id") REFERENCES "tutor_sessions" ("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "tutor_session_items"
  ADD CONSTRAINT "fk_tutor_session_items_vocabulary"
    FOREIGN KEY ("user_vocabulary_id") REFERENCES "user_vocabularies" ("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

-- Each position within a session is unique
CREATE UNIQUE INDEX "uq_tutor_session_items_session_position"
  ON "tutor_session_items" ("session_id", "position");

-- At most one PENDING item per session (partial unique index)
CREATE UNIQUE INDEX "uq_tutor_session_items_one_pending"
  ON "tutor_session_items" ("session_id")
  WHERE "status" = 'PENDING';

-- Lookup index for session + status queries
CREATE INDEX "idx_tutor_session_items_session_status"
  ON "tutor_session_items" ("session_id", "status");
