# CASEFlow AI — Increment 1A (Project + Artifact Foundation) Report

Date: 2026-09-21
Branch: `feature/deliverable1-foundation`
Task: Increment 1A — Project + Artifact Foundation (First Deliverable MVP reprioritization)

## 1. Spec / roadmap changes

`docs/CASEFLOW_AI_SPEC.md` was updated **before** any code:

- New §217 **First Deliverable MVP**: the software must produce RF/RNF, structured use cases (min. four), use-case representation, data model (ER/class), navigation tree, software architecture, system architecture, UI Blueprint, sketches/mockups, review/editing, persistence/versioning and basic traceability. Planning/Gantt/PERT and team reflection/evidence are recorded as team-authored academic activities, not core P0 CASEFlow generation.
- New §218 **immediate roadmap**: 1A Project + Artifact Foundation → 1B Project Context → 1C AI Generation Foundation → 1D Requirements → 1E Use Cases → 1F Data Model + Diagram Engine → 1G Navigation + Architecture → 1H UI Blueprint + Mockups → 1I Traceability + Versions + Export → 1J First Deliverable Hardening. §218.1 records the 1A model decisions; §218.2 points to `docs/FIRST_DELIVERABLE_MVP.md`.
- New §219 and row **DEC-115** in the decision register (§213 table): reprioritization decision record.
- Priority notes added to §180 (roadmap) and §182 (Identity) and a scope note to §183 (Artifact Core).
- Nothing was removed. Identity, Workspace, RBAC, Knowledge Base, RAG, Construction and Code Generation remain in V1 scope. DEC-001…DEC-114 are untouched.
- `AGENTS.md` §8: one paragraph added pointing to the immediate priority (§217–§219) so the agent contract does not contradict the spec.
- `docs/FIRST_DELIVERABLE_MVP.md` created as a concise summary (explicitly subordinate to the spec).

**Was the old Identity-first roadmap fully superseded in the spec?** No — only its **calendar priority** was superseded (DEC-115 supersedes the scheduling in §180/§182). The long-term dependency order and the full Identity increment (§182) remain in the spec and are resumed after 1J. The task "Increment 1A — Identity Persistence Foundation" was **not** implemented.

## 2. Implemented

- Prisma schema + hand-reviewed migration for Workspace, Project, controlled artifact types, Artifact, ArtifactVersion and per-project code counters.
- Database-level integrity: composite tenant FK, CHECK constraints, immutability triggers.
- `packages/domain`: lifecycle constants, transition rules, initial-status-by-origin, artifact code formatting.
- `packages/contracts`: zod request schemas + response types for projects and artifacts.
- API (`apps/api`): `DatabaseModule` / `PrismaService`, `ProjectsModule`, `ArtifactsModule`, shared `ZodValidationPipe`.
- Scripts: `db:generate`, `db:test:migrate`, `db:seed:dev`; `postinstall` client generation.
- Tests: 59 unit tests (12 files) and 40 integration tests (6 files).
- CI: one added step (`pnpm db:test:migrate`).
- README updated only for the commands/workflows that changed; `.env.example` needed no change (no new variables).

Out of scope and **not** implemented: requirement/use-case subtype tables, generation, AI, prompts, RAG, diagrams, Mermaid/PlantUML, mockups, Stitch, auth, RBAC, export, `/health/ready`, Swagger/OpenAPI document.

## 3. Data model

Physical tables (snake_case): `workspaces`, `projects`, `artifact_types`, `artifacts`, `artifact_versions`, `project_code_counters` (plus Prisma's `_prisma_migrations`).

| Table                   | Key columns                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces`            | `id` uuid PK, `slug` unique, `name`, `created_at`, `updated_at`                                                                                                                                           |
| `projects`              | `id` uuid PK, `workspace_id` FK NOT NULL, `name`, `description` null, `created_at`, `updated_at`                                                                                                          |
| `artifact_types`        | `code` text PK, `default_code_prefix`, `created_at`                                                                                                                                                       |
| `artifacts`             | `id` uuid PK, `project_id` FK, `artifact_type_code` FK, `code`, `created_at`; unique `(project_id, code)`, unique `(id, project_id)`                                                                      |
| `artifact_versions`     | `id` uuid PK, `artifact_id`, `project_id`, `version_number`, `title`, `status`, `origin`, `metadata_auxiliary` jsonb, `created_at`, `submitted_at`, `approved_at`; unique `(artifact_id, version_number)` |
| `project_code_counters` | PK `(project_id, code_prefix)`, `last_number`                                                                                                                                                             |

Ownership: `Project.workspace_id` is NOT NULL (no nullable shortcut). No `users` table and no `created_by` column yet — they belong to the Identity increment (additive later).
Every FK is `ON DELETE RESTRICT ON UPDATE RESTRICT`; UUID defaults use `gen_random_uuid()` in the database.

**Enums / reference codes introduced**

- PostgreSQL enum `artifact_version_status`: `DRAFT`, `GENERATED`, `IN_REVIEW`, `APPROVED`, `CHANGES_REQUESTED`.
- PostgreSQL enum `artifact_origin`: `MANUAL`, `AI_GENERATED`, `AI_ASSISTED`, `IMPORTED`.
- `artifact_types` rows (code → default code prefix): `REQUIREMENT`→`RF`, `USE_CASE`→`CU`, `DATA_MODEL`→`MD`, `USE_CASE_DIAGRAM`→`DIA`, `NAVIGATION_TREE`→`NAV`, `SOFTWARE_ARCHITECTURE`→`ARQ`, `SYSTEM_ARCHITECTURE`→`ARQ`, `UI_BLUEPRINT`→`UI`, `MOCKUP`→`MCK`. `MD`, `NAV` and `MCK` are new prefixes (the spec §31.4 lists only RF/RNF/ACT/CU/ADR/ARQ/UI/DIA). An RNF passes `codePrefix: "RNF"` on a `REQUIREMENT`.

**Artifact type representation:** normalized reference table `artifact_types` with an FK from `artifacts` — chosen over a DB enum so later slices add types with an `INSERT` migration instead of `ALTER TYPE`. The API validates the type against the table, not a hardcoded list.

## 4. Artifact / versioning model

- `Artifact` = stable identity; `ArtifactVersion` = historical state. The "current state" is **derived** from the latest version (highest `version_number`), not stored on `Artifact` (spec §6.2 `current_state`, interpreted per §5.4 and recorded in §218.1).
- New artifact → version 1, `MANUAL`/`DRAFT` from HTTP. Service-level `origin` lets future flows create `AI_GENERATED` (→ `GENERATED`), `AI_ASSISTED`, `IMPORTED` (→ `DRAFT`). HTTP bodies cannot set origin or status (`.strict()` schemas).
- Editing = new version; the API exposes no update/delete.
- Generic content: `metadata_auxiliary` JSONB, constrained to a JSON object, auxiliary only.
- Domain lifecycle transitions (`packages/domain`): `DRAFT→GENERATED|IN_REVIEW`, `GENERATED→IN_REVIEW`, `IN_REVIEW→APPROVED|CHANGES_REQUESTED`, `CHANGES_REQUESTED→DRAFT`, `APPROVED→∅`. Defined and unit-tested only; no transition endpoints exist (Increment 2).

**Version immutability mechanism (in the database)**

- Trigger `artifact_versions_enforce_immutability` (`BEFORE UPDATE OR DELETE`): DELETE always rejected; any UPDATE on an `APPROVED` row rejected; identity/content columns (`id`, `artifact_id`, `project_id`, `version_number`, `title`, `origin`, `metadata_auxiliary`, `created_at`) can never change. Only `status`, `submitted_at`, `approved_at` may change on non-approved rows.
- CHECK `artifact_versions_approved_at_consistency_check`: `(status = 'APPROVED') = (approved_at IS NOT NULL)`.
- Trigger `artifacts_enforce_stable_identity`: `id`, `project_id`, `artifact_type_code`, `code` immutable.
- Deliberate 1A choice (recorded in spec §218.1): version content is never edited in place, including drafts. The spec's draft autosave (§15.2) is deferred to Increment 2.

**Sequential-version / concurrency strategy**

`createVersion` runs in a transaction that first executes `SELECT id FROM artifacts WHERE id = $1 AND project_id = $2 FOR NO KEY UPDATE`, then computes `MAX(version_number) + 1` and inserts. The unique `(artifact_id, version_number)` constraint is the database backstop. Verified: with the lock removed, the concurrent-versions test fails with the unique-constraint error; with the lock, 10 concurrent creations yield 1…11 without gaps or duplicates. Artifact codes are allocated in the creating transaction with an atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` on `project_code_counters`; counters only increase so a code is never reused (test: 8 concurrent creations → `RF-001…RF-008`).

**Project isolation**

- `artifact_versions (artifact_id, project_id)` has a composite FK to `artifacts (id, project_id)`: a version cannot reference another project's artifact (SQL-level test, error `23503`).
- Every service method takes `projectId`; there is no lookup of an artifact by id alone. Routes are `/projects/{projectId}/artifacts/...`. Cross-project read/write returns 404 and creates nothing (service and HTTP tests).
- Not implemented (out of scope): authorization/RBAC. Note `GET /projects/{id}` and `POST /projects` are currently unauthenticated and not workspace-scoped beyond the `workspaceId` parameter.

## 5. Prisma runtime integration

- Prisma 7 pattern: generator `prisma-client` (`moduleFormat = "cjs"`, `importFileExtension = ""`), output `apps/api/src/generated/prisma` (git-ignored, regenerated on `pnpm install` and by `pnpm db:generate`), `PrismaClient` constructed with the `@prisma/adapter-pg` driver adapter, `prisma.config.ts` unchanged.
- `DatabaseModule.forRoot({ connectionString? })` (global, dynamic) provides a single `PrismaService` (`extends PrismaClient`, `OnModuleInit` → `$connect`, `OnModuleDestroy` → `$disconnect`). Connection string defaults to `DATABASE_URL` and fails fast if unset. `main.ts` calls `enableShutdownHooks()`. No controller owns a client; no global mutable state.
- `apps/api` `dev`/`start` now use `node --env-file-if-exists=../../.env` so the API sees `DATABASE_URL` (found necessary during the runtime smoke test).
- The generated client lives in `apps/api` (not a shared package). The worker will need its own access or an extraction when it first uses the database.

**Dependencies added (exact versions)**

| Package               | Version   | Added to                                          |
| --------------------- | --------- | ------------------------------------------------- |
| `@prisma/adapter-pg`  | 7.10.0    | `apps/api` dependency                             |
| `@prisma/client`      | 7.10.0    | `apps/api` dependency (already a root dependency) |
| `zod`                 | 4.6.5     | `apps/api`, `packages/contracts`                  |
| `@caseflow-ai/domain` | workspace | `apps/api`                                        |

Prisma CLI stays `prisma@7.10.0`. `pg@8.23.0` (already a root devDependency) is used by the scripts and integration tests. `pnpm-lock.yaml` was updated by pnpm only.

## 6. Migrations

- `20260916024257_enable_pgvector` — preserved unchanged.
- `20260921155928_project_artifact_foundation` — generated with `prisma migrate dev --create-only` then extended by hand with CHECK constraints, the `artifact_types` seed rows, and the two trigger functions. History is linear. No `prisma db push` was used anywhere.
- One manual edit to the generated SQL: `updated_at` got `DEFAULT CURRENT_TIMESTAMP` (schema `@default(now()) @updatedAt`) so raw inserts (dev seed) are valid. Because the migration was still uncommitted, both the dev and test databases were dropped/recreated in the disposable container and re-migrated from zero (see §11) rather than adding a correction migration.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → "No difference detected".

## 7. Development / test DB parity

Both `caseflow` and `caseflow_test` are built only from `prisma/migrations` via `prisma migrate deploy`.

**Exact test-DB migration flow** (`pnpm verify:integration`):

1. `pnpm db:test:prepare` — `scripts/prepare-test-database.mjs` (unchanged): creates `caseflow_test` if missing, enables `vector` there.
2. `pnpm db:test:migrate` — new `scripts/migrate-test-database.mjs`: requires `DATABASE_TEST_URL`; **refuses** if it resolves to the same host + port + database as `DATABASE_URL`; **refuses** unless the database name ends with `_test`; runs `prisma migrate deploy` in a child process with `DATABASE_URL` overridden to the test URL only for that process. No `db push`.
3. `pnpm test:integration` — `vitest.integration.config.mts` (`fileParallelism: false`), with a setup file that asserts the target is an isolated `*_test` database and then **re-points `process.env.DATABASE_URL` to `DATABASE_TEST_URL`** so nothing in the run can fall back to the development database. Each spec truncates the test data in `beforeAll` (guarded: refuses unless `current_database()` ends with `_test`).

`pnpm verify:integration` was updated to `db:test:prepare && db:test:migrate && test:integration`. The normal development DB is never migrated by integration tests.

**Proof integration tests do not touch `caseflow`:** row counts of the development database before and after `pnpm verify:integration` were identical (`caseflow`: 1 workspace / 1 project / 1 artifact / 2 versions before and after), while `caseflow_test` changed (1 workspace / 2 projects / 1 artifact / 3 versions before → 5 workspaces / 5 projects / 0 artifacts / 0 versions after). The migrations integration test also asserts `current_database() = 'caseflow_test'` and `DATABASE_URL === DATABASE_TEST_URL` inside the run. Four unit tests execute the guard script as a child process (neutral cwd so no `.env` is loaded) and assert it exits 1 for: test URL = dev URL, same server/database with different credentials/host case/options, database name not ending in `_test`, and missing `DATABASE_TEST_URL`.

The development seed (`pnpm db:seed:dev`) creates an idempotent `dev-workspace`, refuses `NODE_ENV=production`, and only targets `DATABASE_URL`.

## 8. API behavior

All input is validated at the boundary with the shared zod contracts (errors in Spanish, `{ message, errors: [{ path, message }] }`). Public errors contain no SQL/stack/paths (asserted). Controllers are thin; rules live in services.

| Method | Route                                                   | Result                                                                             |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/projects`                                             | 201 project (`workspaceId`, `name`, optional `description`); 404 unknown workspace |
| GET    | `/projects?workspaceId=&limit=&offset=`                 | workspace-scoped list, ordered `(created_at, id)`, `limit` ≤ 100 (default 50)      |
| GET    | `/projects/{projectId}`                                 | project or 404                                                                     |
| POST   | `/projects/{projectId}/artifacts`                       | 201 artifact + version 1 (MANUAL/DRAFT); 422 unknown type                          |
| GET    | `/projects/{projectId}/artifacts/{artifactId}`          | artifact + current (latest) version; 404 if not in that project                    |
| POST   | `/projects/{projectId}/artifacts/{artifactId}/versions` | 201 new version (n+1); 404 if not in that project                                  |

`GET /health/live` is unchanged. `/health/ready` was **not** added. There is no deletion or update endpoint.

## 9. Tests

- **Unit (59 tests, 12 files):** lifecycle/transition/code-format rules; zod contracts; pipe and UUID param; controllers with stubbed services (validation, routing, project-scoped calls, origin/status not settable); service rule branches with mocked Prisma; `PrismaService` config; vocabulary parity between domain, contracts and the Prisma enums; the `db:test:migrate` guard script; existing health test.
- **Integration against `caseflow_test` (40 tests, 6 files):**
  - Migrations: all migration directories applied in order, foundation tables exist, first-deliverable artifact types seeded, pgvector kept, connected to `caseflow_test`.
  - Project: persisted with generated id/timestamps and required workspace; missing workspace rejected in service and DB (`23502`/`23503`); blank name rejected; workspace with projects cannot be deleted; workspace-scoped deterministic pagination.
  - Artifact: belongs to one project; first version persists; second version preserves the first byte-for-byte; sequential numbers; latest-version resolution; origin/status persist for all four origins; all nine types accepted; unknown type/project rejected; project-scoped sequential codes and prefix override; concurrent code allocation; concurrent version creation; approved version never rewritten.
  - Database invariants via raw SQL: cross-project version/artifact misuse rejected; artifact identity immutable; duplicate/non-positive version number rejected; version DELETE and content UPDATE rejected; approved rows frozen; approved_at consistency; metadata must be an object; code/slug format.
  - HTTP flow with supertest: project → artifact → new version → read current; cross-project 404; validation/safe-error behavior.

## 10. CI changes

`.github/workflows/ci.yml` integration job: added `pnpm db:test:migrate` between `pnpm db:test:prepare` and `pnpm test:integration`. PostgreSQL + pgvector service unchanged; no Redis/SeaweedFS/Mailpit added. The quality job is unchanged; it works without a `.env` because `postinstall` generates the client with a placeholder `DATABASE_URL` when none is set (verified by temporarily moving `.env`). Existing checks were not weakened. CI was **not** executed on GitHub.

## 11. Verified

Every command actually run, in order of use:

Git: `git branch -a`, `git status --short`, `git tag`, `git remote -v`, `git fetch origin` (failed: SSL certificate problem), `git -c http.sslBackend=schannel fetch origin` (succeeded; one-off flag, nothing persisted), `git rev-parse develop origin/develop origin/main main v0.1.0^{commit}` (all `b1fe0dd…`), `git checkout -b feature/deliverable1-foundation`, `git diff`, `git status`.

Infra: `docker run -d --name caseflow-verify-pg -p 5433:5432 pgvector/pgvector:0.8.6-pg18` (see §13), `docker exec … pg_isready`, `docker exec … psql` (schema reset of both databases; row counts).

Dependencies: `pnpm install --frozen-lockfile` (twice; postinstall generation ran), `pnpm --filter @caseflow-ai/api add --save-exact @prisma/adapter-pg@7.10.0 @prisma/client@7.10.0 zod@4.6.5 @caseflow-ai/domain@workspace:*`, `pnpm --filter @caseflow-ai/contracts add --save-exact zod@4.6.5 @caseflow-ai/domain@workspace:*`, `pnpm --filter @caseflow-ai/contracts remove @caseflow-ai/domain`.

Database: `pnpm db:validate`, `pnpm exec prisma format`, `pnpm exec prisma migrate dev --create-only --name project_artifact_foundation`, `pnpm db:migrate` (applied cleanly, also after the from-zero reset), `pnpm exec prisma migrate status` ("Database schema is up to date!"), `pnpm exec prisma generate`, `pnpm db:test:prepare`, `pnpm db:test:migrate`, `pnpm exec prisma migrate diff --from-config-datasource --to-schema … --exit-code` (no difference), `pnpm db:seed:dev`.

Quality: `pnpm format` / `pnpm format:check` (all files pass), `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` (59/59), `pnpm test:coverage`, `pnpm test:integration` (40/40, several runs), `pnpm verify:integration` (passed), **`pnpm verify`** (format:check → lint → typecheck → build → test → test:coverage: passed). Coverage (unit suite only): 78.89 % lines, 77.47 % statements, 87.8 % branches, 80.48 % functions; `artifacts.service.ts` 100 % lines. Integration tests are not part of that figure.

Runtime: the compiled API (`node --env-file-if-exists=../../.env dist/main.js`, port 3901) against the development database: `GET /health/live`, `POST /projects`, `POST …/artifacts`, `POST …/versions`, `GET …/artifacts/{id}` all returned the expected responses (`CU-001`, version 2 current); invalid id → 400. The process was then stopped.

Negative check: removing `FOR NO KEY UPDATE` made the concurrent-versions integration test fail with the `artifact_versions_artifact_id_version_number_key` unique violation; the lock was restored (test passes again).

## 12. Not verified

- The GitHub Actions workflow was not run.
- `pnpm infra:up` / the project's Docker Compose stack was **not** started; PostgreSQL was provided by a separate disposable container (see §13). Redis, SeaweedFS and Mailpit were not exercised (this slice does not use them).
- `pnpm dev` / `pnpm dev:api` (ts-node watch mode) was not run; only the compiled API (`dist`) was.
- No web UI exists for 1A, so no browser check was possible.
- `prisma migrate dev` against a shadow database was not exercised beyond `--create-only`.
- No authorization exists yet; project isolation was verified for the data layer and routes only.

## 13. Relevant notes

- **Local port conflict:** a native PostgreSQL service occupies port 5432 on this machine and rejects the project credentials. Per the README, it was **not** stopped. A disposable container `caseflow-verify-pg` (same image and credentials as `infra/docker/compose.yml`) was started on port **5433**, and the git-ignored local `.env` (copied from `.env.example`) points both `DATABASE_URL` and `DATABASE_TEST_URL` at `localhost:5433`. The container still holds the development database (containing the runtime-smoke "Smoke" project/artifact) and the test database. Remove with `docker rm -f caseflow-verify-pg` when no longer needed.
- Decision points to review: no `users`/`created_by` yet; `current_state` derived; version content immutable even for drafts in 1A; new default prefixes `MD`/`NAV`/`MCK`; `REQUIREMENT` defaults to `RF` (RNF via `codePrefix`); Prisma client generated inside `apps/api`; `test:integration` now runs API-level specs from `apps/api/test/integration/` in addition to `tests/integration/`.
- `updated_at` on `workspaces`/`projects` is set by Prisma's `@updatedAt` on client writes; raw SQL updates would not bump it.
- `tsconfig.build.json` of the API now lists `include: ["src"]` explicitly because `tsconfig.json` also type-checks `apps/api/test`.
- No OpenAPI document exists yet for the new routes (AGENTS §33 expects REST + OpenAPI; adding Swagger was outside this slice and would introduce a dependency).
- Follow-up: the working tree is **uncommitted**; `instruction.md` is git-ignored and was not modified.

## 14. Git branch / status

- Final branch: **`feature/deliverable1-foundation`** (created from `develop` = `origin/develop` = `origin/main` = `v0.1.0` = `b1fe0dd`).
- No commit, merge, tag or push was made. Changes are in the working tree (see `git status`). Not merged; Increment 1B not started.
- Authorship: no attribution, `Co-Authored-By`, signature or tool credit was added to any file, config or Git setting; `user.name`/`user.email` untouched.
