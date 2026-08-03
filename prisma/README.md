# Prisma schema

`vocab_mate_mvp_schema.sql` is the source of truth for the MVP database.
The Prisma schema is split by business domain under `models/`; Prisma loads
all `.prisma` files recursively through the `schema: "prisma"` setting in
`prisma.config.ts`.

`schema.prisma` owns only the datasource and client generator. Model files own
table mappings, relations, defaults, unique constraints, and indexes for their
related backend modules.

The following PostgreSQL features from the source SQL are not fully expressed
by Prisma Schema Language and must be preserved in a customized migration:

- the `pgcrypto` and `citext` extensions;
- named `CHECK` constraints;
- the `LOWER(BTRIM(value))` expression unique index on
  `article_sentence_terms`;
- the `set_updated_at()` function and its table triggers.

Do not use `prisma db push` as a replacement for those migration details.

## Migration baseline

`migrations/20260731000000_baseline/migration.sql` represents the complete
multi-file Prisma schema before the news-ingestion and AI feature. It was
generated with the installed Prisma CLI and then reviewed and customized to
preserve the PostgreSQL features listed above:

```bash
npx prisma migrate diff --from-empty --to-schema prisma --script --output prisma/migrations/20260731000000_baseline/migration.sql
```

Do not regenerate the committed file without restoring its extensions, named
check constraints, expression index and `updated_at` triggers.

`20260803000000_replace_article_analysis_with_wink_nlp` adds the `NLP` term
origin and makes lookup-generated lexical metadata nullable. It does not replace
the `article_sentence_terms` table, sentence foreign key, audit relationships,
or marker IDs. Apply it before running the local WinkNLP analysis flow.

The `20260803149000` through `20260803151000` migrations expand and then clean
up the invisible spaced-review schema. `20260803152000_ai_assisted_review_questions`
adds option-level generation provenance and the partial unique key used to
deduplicate active AI question caches by term context, CEFR and question type.
`20260803153000_review_answer_attempt_uniqueness` prevents duplicate attempt
numbers for the same review-session item.

### Existing database

First back up the database and verify that its schema already matches this
baseline, including the extensions, named check constraints, expression index
and triggers. If it differs, reconcile the drift explicitly before recording
the baseline. Do not apply the baseline SQL to a populated database.

After verification, mark the baseline as applied:

```bash
npx prisma migrate resolve --applied 20260731000000_baseline
npx prisma migrate status
```

`migrate resolve` records migration history in the target database; it does
not create the baseline objects.

### New empty database

Configure `DIRECT_URL` or `DATABASE_URL` for the empty PostgreSQL database,
ensure the database role may create the required extensions, and apply the
committed migrations normally:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Never use `prisma db push` to initialize either an existing or a new database.

## Review migration verification and rollback

With `DIRECT_URL` pointing to a non-production PostgreSQL instance that already
has `citext` and `pgcrypto`, run:

```bash
npm run prisma:verify-review-migrations
```

The verifier creates an isolated generated schema, replays every committed
migration, checks the final invisible-review tables, source enum, unique active
session indexes, AI cache key, answer-attempt key, and removal of obsolete
columns/types. Its rollback check drops only that disposable schema and verifies
that it no longer exists.

Prisma migrations do not provide automatic production down migrations. Before
deploying `20260803149000` through `20260803153000`, take and test a database
backup. If deployment must be reversed after writes begin, restore that backup
to a replacement database and switch traffic, or ship a separately reviewed
forward corrective migration. Do not run the disposable verifier as a
production rollback and do not manually drop review columns from a live
database; the cleanup migration intentionally removes legacy relations after
backfill.
