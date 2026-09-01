# Vocab Mate Backend — Agent Guide

## Scope

These instructions apply to the entire backend repository.

Stack:

* NestJS
* TypeScript strict mode
* Prisma ORM
* PostgreSQL
* REST API

This project is an AI Agent that helps learners review vocabulary. You are encouraged to build agentic features, introduce autonomous workflows, and integrate LLMs deeply into the application to provide a dynamic and personalized learning experience.

Feel free to introduce:
* Autonomous agents and multi-turn tutoring.
* LangChain or LangGraph.
* Dynamic AI-generated explanations and quizzes.
* Automatic publication of AI-enriched content.
* Vector databases or embeddings if needed.

External provider calls:

* Must have explicit timeouts.
* Must not run inside long database transactions.
* Must be mocked in tests.
* Must never log API keys or full raw provider responses.

## Repository Structure

Follow the existing repository structure. The expected high-level layout is:

```text
src/
  common/
  config/
  database/
  modules/
prisma/
  schema.prisma
  migrations/
test/
```

Application code must be organized by business feature.

Typical feature structure:

```text
modules/<feature>/
  <feature>.module.ts
  <feature>.controller.ts
  <feature>.service.ts
  dto/
  *.spec.ts
```

Do not create folders or architectural layers only because they may be useful
in the future.

## Commands

Use the package manager indicated by the lockfile.

Before running commands, inspect `package.json` and use scripts that actually
exist.

Typical commands:

```bash
npm ci
npm run start:dev
npm run lint
npm test
npm run test:e2e
npm run build
npx prisma validate
npx prisma generate
```

Never claim a command passed unless it was executed successfully.

## Operating Rules

Make the smallest correct production-quality change that satisfies the task.

Before editing:

1. Read the relevant module and its tests.
2. Search the repository for existing related logic.
3. Identify the service that currently owns the business rule.
4. Reuse existing code whenever possible.
5. Extend the current implementation before creating a parallel one.
6. Check `prisma/schema.prisma` when database behavior is involved.

Do not implement from assumptions when the repository can provide the answer.

## Reuse Before Creation

Use this order:

1. Reuse existing code unchanged.
2. Extend the existing authoritative implementation.
3. Extract shared code only when real duplication already exists.
4. Create new code only when the first three options do not apply.

Do not create duplicate:

* Services
* Controllers
* DTOs
* Guards
* Decorators
* Validators
* Prisma query helpers
* Error mappings
* Authentication logic
* Authorization logic
* Ownership checks
* Business rules

A business rule must have one authoritative implementation.

Controllers must not repeat rules already implemented in services.

## Scope Discipline

Do not:

* Refactor unrelated code.
* Rename or move unrelated files.
* Reformat unrelated files.
* Change public API contracts without a requirement.
* Add unrequested features.
* Add configuration for speculative future use.
* Change the database schema unless the task requires it.
* Add dependencies when existing packages already solve the problem.
* Fix unrelated issues inside the same change.

Report unrelated issues separately.

Keep the Git diff focused and reviewable.

When a task requires a broad change, split it into the smallest coherent
implementation stages.

## Anti-Over-Engineering

Use the simplest design consistent with the existing repository.

Do not introduce these patterns unless the repository already uses them or the
task explicitly requires them:

* CQRS
* Event sourcing
* Domain-driven architecture layers
* Repository interfaces with one implementation
* Generic repositories
* Generic base controllers
* Generic base services
* Use-case classes for simple CRUD
* Factories with one construction path
* Mappers that only copy equivalent fields
* Internal events for synchronous operations
* Message queues
* Microservices
* New caching infrastructure
* State machines
* New abstraction layers

A normal feature should usually require only:

* Module
* Controller
* Service
* DTO
* Prisma access
* Tests

Do not apply an architectural pattern solely because a skill describes it as a
best practice.

## New File Policy

Search for an existing file with the same or overlapping responsibility before
creating a file.

Create a new file only when it has a clear, distinct and current
responsibility.

Acceptable reasons include:

* A new NestJS module, controller, service, DTO or test is required.
* The repository already separates that responsibility into its own file type.
* Existing code has real duplication that needs one shared implementation.
* Keeping the code in an existing file would materially reduce readability or
  maintainability.

Do not create:

* Empty files or folders.
* Placeholder files.
* Files for future features.
* A second service with overlapping ownership.
* A DTO equivalent to an existing DTO.
* A wrapper around one library call.
* A utility used once when inline code is clearer.
* An interface with one implementation without a concrete need.
* A generic abstraction with only one use case.

List every new file in the final report and explain why it was necessary.

## NestJS Boundaries

Controllers handle HTTP concerns:

* Routes
* Parameters
* Request bodies
* Authentication context
* Status codes
* Delegation to services

Controllers must not:

* Access Prisma directly.
* Contain substantial business logic.
* Duplicate service validation.
* Trust authorization performed by the frontend.

Services own application and business logic.

Use constructor dependency injection.

Do not manually instantiate NestJS providers.

Export only providers required by another module.

Avoid circular dependencies. Do not use `forwardRef()` before reviewing module
ownership.

## Prisma Rules

Use the existing shared `PrismaService`.

Do not create an additional data-access layer unless the repository already
uses one or the task demonstrates a concrete need.

Queries must:

* Select only required fields.
* Avoid exposing sensitive fields.
* Avoid unnecessary relation loading.
* Avoid database calls inside loops.
* Avoid N+1 behavior.
* Bound list results.
* Use deterministic ordering for pagination.
* Whitelist client-controlled filters and sort fields.

Do not use unbounded `findMany()` for data that can grow.

Use transactions only when multiple operations must succeed or fail together.

Use database constraints for important invariants such as uniqueness,
referential integrity and duplicate-membership prevention.

Do not rely only on check-then-insert for uniqueness.

Raw SQL must be parameterized and used only when Prisma cannot reasonably
express the operation.

## Schema and Migration Rules

Before modifying the Prisma schema:

1. Inspect current models and relations.
2. Inspect related migrations.
3. Confirm the existing schema cannot satisfy the requirement.
4. Identify migration, backfill and compatibility risks.
5. Review whether an index corresponds to an actual query pattern.

Do not add indexes speculatively.

Do not use `prisma db push` as a production migration workflow.

Review generated migration SQL.

Never run a destructive migration against a shared or production database
without explicit approval.

## Validation and Security

Validate all external input at runtime using the project's established DTO and
validation approach.

Do not rely on TypeScript types as runtime validation.

Do not accept trusted fields from normal client input, including:

* User ownership
* Roles
* Internal statuses
* Audit fields
* System-generated identifiers

Authentication and authorization are separate requirements.

For protected resources:

1. Authenticate the caller.
2. Check role or permission.
3. Check ownership or resource access.
4. Scope database operations to the authenticated user where appropriate.

Never expose secrets, tokens, password hashes, connection strings, stack
traces or internal database details.

Do not silently swallow errors.

## Production Quality

Changed code must:

* Compile under strict TypeScript.
* Avoid unjustified `any`.
* Follow existing naming and module conventions.
* Validate external input.
* Enforce backend authorization.
* Handle known failure cases.
* Avoid sensitive-data exposure.
* Avoid duplicated business logic.
* Include tests for meaningful behavior changes.
* Preserve existing API behavior unless the task changes it.

Do not add fallback behavior that hides defects.

Do not mark untested work as production-ready.

## Testing

Add or update tests for changed behavior.

Test the smallest appropriate level:

* Unit tests for pure rules and service behavior.
* Integration tests for Prisma constraints, relations and transactions.
* E2E tests for important HTTP, authentication and authorization flows.

Relevant cases include:

* Success
* Invalid input
* Unauthenticated access
* Forbidden access
* Missing resources
* Duplicate data
* Ownership violations

Do not remove tests or weaken assertions merely to make checks pass.

## Skills

Use `nestjs-best-practices` for relevant NestJS work.

Skills provide specialist guidance. They do not override:

* Existing repository architecture
* This reuse-first policy
* Scope restrictions
* Anti-over-engineering rules
* The requirement to inspect existing code first

Do not invoke unrelated skills.

## Required Workflow

Before implementation, briefly identify:

* Existing code to reuse
* Existing code to extend
* The authoritative business rule
* Files expected to change
* New files that are genuinely necessary
* Database impact
* Tests to update

After implementation:

1. Review the complete Git diff.
2. Remove unrelated changes.
3. Search for duplicated logic.
4. Verify every new file is necessary.
5. Verify every abstraction has a current concrete use.
6. Review affected Prisma queries.
7. Review migration SQL when applicable.
8. Run relevant lint, tests and build commands.

## Completion Report

Report only verifiable information:

* Existing code reused
* Existing code extended
* Files modified
* Files created and why
* Dependencies changed
* API contract changes
* Prisma schema or migration changes
* Commands executed and results
* Checks not executed
* Remaining risks or assumptions
