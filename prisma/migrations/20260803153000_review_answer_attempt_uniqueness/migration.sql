CREATE UNIQUE INDEX "uq_review_answers_item_attempt"
ON "review_answers" ("review_session_item_id", "attempt_number");
