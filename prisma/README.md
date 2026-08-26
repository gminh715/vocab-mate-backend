# Prisma schema

The Prisma models and committed migrations are the source of truth for the MVP
database. `vocab_mate_mvp_schema.sql` is a generated snapshot of the current
Prisma structure for reference. The Prisma schema is split by business domain
under `models/`; Prisma loads
all `.prisma` files recursively through the `schema: "prisma"` setting in
`prisma.config.ts`.

`schema.prisma` owns only the datasource and client generator. Model files own
table mappings, relations, defaults, unique constraints, and indexes for their
related backend modules.

The following PostgreSQL features are not fully expressed by Prisma Schema
Language and must be preserved in customized migrations:

- the `pgcrypto` and `citext` extensions;
- named `CHECK` constraints;
- the `LOWER(BTRIM(value))` expression unique index on
  `article_sentence_terms`;
- the `set_updated_at()` function and its table triggers.

Do not use `prisma db push` as a replacement for those migration details.

## Single migration baseline

`migrations/20260826000000_baseline/migration.sql` is the repository's only
migration. It represents the complete current multi-file Prisma schema,
including news ingestion, Daily Review, refresh sessions, and collection-owned
saved vocabulary. It was generated with the installed Prisma CLI and then
reviewed and customized to preserve the PostgreSQL features listed above:

```bash
npx prisma migrate diff --from-empty --to-schema prisma --script --output prisma/migrations/20260826000000_baseline/migration.sql
```

Do not regenerate the committed file without restoring its extensions, named
check constraints, expression index and `updated_at` triggers.

### Existing database

This squashed baseline is intended for a new or reset database. Do not apply its
SQL to a populated database because it creates the complete schema from empty.

If an existing database was created from the former migration chain, back it up
and reconcile its `_prisma_migrations` history with this baseline during a
controlled maintenance operation. Verify that its schema matches this baseline,
including the extensions, named check constraints, expression index and
triggers, before recording the new baseline as applied. Do not run
`prisma migrate deploy` against that database while its old migration history is
still recorded.

If the baseline was already attempted and failed with PostgreSQL `42710`
(`type ... already exists`), do not rerun it against the populated schema. First
finish reconciling the schema and require the following command to report
`No difference detected`:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma --exit-code
```

For a populated database with matching schema and reconciled migration history,
record the baseline without executing its SQL:

```bash
npx prisma migrate resolve --applied 20260826000000_baseline
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

The verifier creates an isolated generated schema, applies the single baseline,
and checks the final Daily Review tables, indexes, named checks, expression
index and `updated_at` triggers. Its rollback check drops only that disposable
schema and verifies that it no longer exists.

Prisma migrations do not provide automatic production down migrations. Before
deploying or reconciling this squashed baseline, take and test a database backup.
If deployment must be reversed after writes begin, restore that backup to a
replacement database and switch traffic, or ship a separately reviewed forward
corrective migration. Do not run the disposable verifier as a production
rollback.
