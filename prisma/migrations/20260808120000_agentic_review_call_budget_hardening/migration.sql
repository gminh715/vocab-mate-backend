ALTER TABLE "review_sessions"
ADD COLUMN "ai_diagnosis_call_count" SMALLINT NOT NULL DEFAULT 0,
ADD CONSTRAINT "ck_review_sessions_ai_diagnosis_call_count_non_negative"
CHECK ("ai_diagnosis_call_count" >= 0);
