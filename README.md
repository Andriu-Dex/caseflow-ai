# CASEFlow AI

## What CASEFlow AI is

CASEFlow AI is an integrated, AI-assisted I-CASE (Computer-Aided Software Engineering) platform for managing software projects end-to-end: knowledge intake, requirements and analysis, design, traceability, and — eventually — controlled forward engineering into a running generated project. It is built to remain generic (no hardcoded business domain), multi-workspace, multi-project, structured, versioned, and usable without any AI provider connected.

## Current status

This repository currently implements **Increment 0 — Foundation** only: a working pnpm/TypeScript monorepo, the three Foundation applications (web, API, worker), local infrastructure, Prisma/PostgreSQL wiring, and a Vitest-based quality/testing baseline. **No product functionality exists yet** — no authentication, no Workspace/Project/Artifact model, no AI integration, no code generation. Those belong to later increments.

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
  ai              AI orchestration placeholder
  integrations    external-integration placeholder
  config          shared configuration placeholder
prisma/         Prisma schema and migrations (PostgreSQL + pgvector)
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
pnpm dev
```

`pnpm dev` runs the web, API, and worker together (via `concurrently`); use `pnpm dev:web` / `pnpm dev:api` / `pnpm dev:worker` to run just one.

## Local URLs

| Service      | URL                               |
| ------------ | --------------------------------- |
| Web          | http://localhost:3000             |
| API health   | http://localhost:3001/health/live |
| Mailpit UI   | http://localhost:8025             |
| SeaweedFS S3 | http://localhost:8333             |

## Quality commands

| Command                 | Purpose                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`           | The full infrastructure-independent quality gate: format check, lint, typecheck, build, unit tests, coverage. Never starts Docker or touches a database.          |
| `pnpm test`             | The normal deterministic test suite for everyday use.                                                                                                             |
| `pnpm test:unit`        | Tests that require no external infrastructure.                                                                                                                    |
| `pnpm test:integration` | Tests that require infrastructure to already be running (currently: PostgreSQL). Use `pnpm verify:integration` if you also need the test database prepared first. |
| `pnpm test:coverage`    | The unit suite with coverage instrumentation and a report.                                                                                                        |

## Infrastructure commands

| Command             | Purpose                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm infra:up`     | Start PostgreSQL, Redis, SeaweedFS, and Mailpit via Docker Compose.                                       |
| `pnpm infra:down`   | Stop the containers. **Named volumes (and therefore your data) are preserved** — this never deletes them. |
| `pnpm infra:status` | Show container/health status.                                                                             |
| `pnpm infra:logs`   | Follow logs for all infrastructure containers.                                                            |

## Database commands

| Command                | Purpose                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm db:validate`     | Validate `prisma/schema.prisma`.                                                                                                                       |
| `pnpm db:migrate`      | Apply pending Prisma migrations (`prisma migrate deploy`).                                                                                             |
| `pnpm db:test:prepare` | Idempotently create the isolated `caseflow_test` database (if missing) and enable pgvector in it. Portable — works the same on Windows, Linux, and CI. |

- **`caseflow`** is the normal local development database.
- **`caseflow_test`** is a separate, isolated database used only by integration tests. It is never read or written by the running applications.

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
- **`AGENTS.md`** is the operational contract for AI coding agents working in this repository — stricter and narrower than the spec, but must never contradict it.

When the two disagree, `docs/CASEFLOW_AI_SPEC.md` wins (see `AGENTS.md`'s own instruction-priority rules).
