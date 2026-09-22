# CASEFlow AI

## What CASEFlow AI is

CASEFlow AI is an integrated, AI-assisted I-CASE (Computer-Aided Software Engineering) platform for managing software projects end-to-end: knowledge intake, requirements and analysis, design, traceability, and — eventually — controlled forward engineering into a running generated project. It is built to remain generic (no hardcoded business domain), multi-workspace, multi-project, structured, versioned, and usable without any AI provider connected.

## Current status

This repository implements Foundation through **Increment 1F.1 — Diagram Rendering Stabilization**. It supports structured/versioned RF/RNF, Use Cases and conceptual ER models, candidate-first AI generation, exact provenance, and deterministic Mermaid ER/PlantUML Use Case sources rendered into real graphical SVG by a local, self-hosted Kroki deployment (never a public endpoint) behind a `DiagramProvider` abstraction, with renderer output sanitized through an explicit XML allowlist before being persisted or returned.

Delivery is currently prioritized around the **First Deliverable MVP** (requirements, use cases, data model, navigation, architecture, UI blueprint/mockups, review, versioning and basic traceability). See `docs/FIRST_DELIVERABLE_MVP.md` and `docs/CASEFLOW_AI_SPEC.md` §217–§219.

## Technology foundation

- **Language:** TypeScript, end to end.
- **Frontend:** Next.js (App Router) + React + Tailwind CSS.
- **Backend:** NestJS (API) and a standalone NestJS application context (worker).
- **Database:** PostgreSQL 18 with the pgvector extension, managed with Prisma 7 (Prisma Migrate).
- **Queue/cache:** Redis 8 (provisioned; no application usage yet).
- **Object storage:** SeaweedFS, S3-compatible (provisioned; no application usage yet).
- **Email (dev):** Mailpit (provisioned; no application usage yet).
- **Workspace manager:** pnpm workspaces (no Turborepo).
- **Testing:** Vitest, with NestJS testing utilities + Supertest for HTTP-level tests.
- **Containers:** Docker Compose for local infrastructure only (the applications themselves run as normal local Node processes in Foundation — no Dockerfiles yet).

## Prerequisites

- Git
- Node.js 24 (see `.nvmrc`)
- pnpm 11.27.0 (`packageManager` is pinned in `package.json`; Corepack will resolve it automatically)
- Docker Engine / Docker Desktop with Compose v2 (Docker Desktop must be **running** before `pnpm infra:up` — see Troubleshooting)

## Repository structure

```
apps/web        Next.js web application (port 3000)
apps/api        NestJS API application (port 3001)
apps/worker     Standalone NestJS worker (no HTTP server)
packages/*      Shared workspace libraries:
  domain          framework-free domain placeholder
  contracts       shared API contracts/types (CommonJS, consumable by apps/api)
  ui              shared UI package (ESM, for apps/web)
  ai              provider-independent AI contracts and orchestration
  integrations    OpenAI-compatible provider adapter
  config          validated shared configuration
prisma/         Prisma schema and migrations (PostgreSQL + pgvector)
scripts/        Portable Node scripts for database preparation, migration and seeding
infra/          Local infrastructure: infra/docker/compose.yml and related config
docs/           Product/architecture specification and completion reports
```

## Local setup

Clone the repository, then:

**POSIX (macOS/Linux/WSL/Git Bash):**

```bash
git clone https://github.com/Andriu-Dex/caseflow-ai.git
cd caseflow-ai
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:test:prepare
pnpm db:test:migrate
pnpm db:seed:dev
pnpm dev
```

**Windows PowerShell:**

```powershell
git clone https://github.com/Andriu-Dex/caseflow-ai.git
cd caseflow-ai
Copy-Item .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:test:prepare
pnpm db:test:migrate
pnpm db:seed:dev
pnpm dev
```

`pnpm install` also generates the Prisma client (`postinstall`). `pnpm dev` runs the web, API, and worker together (via `concurrently`); use `pnpm dev:web` / `pnpm dev:api` / `pnpm dev:worker` to run just one.

AI is optional. The default `AI_PROVIDER=disabled` starts the API without a key and preserves all manual functionality. To enable the adapter, set `AI_PROVIDER=openai_compatible` together with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and optionally `AI_TIMEOUT_MS`. Requirements and Use Cases expose optional candidate-generation routes; with the disabled provider they return `AI_NOT_CONFIGURED`.

The OpenAI-compatible adapter specifically requires `POST {AI_BASE_URL}/chat/completions` with strict `json_schema` response support; compatibility with every OpenAI-like provider is not implied. Normal tests never call a live provider.

Diagram rendering (Data Model ER / Use Case Diagram) requires local Kroki, started by `pnpm infra:up`. Set `DIAGRAM_RENDERER=kroki` and `KROKI_BASE_URL=http://localhost:8000` (both already in `.env.example`), and optionally `DIAGRAM_RENDER_TIMEOUT_MS`. With `DIAGRAM_RENDERER=disabled` (or unset) the API starts without attempting any outbound call, but an actual diagram creation/generation request then fails with `DIAGRAM_NOT_CONFIGURED`; unit and ordinary integration tests never depend on a live renderer (they use `FakeDiagramProvider`). Kroki is always self-hosted — CASEFlow never calls the public kroki.io service.

## Local URLs

| Service      | URL                                              |
| ------------ | ------------------------------------------------ |
| Web          | http://localhost:3000                            |
| API health   | http://localhost:3001/health/live                |
| API (1A)     | http://localhost:3001/projects                   |
| Swagger UI   | http://localhost:3001/docs (non-production only) |
| Mailpit UI   | http://localhost:8025                            |
| SeaweedFS S3 | http://localhost:8333                            |
| Kroki        | http://localhost:8000 (local only, not public)   |

## Quality commands

| Command                   | Purpose                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`             | The full infrastructure-independent quality gate: format check, lint, typecheck, build, unit tests, coverage. Never starts Docker or touches a database.                                                                        |
| `pnpm test`               | The normal deterministic test suite for everyday use.                                                                                                                                                                           |
| `pnpm test:unit`          | Tests that require no external infrastructure.                                                                                                                                                                                  |
| `pnpm test:integration`   | Tests that require infrastructure to already be running (PostgreSQL, and local Kroki for the real-renderer suite) and a migrated `caseflow_test`. Use `pnpm verify:integration` to prepare and migrate the test database first. |
| `pnpm verify:integration` | `db:test:prepare` → `db:test:migrate` → `test:integration`. Only ever touches `caseflow_test`.                                                                                                                                  |
| `pnpm test:coverage`      | The unit suite with coverage instrumentation and a report.                                                                                                                                                                      |

## OpenAPI

The API's OpenAPI document is generated from the same zod contracts (`packages/contracts`) that validate requests. Interactive Swagger UI is served at `/docs` (JSON at `/docs/openapi.json`) only when `NODE_ENV` is not `production`. To write the document to `apps/api/openapi/openapi.json` (git-ignored, deterministic, no database required) run `pnpm build && pnpm openapi:generate`.

Project Context uses the semantic routes `POST /projects/{projectId}/context`, `GET /projects/{projectId}/context`, and `POST /projects/{projectId}/context/versions`. Generic artifact creation intentionally rejects `PROJECT_CONTEXT`.

## Infrastructure commands

| Command             | Purpose                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm infra:up`     | Start PostgreSQL, Redis, SeaweedFS, Mailpit, and local Kroki (diagram rendering) via Docker Compose.      |
| `pnpm infra:down`   | Stop the containers. **Named volumes (and therefore your data) are preserved** — this never deletes them. |
| `pnpm infra:status` | Show container/health status.                                                                             |
| `pnpm infra:logs`   | Follow logs for all infrastructure containers.                                                            |

## Database commands

| Command                | Purpose                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:validate`     | Validate `prisma/schema.prisma`.                                                                                                                          |
| `pnpm db:migrate`      | Apply pending Prisma migrations (`prisma migrate deploy`).                                                                                                |
| `pnpm db:generate`     | Generate the Prisma client into `apps/api/src/generated/prisma` (git-ignored; also runs on `pnpm install`).                                               |
| `pnpm db:test:prepare` | Idempotently create the isolated `caseflow_test` database (if missing) and enable pgvector in it. Portable — works the same on Windows, Linux, and CI.    |
| `pnpm db:test:migrate` | Apply the same official Prisma migrations to `caseflow_test` only. Refuses to run against the development database or any database not ending in `_test`. |
| `pnpm db:seed:dev`     | Development-only, idempotent seed: creates the `dev-workspace` Workspace (there is no Identity/Workspace management yet). Prints its `workspaceId`.       |

- **`caseflow`** is the normal local development database.
- **`caseflow_test`** is a separate, isolated database used only by integration tests. It is never read or written by the running applications. Both databases are built from the same `prisma/migrations` history; `db:push` is never used.

## Troubleshooting

**A native PostgreSQL service may already occupy port 5432.** This was discovered during Foundation development on Windows: if a PostgreSQL server is already installed and running natively (outside Docker), it will conflict with this project's Dockerized PostgreSQL, which also needs port 5432.

Diagnose it in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 5432
Get-Service *postgres*
```

If a native PostgreSQL service is running, you will likely need to stop it while working on CASEFlow AI (for example `Stop-Service postgresql-x64-<version>` or via `services.msc`), then retry `pnpm infra:up`. **CASEFlow AI will not do this automatically** — stopping a system service is your decision to make.

**Docker Desktop must be running before `pnpm infra:up`.** On Windows, start Docker Desktop and wait for it to report "running" before bringing up infrastructure — `docker compose` commands will fail with a connection error to the Docker API otherwise.

## Architecture documentation

- **`docs/CASEFLOW_AI_SPEC.md`** is the authoritative product and architecture specification.
- **`docs/FIRST_DELIVERABLE_MVP.md`** summarizes the current delivery scope (a summary, not a second source of truth).
- **`AGENTS.md`** is the operational contract for AI coding agents working in this repository — stricter and narrower than the spec, but must never contradict it.

When the two disagree, `docs/CASEFLOW_AI_SPEC.md` wins (see `AGENTS.md`'s own instruction-priority rules).
