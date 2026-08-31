-- AlterTable
ALTER TABLE "tutor_sessions" ADD COLUMN IF NOT EXISTS "warmup_facts" JSONB;
