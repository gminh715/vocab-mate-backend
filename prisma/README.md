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
