<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
```

### Guardian Open Platform setup

An API key is required. Register a key for this application through the
Guardian Open Platform, copy `.env.example` to `.env`, and replace the safe
placeholder:

```dotenv
GUARDIAN_API_KEY="replace-with-your-guardian-api-key"
```

The application uses only the official Content API `/search` endpoint. Metadata
discovery does not request article text. An explicit admin sync requests article
text with `show-fields=...,body`, validates and sanitizes it, and fails that item
safely when Guardian does not return a usable body. It never requests the
publisher `webUrl` and has no publisher-page scraping fallback.

The Guardian currently documents Developer access as up to one call per second
and 500 calls per day. This application imposes a stricter small page-size
limit, bounded timeout and response size, one bounded retry for eligible
failures, and a serialized process-local one-second request-start throttle.
That in-memory throttle does not coordinate multiple application instances or
provide a shared daily quota budget.

No other Guardian environment variables are read: the official API URL and
safety limits are fixed inside the backend. Guardian attribution and the
original source link must remain visible wherever imported content is shown.
Operators are responsible for staying within the access tier, content licence,
attribution, retention, and other current Guardian terms. In particular, do not
assume a Developer key authorizes AI processing: verify the intended use with
the current terms and obtain the appropriate Guardian agreement or commercial
access where required. At the time of this verification, the standard Open
Platform terms also describe a 24-hour content lifecycle and restrictions on AI
processing. Because this admin flow persists imported drafts and analyzes them,
do not enable it under those standard terms without an agreement that permits
the intended retention and AI use.

`preferredLanguage` is only the user's UI display-language preference. It is
not sent to Guardian or AI providers and does not select, translate, filter, or
otherwise affect articles, explanations, vocabulary content, or ingestion.

Guardian references:

- [Content API search](https://open-platform.theguardian.com/documentation/search)
- [Developer access limits](https://open-platform.theguardian.com/access/)
- [Open Platform terms](https://www.theguardian.com/open-platform/terms-and-conditions)

The ADMIN-only ingestion contracts remain:

- `GET /api/v1/admin/news/search`: optional `q`, `section`, `fromDate`, and
  `toDate`; `page` defaults to 1; `pageSize` defaults to 5 and is capped at 10;
  `orderBy` is `newest`, `oldest`, or `relevance` and defaults to `newest`.
- `POST /api/v1/admin/news/sync`: the same discovery fields plus required
  `defaultCategoryId`; `pageSize` defaults to 5 and is capped at 5. Results are
  imported independently as parsed `DRAFT` articles.

Both operations require `q` or `section`. Search responses never expose
Guardian `fields.body`; sync item responses never expose article content.

### Admin-triggered learning flow

There is no scheduler, queue, automatic publication, publisher scraper, or
active GNews runtime integration. The supported synchronous flow is:

1. An authenticated ADMIN searches Guardian metadata and syncs one bounded
   result into a sanitized, parsed `DRAFT`.
2. An authenticated ADMIN explicitly analyzes the unchanged parsed draft.
   WinkNLP tokenizes each stored sentence locally; this step makes no Gemini or
   Groq request and does not change the article summary, category, or CEFR.
3. The analysis transaction creates approved active lookup terms and inserts
   exactly one `data-term-id` marker for each accepted sentence surface.
4. An authenticated ADMIN explicitly publishes the validated draft.
5. An authenticated user opens the reader and looks up an approved exact term
   occurrence. Missing enrichment is generated outside a transaction and
   cached by `article_sentence_terms.id`.
6. The existing vocabulary endpoint saves an immutable contextual snapshot.
   Later source-term enrichment changes do not rewrite saved vocabulary rows.

### Manual Guardian learning-flow checklist

- Use a non-production database and safe test accounts; confirm ADMIN routes
  reject an unauthenticated user and a normal USER.
- Search Guardian and confirm the API response contains metadata and source
  links, but no `fields.body`, raw Guardian response, or complete key-bearing
  request URL.
- Sync one result and confirm a parsed `DRAFT` is created from sanitized
  `fields.body`; confirm no request is made to `webUrl`.
- Analyze the draft and confirm each accepted unique sentence surface receives
  exactly one `data-term-id` marker without an article-analysis provider call.
- Publish explicitly, open the reader as a USER, and confirm the rejected term
  is inaccessible.
- Look up the approved term twice; confirm only the first request invokes AI and
  the second returns the READY cache for the exact term ID.
- Save the term, then edit the source enrichment and confirm the saved context,
  translation, and canonical examples remain unchanged.
- Exercise Guardian 401/403, 429, timeout, invalid/oversized response, unusable
  body, lazy-enrichment fallback/failure, duplicate import, and concurrent lookup cases with
  mocks only. Confirm errors contain no keys, prompts, provider output, article
  body, model/provider details, or stack traces.

### Manage Article Content vocabulary analysis

`POST /api/v1/admin/articles/:articleId/analyze` retains its existing URL and
response shape for frontend compatibility. The legacy response fields
`aiAnalysisStatus` and `candidateCount` now report local vocabulary-analysis
completion and the number of created WinkNLP terms. The operation still claims
only a parsed `DRAFT` in `PENDING` or `FAILED` state and completes only when the
content version, source HTML, sentence inventory, and existing term inventory
remain unchanged.

For every active current-version sentence, the backend runs `wink-nlp` with
`wink-eng-lite-web-model` and reads the token's exact surface, normalized
surface, token type, and lemma. A token is accepted when:

- WinkNLP classifies it as `word`;
- its exact surface, normalized surface, and lemma contain English letters,
  with only optional internal straight or curly apostrophes;
- its exact surface can be matched as a whole word in the stored sentence.

This excludes punctuation, numbers, currencies, URLs, emails, hashtags, emoji,
symbols, non-Latin tokens, and contraction fragments that cannot receive a
stable whole-word marker. Stop words, single-letter English words, and proper
nouns are retained because they are valid word tokens.

Duplicate handling is contextual. Within one sentence, normalized surfaces are
case-insensitively deduplicated and the first occurrence wins. Words already
covered by an existing sentence term are skipped so markers cannot overlap.
The same surface in a different sentence creates a separate term because
`article_sentence_terms` is sentence-contextual. Each created term receives one
marker at its first accepted occurrence.

New rows initially persist the sentence relationship, exact `value`, Wink lemma,
UUID/audit fields, and the lifecycle fields required for approved lookup access.
`word_display`, `normalized_lemma`, `part_of_speech`, `cefr_level`, pronunciation,
meanings, definitions, explanations, and other learning metadata remain null or
empty with `explanation_status = PENDING`. The first explicit learner lookup
uses the existing contextual-enrichment flow to fill those deferred fields and
cache them by `article_sentence_terms.id`. Pending or failed enrichment does not
block publication; `PROCESSING` still does, and `READY` rows must pass the full
metadata checklist.

Implementation surfaces changed for this flow are the article analysis service,
repository transaction and controller documentation; contextual enrichment and
publication validation; the Prisma term model, enum, and migration; focused
tests; dependency manifests; and the Manage Article Content frontend wording,
filters, nullable term rendering, tests, and documentation.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
npm run start:prod
```

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
