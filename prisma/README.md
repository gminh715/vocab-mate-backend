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

## Migration baseline and follow-up migrations

`migrations/20260826000000_baseline/migration.sql` is the historical baseline.
Later migrations evolve that baseline to the current schema. The generated
snapshot and Prisma models represent the final state after every committed
migration has been applied. The baseline was generated with the installed
Prisma CLI and then reviewed and customized to preserve the PostgreSQL features
listed above:

```bash
npx prisma migrate diff --from-empty --to-schema prisma --script --output prisma/migrations/20260826000000_baseline/migration.sql
```

Do not regenerate the baseline without restoring its extensions, named
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

Prisma migrations do not provide automatic production down migrations. Before
deploying or reconciling the migration chain, take and test a database backup.
If deployment must be reversed after writes begin, restore that backup to a
replacement database and switch traffic, or ship a separately reviewed forward
corrective migration.
