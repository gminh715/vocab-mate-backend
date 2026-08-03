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
          'quiz_questions',
          'question_options',
          'review_sessions',
          'review_session_items',
          'review_answers'
        )`,
    [schemaName],
  );
  assert(reviewTables.count === 6, 'Expected review tables were not created');

  const requiredColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND (table_name, column_name) IN (
          ('user_vocabularies', 'consecutive_correct_reviews'),
          ('user_vocabularies', 'lapse_count'),
          ('user_vocabularies', 'last_review_score'),
          ('quiz_questions', 'generation_source'),
          ('question_options', 'generation_source'),
          ('review_sessions', 'collection_id'),
          ('review_answers', 'review_session_item_id'),
          ('review_answers', 'inferred_review_score')
        )`,
    [schemaName],
  );
  assert(
    requiredColumns.count === 8,
    'Review migration columns are incomplete',
  );

  const legacyColumns = await queryValue(
    `SELECT COUNT(*)::int AS count
       FROM information_schema.columns
      WHERE table_schema = $1
        AND (
          (table_name = 'quiz_questions' AND column_name = 'article_vocabulary_id')
          OR (
            table_name = 'review_answers'
            AND column_name IN (
              'review_session_id',
              'article_vocabulary_id',
              'user_vocabulary_id',
              'item_type'
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
          'uq_review_sessions_active_quiz',
          'uq_review_sessions_active_article',
          'uq_review_sessions_active_collection',
          'uq_quiz_questions_ai_cache',
          'uq_review_answers_item_attempt'
        )`,
    [schemaName],
  );
  assert(indexes.count === 6, 'Review uniqueness indexes are incomplete');

  const sessionTypes = await client.query(
    `SELECT enumlabel
       FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
      WHERE pg_namespace.nspname = $1
        AND pg_type.typname = 'review_session_type'`,
    [schemaName],
  );
  assert(
    ['QUIZ', 'DAILY_REVIEW', 'ARTICLE_REVIEW', 'COLLECTION_REVIEW'].every(
      (type) => sessionTypes.rows.some((row) => row.enumlabel === type),
    ),
    'Review session source enum is incomplete',
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
