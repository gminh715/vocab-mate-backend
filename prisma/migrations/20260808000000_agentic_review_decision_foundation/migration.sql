CREATE TYPE "review_goal" AS ENUM ('BALANCED', 'RECALL', 'SPELLING', 'CONTEXT');
CREATE TYPE "review_skill_dimension" AS ENUM (
  'RECOGNITION',
  'RECALL',
  'SPELLING',
  'CONTEXT',
  'PRODUCTION'
);
CREATE TYPE "review_error_type" AS ENUM (
  'LOW_RECALL',
  'MEANING_CONFUSION',
  'CONFUSABLE_WORD',
  'SPELLING_ERROR',
  'WORD_FORM_ERROR',
  'COLLOCATION_ERROR',
  'CONTEXT_MISUNDERSTANDING',
  'CARELESS_ERROR',
  'UNKNOWN'
);
CREATE TYPE "review_agent_action" AS ENUM (
  'CONTINUE',
  'REQUEUE_WITH_NEW_TYPE',
  'TEACH_AND_REQUEUE',
  'FLAG_FOR_FUTURE_FOCUS'
);
CREATE TYPE "review_decision_kind" AS ENUM (
  'SESSION_PLAN',
  'ANSWER_INTERVENTION',
  'SESSION_SUMMARY'
);
CREATE TYPE "review_decision_source" AS ENUM ('AI', 'RULE');

ALTER TABLE "review_sessions"
ADD COLUMN "target_duration_minutes" SMALLINT,
ADD COLUMN "review_goal" "review_goal",
ADD COLUMN "planned_item_count" SMALLINT,
ADD COLUMN "plan_summary" TEXT,
ADD COLUMN "ai_call_count" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "agent_version" VARCHAR(50),
ADD CONSTRAINT "ck_review_sessions_target_duration" CHECK (
  "target_duration_minutes" IS NULL
  OR "target_duration_minutes" IN (5, 10, 15)
),
ADD CONSTRAINT "ck_review_sessions_planned_item_count" CHECK (
  "planned_item_count" IS NULL
  OR "planned_item_count" BETWEEN 1 AND 100
),
ADD CONSTRAINT "ck_review_sessions_ai_call_count_non_negative"
CHECK ("ai_call_count" >= 0);

ALTER TABLE "review_answers"
ADD COLUMN "skill_dimension" "review_skill_dimension",
ADD COLUMN "error_type" "review_error_type";

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

  CONSTRAINT "review_agent_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_review_agent_decisions_session"
    FOREIGN KEY ("review_session_id") REFERENCES "review_sessions"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_review_agent_decisions_item"
    FOREIGN KEY ("review_session_item_id") REFERENCES "review_session_items"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_review_agent_decisions_answer"
    FOREIGN KEY ("review_answer_id") REFERENCES "review_answers"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_review_agent_decisions_confidence" CHECK (
    "confidence" IS NULL OR "confidence" BETWEEN 0 AND 1
  ),
  CONSTRAINT "ck_review_agent_decisions_latency_non_negative" CHECK (
    "latency_ms" IS NULL OR "latency_ms" >= 0
  )
);

CREATE UNIQUE INDEX "uq_agent_decision_answer_kind"
ON "review_agent_decisions"("review_answer_id", "kind");
CREATE INDEX "idx_agent_decisions_session_kind"
ON "review_agent_decisions"("review_session_id", "kind", "created_at" DESC);
CREATE INDEX "idx_agent_decisions_item"
ON "review_agent_decisions"("review_session_item_id", "created_at" DESC);
