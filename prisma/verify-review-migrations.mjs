import 'dotenv/config';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const prismaDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(prismaDirectory, 'migrations');
const schemaName = `review_migration_check_${process.pid}_${Date.now()}`;
const quotedSchema = `"${schemaName}"`;
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString?.trim()) {
  throw new Error('DIRECT_URL or DATABASE_URL is required');
}

const client = new Client({ connectionString });
let schemaCreated = false;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const queryValue = async (text, values = []) => {
  const result = await client.query(text, values);
  return result.rows[0];
};

try {
  await client.connect();

  const extensions = await client.query(
    `SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pgcrypto')`,
  );
  assert(
    extensions.rowCount === 2,
    'Migration verification requires citext and pgcrypto to be installed',
  );

  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  schemaCreated = true;
  await client.query(`SET search_path TO ${quotedSchema}, public`);

  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrationDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert(
    migrationDirectories.length === 2 &&
      migrationDirectories[0] === '20260826000000_baseline' &&
      migrationDirectories[1] ===
        '20260827000000_remove_rule_review_decisions',
    'Expected the baseline and AI-only review-decision migrations',
  );

  for (const migrationDirectory of migrationDirectories) {
    const sql = await readFile(
      path.join(migrationsDirectory, migrationDirectory, 'migration.sql'),
      'utf8',
    );
    await client.query(sql);
  }

  const reviewTables = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name IN (
          'user_vocabularies',
          'review_questions',
          'review_question_options',
          'review_sessions',
          'review_session_items',
          'review_answers',
          'review_agent_decisions'
        )`,
    [schemaName],
  );
  assert(reviewTables.count === 7, 'Expected review tables were not created');

  const requiredColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND (table_name, column_name) IN (
          ('user_vocabularies', 'consecutive_correct_reviews'),
          ('user_vocabularies', 'lapse_count'),
          ('user_vocabularies', 'last_review_score'),
          ('review_questions', 'generation_source'),
          ('review_questions', 'generation_version'),
          ('review_question_options', 'generation_source'),
          ('review_sessions', 'target_duration_minutes'),
          ('review_sessions', 'review_goal'),
          ('review_sessions', 'planned_item_count'),
          ('review_sessions', 'plan_summary'),
          ('review_sessions', 'ai_call_count'),
          ('review_sessions', 'ai_diagnosis_call_count'),
          ('review_sessions', 'agent_version'),
          ('review_answers', 'review_session_item_id'),
          ('review_answers', 'inferred_review_score'),
          ('review_answers', 'skill_dimension'),
          ('review_answers', 'error_type')
        )`,
    [schemaName],
  );
  assert(
    requiredColumns.count === 17,
    'Review migration columns are incomplete',
  );

  const backwardCompatibleQuestionColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'review_questions'
        AND column_name = 'generation_version'
        AND is_nullable = 'YES'`,
    [schemaName],
  );
  assert(
    backwardCompatibleQuestionColumns.count === 1,
    'Review question prompt version is not backward compatible',
  );

  const backwardCompatibleColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'review_sessions'
        AND (
          (column_name IN (
            'target_duration_minutes',
            'review_goal',
            'planned_item_count',
            'plan_summary',
            'agent_version'
          ) AND is_nullable = 'YES')
          OR (
            column_name = 'ai_call_count'
            AND is_nullable = 'NO'
            AND column_default LIKE '0%'
          )
          OR (
            column_name = 'ai_diagnosis_call_count'
            AND is_nullable = 'NO'
            AND column_default LIKE '0%'
          )
        )`,
    [schemaName],
  );
  assert(
    backwardCompatibleColumns.count === 7,
    'Review planning columns are not backward compatible',
  );

  const backwardCompatibleAnswerColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'review_answers'
        AND column_name IN ('skill_dimension', 'error_type')
        AND is_nullable = 'YES'`,
    [schemaName],
  );
  assert(
    backwardCompatibleAnswerColumns.count === 2,
    'Review answer signals are not backward compatible',
  );

  const decisionForeignKeys = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.table_constraints
      WHERE constraint_schema = $1
        AND table_name = 'review_agent_decisions'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name IN (
          'fk_review_agent_decisions_session',
          'fk_review_agent_decisions_item',
          'fk_review_agent_decisions_answer'
        )`,
    [schemaName],
  );
  assert(
    decisionForeignKeys.count === 3,
    'Agent decision relations are incomplete',
  );

  const legacyColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND (
          (table_name = 'review_questions' AND column_name IN (
            'article_vocabulary_id',
            'quiz_id',
            'created_by_user_id',
            'updated_by_user_id'
          ))
          OR (
            table_name = 'review_answers'
            AND column_name IN (
              'review_session_id',
              'article_vocabulary_id',
              'user_vocabulary_id',
              'item_type'
            )
          )
          OR (
            table_name = 'review_sessions'
            AND column_name IN (
              'session_type',
              'quiz_id',
              'article_id',
              'collection_id'
            )
          )
        )`,
    [schemaName],
  );
  assert(legacyColumns.count === 0, 'Legacy review columns remain');

  const indexes = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname IN (
          'uq_review_sessions_active_daily',
          'idx_review_sessions_active',
          'uq_review_questions_ai_cache',
          'uq_review_answers_item_attempt',
          'uq_agent_decision_answer_kind',
          'idx_agent_decisions_session_kind',
          'idx_agent_decisions_item'
        )`,
    [schemaName],
  );
  assert(indexes.count === 7, 'Review indexes are incomplete');

  const obsoleteSessionType = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM pg_type
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_namespace.nspname = $1
        AND pg_type.typname = 'review_session_type'`,
    [schemaName],
  );
  assert(
    obsoleteSessionType.count === 0,
    'Obsolete review_session_type enum remains',
  );

  const obsoleteQuizSchema = await queryValue(
    `SELECT (
       SELECT COUNT(*)::int
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name IN ('quizzes', 'quiz_questions', 'question_options')
     ) + (
       SELECT COUNT(*)::int
         FROM pg_type
         JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = $1
          AND pg_type.typname IN ('quiz_status', 'question_generation_source')
     ) AS count`,
    [schemaName],
  );
  assert(obsoleteQuizSchema.count === 0, 'Obsolete quiz schema remains');

  const agentEnumTypes = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM pg_type
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_namespace.nspname = $1
        AND pg_type.typname IN (
          'review_goal',
          'review_skill_dimension',
          'review_error_type',
          'review_agent_action',
          'review_decision_kind',
          'review_decision_source'
        )`,
    [schemaName],
  );
  assert(agentEnumTypes.count === 6, 'Agentic review enums are incomplete');

  const decisionSourceValues = await client.query(
    `SELECT enumlabel
       FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_namespace.nspname = $1
        AND pg_type.typname = 'review_decision_source'
      ORDER BY enumsortorder`,
    [schemaName],
  );
  assert(
    decisionSourceValues.rowCount === 1 &&
      decisionSourceValues.rows[0]?.enumlabel === 'AI',
    'Review decisions must only support AI provenance',
  );

  const obsoleteEnum = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM pg_type
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_namespace.nspname = $1
        AND pg_type.typname = 'review_item_type'`,
    [schemaName],
  );
  assert(obsoleteEnum.count === 0, 'Obsolete review_item_type enum remains');

  const namedChecks = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM pg_constraint
       JOIN pg_namespace ON pg_namespace.oid = pg_constraint.connamespace
      WHERE pg_namespace.nspname = $1
        AND pg_constraint.contype = 'c'
        AND pg_constraint.conname LIKE 'ck\\_%' ESCAPE '\\'`,
    [schemaName],
  );
  assert(namedChecks.count === 64, 'Named CHECK constraints are incomplete');

  const updatedAtTriggers = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.triggers
      WHERE trigger_schema = $1
        AND trigger_name LIKE 'trg\\_%\\_set\\_updated\\_at' ESCAPE '\\'`,
    [schemaName],
  );
  assert(
    updatedAtTriggers.count === 13,
    'Automatic updated_at triggers are incomplete',
  );

  const normalizedTermIndex = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM pg_indexes
      WHERE schemaname = $1
        AND indexname = 'uq_article_sentence_terms_value'
        AND indexdef LIKE '%lower(btrim(value))%'`,
    [schemaName],
  );
  assert(
    normalizedTermIndex.count === 1,
    'Normalized article term expression index is missing',
  );

  console.log(
    `Applied ${migrationDirectories.length} migrations and verified the review schema`,
  );
} finally {
  if (schemaCreated) {
    await client.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
    const rolledBack = await queryValue(
      'SELECT to_regnamespace($1) IS NULL AS removed',
      [schemaName],
    );
    assert(rolledBack.removed, 'Disposable migration schema rollback failed');
    console.log('Disposable schema rollback verified');
  }
  await client.end();
}
