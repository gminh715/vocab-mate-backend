-- Rule-based agent decisions cannot be represented as AI decisions. Remove
-- their audit rows before narrowing the enum to the only supported source.
DELETE FROM "review_agent_decisions"
WHERE "source" = 'RULE';

ALTER TYPE "review_decision_source" RENAME TO "review_decision_source_old";
CREATE TYPE "review_decision_source" AS ENUM ('AI');

ALTER TABLE "review_agent_decisions"
ALTER COLUMN "source" TYPE "review_decision_source"
USING ("source"::text::"review_decision_source");

DROP TYPE "review_decision_source_old";
