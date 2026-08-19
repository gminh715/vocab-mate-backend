UPDATE "review_sessions"
SET "review_goal" = 'BALANCED'
WHERE "session_type" = 'DAILY_REVIEW'
  AND "review_goal" IS NULL;
