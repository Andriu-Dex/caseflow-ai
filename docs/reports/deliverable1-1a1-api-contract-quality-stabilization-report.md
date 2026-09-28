# CASEFlow AI — Increment 1A.1 (API Contract & Quality Stabilization) Report

Date: 2026-09-21
Branch: `feature/deliverable1-foundation` (unchanged; nothing committed)

## 1. Implemented

- OpenAPI foundation for the seven implemented routes, generated from the existing zod contracts.
- Response and error schemas added to `packages/contracts` as zod schemas (TypeScript response types are now `z.infer` of them, replacing the hand-written interfaces).
- Automated OpenAPI contract test, plus HTTP-level conformance checks of real responses against the same schemas.
- Global coverage threshold (70 %) enforced in Vitest.
- `codePrefix` removed from the public HTTP contract (it was exposed with a format-only regex).
- Docs: README (OpenAPI section, Swagger URL), spec §218.1 (code prefix is internal; OpenAPI single source of truth).
- No 1B, AI, requirements, use cases, UI, auth, RBAC, export or extra lifecycle endpoints were added.

## 2. OpenAPI setup

- `@nestjs/swagger` decorators in the controllers (`ApiTags`, `ApiOperation` with explicit `operationId`s: `getHealthLive`, `createProject`, `listProjects`, `getProject`, `createArtifact`, `getArtifact`, `createArtifactVersion`).
- **Single source of truth:** `apps/api/src/openapi/zod-openapi.ts` converts the zod contracts with zod 4's built-in `z.toJSONSchema` (`target: 'openapi-3.0'`) into request bodies, query parameters (one per property of `listProjectsQuerySchema`) and response schemas. No validation rule is declared twice, and no DTO classes or extra converter library were added. Path parameters use a UUID schema derived from `z.uuid()`.
- Documented routes: `GET /health/live`, `POST /projects`, `GET /projects`, `GET /projects/{projectId}`, `POST /projects/{projectId}/artifacts`, `GET /projects/{projectId}/artifacts/{artifactId}`, `POST /projects/{projectId}/artifacts/{artifactId}/versions`. No `/health/ready`; nothing undocumented or non-existent.
- Status codes: 200/201 success; 400 invalid input; 404 unknown project/workspace/artifact-in-project; 422 unknown artifact type. Error body schema (`apiErrorResponseSchema`) has `message` plus optional `error`, `statusCode`, `errors[{path,message}]` and exposes no database/internal details.
- **Interactive docs:** `setupOpenApi` serves Swagger UI at `/docs` and JSON at `/docs/openapi.json` only when `NODE_ENV !== 'production'`; in production neither is served (404).
- **Deterministic machine-readable document:** `pnpm build && pnpm openapi:generate` writes `apps/api/openapi/openapi.json` (git-ignored) using Nest preview mode — no HTTP server, no database. Two consecutive generations were byte-identical (`cmp`). API version constant `0.1.0` is asserted equal to the root `package.json` version.

## 3. OpenAPI test

`apps/api/src/openapi/openapi.spec.ts` (10 tests, real `AppModule`, only `PrismaService` replaced; no infrastructure). It asserts contract existence/shape, not formatting, and does not snapshot the document:

- the exact set of `METHOD path` routes (and no `/health/ready`);
- version and the set of operation ids;
- request bodies deep-equal the schemas derived from the zod contracts, and required fields / `additionalProperties: false`;
- artifact creation body has only `type`, `title`, `metadataAuxiliary` (no prefix/status/origin);
- path/query parameters (names, location, required, UUID format);
- status codes per operation and key response schema fields (status enum, `versionNumber` integer, error `message`);
- no leakage of `prisma`, table or column names;
- deterministic rendering and production/non-production docs behavior.

Additionally, the integration suite (`project-artifact-api.integration.spec.ts`) validates real success responses against the response schemas and real 400/404/422 bodies against `apiErrorResponseSchema`, and asserts that `codePrefix` in a request is rejected with 400.

## 4. Coverage threshold

`vitest.config.mts`: `coverage.thresholds = { lines: 70, statements: 70, branches: 70, functions: 70 }` with a comment not to lower it. No per-file 85 % threshold introduced. `pnpm test:coverage` passes:

| Metric     | Result  |
| ---------- | ------- |
| Lines      | 77.85 % |
| Statements | 76.82 % |
| Branches   | 80.76 % |
| Functions  | 83.01 % |

Enforcement checked: `vitest run --coverage --coverage.thresholds.lines=99` fails with "Coverage for lines (77.85%) does not meet global threshold (99%)". No tests were added just to reach the numbers; new tests cover the new OpenAPI behavior.

## 5. codePrefix review result

`codePrefix` **was** exposed in the public request contract (`createArtifactRequestSchema`, constrained only by the regex `^[A-Z][A-Z0-9]{1,7}$`, so a client could open arbitrary code namespaces such as `ZZZ-001`). It has been **removed** from the public HTTP contract and from the OpenAPI document. It remains an **internal service capability** (`ArtifactsService.createArtifact(..., { codePrefix })`), still protected by the database CHECK on prefix format, for the future RNF use in Increment 1D. Artifact codes from HTTP always use the type's default prefix (`REQUIREMENT` → `RF`). `RequirementType` was not implemented; artifact type allocation was not redesigned. This supersedes the earlier 1A report statement that HTTP clients could pass `codePrefix`.

## 6. Dependencies added

| Package           | Version | Where                          |
| ----------------- | ------- | ------------------------------ |
| `@nestjs/swagger` | 11.4.7  | `apps/api` (dependency, exact) |

Chosen as the latest 11.x release: its peer range is `@nestjs/core|common ^11.0.1` (compatible with the pinned 11.2.3; `@nestjs/swagger` 12.x requires Nest 12). Its optional peers (`class-validator`, `class-transformer`, `@fastify/static`) were not installed. `pnpm-workspace.yaml` gained `'@scarf/scarf': false` in `allowBuilds`: a transitive telemetry install script of Swagger UI is explicitly denied (pnpm otherwise fails the install with `ERR_PNPM_IGNORED_BUILDS`). `pnpm-lock.yaml` was updated by pnpm.

## 7. Verified

All executed in this session; each passed unless noted.

- `pnpm install --frozen-lockfile`
- `pnpm format:check`
- `pnpm lint` (one `no-explicit-any` error in my new spec was found and fixed with a justified line-level disable; rerun clean)
- `pnpm typecheck`
- `pnpm build`
- `pnpm test` — 69 tests, 13 files
- `pnpm test:coverage` — passes with the 70 % thresholds (numbers above)
- `pnpm verify` (format:check → lint → typecheck → build → test → test:coverage) — exit 0
- `pnpm db:validate`, `pnpm db:test:prepare`, `pnpm db:test:migrate` (no pending migrations), `pnpm test:integration` — 42 tests, 6 files
- `pnpm verify:integration` — exit 0 (42 tests)
- `pnpm openapi:generate` — document written with the 6 path keys / 7 operations; two runs byte-identical.
- Live compiled API smoke: `/docs` → 200, `/docs/openapi.json` served, invalid `POST /projects` → 400 with the documented error shape; server stopped afterwards.

Infrastructure: the isolated PostgreSQL 18 + pgvector container from 1A (`caseflow-verify-pg`, port 5433) — the native PostgreSQL on 5432 was not touched.

## 8. Not verified

- GitHub Actions was not run (nothing was verified locally on its behalf). CI files were not changed in this task.
- Swagger UI was checked only for HTTP 200 and the JSON document, not rendered in a browser.
- OpenAPI 3.0 output was not fed to a client generator or an external OpenAPI validator.
- `pnpm dev:api` (ts-node watch) was not run; the compiled API was.
- `pnpm infra:up` (project Compose stack) was not used.

## 9. Git status

- Branch: `feature/deliverable1-foundation` (from `develop` = `origin/main` = `v0.1.0`).
- No commit, push, merge or tag. All 1A and 1A.1 work is in the working tree.
- New in 1A.1: `apps/api/src/openapi/` (4 files), `packages/contracts/src/common/`, this report. Modified in 1A.1: the three controllers, `main.ts`, contracts (`index.ts`, project/artifact/health), `apps/api/package.json`, root `package.json` (`openapi:generate`), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `vitest.config.mts`, `.gitignore`, `.prettierignore`, `README.md`, spec §218.1, related tests.
- No attribution, co-author or tool credit was added anywhere; Git identity untouched; `instruction.md` remains git-ignored.
