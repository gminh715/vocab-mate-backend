ALTER TABLE "review_session_items"
DROP CONSTRAINT "fk_review_session_items_user_vocabulary";

ALTER TABLE "review_session_items"
ADD CONSTRAINT "fk_review_session_items_user_vocabulary"
FOREIGN KEY ("user_vocabulary_id") REFERENCES "user_vocabularies"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
