DROP TABLE IF EXISTS "review_agent_decisions";
DROP TABLE IF EXISTS "review_answers";
DROP TABLE IF EXISTS "review_session_items";
DROP TABLE IF EXISTS "review_question_options";
DROP TABLE IF EXISTS "review_questions";
DROP TABLE IF EXISTS "review_sessions";

DROP INDEX IF EXISTS "idx_user_vocabularies_due_review";
ALTER TABLE "user_vocabularies"
  DROP COLUMN IF EXISTS "learning_status",
  DROP COLUMN IF EXISTS "last_reviewed_at",
  DROP COLUMN IF EXISTS "next_review_at",
  DROP COLUMN IF EXISTS "review_interval_days",
  DROP COLUMN IF EXISTS "consecutive_correct_reviews",
  DROP COLUMN IF EXISTS "lapse_count",
  DROP COLUMN IF EXISTS "last_review_score";

DROP TYPE IF EXISTS "question_type";
DROP TYPE IF EXISTS "review_question_generation_source";
DROP TYPE IF EXISTS "review_session_item_status";
DROP TYPE IF EXISTS "review_session_status";
DROP TYPE IF EXISTS "review_goal";
DROP TYPE IF EXISTS "review_skill_dimension";
DROP TYPE IF EXISTS "review_error_type";
DROP TYPE IF EXISTS "review_agent_action";
DROP TYPE IF EXISTS "review_decision_kind";
DROP TYPE IF EXISTS "review_decision_source";
DROP TYPE IF EXISTS "learning_status";

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "ck_users_daily_study_minutes",
  DROP COLUMN IF EXISTS "daily_study_minutes";
