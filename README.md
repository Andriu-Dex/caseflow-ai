# CASEFlow AI

## What CASEFlow AI is

CASEFlow AI is an integrated, AI-assisted I-CASE (Computer-Aided Software Engineering) platform for managing software projects end-to-end: knowledge intake, requirements and analysis, design, traceability, and — eventually — controlled forward engineering into a running generated project. It is built to remain generic (no hardcoded business domain), multi-workspace, multi-project, structured, versioned, and usable without any AI provider connected.

## Get started

Pick the way that fits you. The installation guides are written in Spanish, like the application.

| I want to…                         | Use                             | You need                                                          | Guide                                              |
| ---------------------------------- | ------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Try it or use it on my own machine | **Desktop installer** (Windows) | Windows 10/11; Docker Desktop only to validate generated projects | [docs/install-desktop.md](docs/install-desktop.md) |
| Run it for a team, or on a server  | **Docker Compose**              | Docker with Compose v2                                            | [docs/install-docker.md](docs/install-docker.md)   |
| Develop or contribute              | **From source**                 | Node 24, pnpm, Docker                                             | [Local setup](#local-setup) below                  |

Both installable editions work without any AI provider; AI is optional in each.

## Current status

This repository implements the complete **First Deliverable MVP**: Project Sources (typed intake, local text/PDF extraction, manual image/audio transcription fallback, structured interpretation/report), Project Context, ISO/IEC/IEEE 29148:2018-aligned Requirements, Use Cases, a conceptual Data Model with a deterministic ER diagram, Navigation/Software Architecture/System Architecture with deterministic diagrams, a UI Blueprint with deterministic Mockups, staleness (potential-impact) analysis, an exact-version Traceability graph, a 13-stage Readiness evaluation, and JSON/HTML Export — all with candidate-first AI generation where a provider is configured **and** a fully manual, non-AI creation path for every artifact type (CASEflow remains usable end to end with `AI_PROVIDER=disabled`). See `docs/FIRST_DELIVERABLE_MVP.md` and `docs/CASEFLOW_AI_SPEC.md` §217–§219.

`apps/web` is the real CASEflow web application (not the Next.js scaffold): project/workspace discovery, all artifact pages, trusted diagram/mockup rendering, and export downloads, organized by user lifecycle rather than by database table.

Diagram/Mermaid/PlantUML sources are rendered into real graphical SVG by a local, self-hosted Kroki deployment (never a public endpoint) behind a `DiagramProvider` abstraction, with renderer output sanitized through an explicit XML allowlist before being persisted or returned, and displayed in the browser only through one trusted-SVG boundary component.

Both a Playwright browser E2E scenario proving the no-AI flow and a second scenario proving real diagram/traceability/readiness/export integration run against local infrastructure only (see `pnpm run test:e2e` below) — no external AI provider, no public renderer.

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
- **Containers:** `infra/docker/compose.yml` starts the development infrastructure (the applications run as local Node processes). `infra/docker/compose.app.yml` runs the whole application from `infra/docker/Dockerfile` (see [docs/install-docker.md](docs/install-docker.md)).

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

The API and worker load the root `.env` in both `dev` and `start`. Mockup jobs require a non-empty `INTERNAL_JOBS_SECRET` shared by both processes, plus Redis and `API_INTERNAL_URL`. Start only one instance of each app: web uses port 3000 and API uses port 3001.

AI is optional. The default `AI_PROVIDER=disabled` starts the API without a key and preserves all manual functionality. To enable the adapter, set `AI_PROVIDER=openai_compatible` together with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and optionally `AI_TIMEOUT_MS`. Requirements and Use Cases expose optional candidate-generation routes; with the disabled provider they return `AI_NOT_CONFIGURED`.

Each project has an AI generation language: `ES` by default or `EN`. The selector beside the active project updates it through `POST /projects/{projectId}/language` with `{ "language": "ES" | "EN" }`. The chosen language applies to AI-generated source reports, project context, requirements, use cases, data models, navigation, software/system architecture, and UI blueprints. Diagram labels inherit the generated content's language. CASEFlow's interface and fixed export headings remain in Spanish.

The OpenAI-compatible adapter specifically requires `POST {AI_BASE_URL}/chat/completions` with strict `json_schema` response support; compatibility with every OpenAI-like provider is not implied. Normal tests never call a live provider.

Diagram rendering (Data Model ER / Use Case Diagram) requires local Kroki, started by `pnpm infra:up`. Set `DIAGRAM_RENDERER=kroki` and `KROKI_BASE_URL=http://localhost:8000` (both already in `.env.example`), and optionally `DIAGRAM_RENDER_TIMEOUT_MS`. With `DIAGRAM_RENDERER=disabled` (or unset) the API starts without attempting any outbound call, but an actual diagram creation/generation request then fails with `DIAGRAM_NOT_CONFIGURED`; unit and ordinary integration tests never depend on a live renderer (they use `FakeDiagramProvider`). Kroki is always self-hosted — CASEFlow never calls the public kroki.io service.

The web app (`apps/web`) talks to the API only through `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`; baked in at build time for a production `next build`, read live in `next dev`) — never a hardcoded URL scattered through components. The API allows cross-origin requests only from `WEB_ORIGIN` (default `http://localhost:3000`; never a wildcard), so set it to the web app's real origin in any non-default deployment. Neither variable carries a secret.

`pnpm-workspace.yaml`'s `allowBuilds.esbuild = true` exists solely because esbuild's own postinstall script downloads its prebuilt platform binary (no arbitrary code) — required for `apps/web`'s Vite/Vitest test runner and for Playwright's bundler; no other package's lifecycle script is enabled by it.

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

| Command                                   | Purpose                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                             | The full infrastructure-independent quality gate: format check, lint, typecheck, build, unit tests, coverage. Never starts Docker or touches a database.                                                                        |
| `pnpm test`                               | The normal deterministic test suite for everyday use.                                                                                                                                                                           |
| `pnpm test:unit`                          | Tests that require no external infrastructure.                                                                                                                                                                                  |
| `pnpm test:integration`                   | Tests that require infrastructure to already be running (PostgreSQL, and local Kroki for the real-renderer suite) and a migrated `caseflow_test`. Use `pnpm verify:integration` to prepare and migrate the test database first. |
| `pnpm verify:integration`                 | `db:test:prepare` → `db:test:migrate` → `test:integration`. Only ever touches `caseflow_test`.                                                                                                                                  |
| `pnpm test:coverage`                      | The unit suite with coverage instrumentation and a report.                                                                                                                                                                      |
| `pnpm --filter @caseflow-ai/web run test` | The frontend's own jsdom-based Vitest suite (`apps/web`), run separately from the root Node-only suite above.                                                                                                                   |
| `pnpm run test:e2e`                       | Playwright browser E2E (both the no-AI Scenario A and the visual/provenance Scenario B), against local Postgres/SeaweedFS/Kroki only. Requires `pnpm infra:up`. Installs its own API/web servers via `playwright.config.ts`.    |

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

**`EADDRINUSE` on 3000 or 3001** means another web/API instance is already listening. Close its original terminal, or inspect the exact process before stopping it:

```powershell
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen | Select-Object LocalPort,OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId=<PID>" | Select-Object ProcessId,ParentProcessId,CommandLine
Stop-Process -Id <PID>
```

Do not start `pnpm dev` and separate `pnpm dev:web`/`pnpm dev:api` instances at the same time.

**A native PostgreSQL service may already occupy port 5432.** This was discovered during Foundation development on Windows: if a PostgreSQL server is already installed and running natively (outside Docker), it will conflict with this project's Dockerized PostgreSQL, which also needs port 5432.

Diagnose it in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 5432
Get-Service *postgres*
```

If a native PostgreSQL service is running, you will likely need to stop it while working on CASEFlow AI (for example `Stop-Service postgresql-x64-<version>` or via `services.msc`), then retry `pnpm infra:up`. **CASEFlow AI will not do this automatically** — stopping a system service is your decision to make.

**Docker Desktop must be running before `pnpm infra:up`.** On Windows, start Docker Desktop and wait for it to report "running" before bringing up infrastructure — `docker compose` commands will fail with a connection error to the Docker API otherwise.

## Desktop edition

`apps/desktop` packages the same API and web app as an Electron application (DEC-117, DEC-120). It runs entirely on loopback:

- **Database:** PGlite (PostgreSQL compiled to WebAssembly, with pgvector), served on port 4802. The official Prisma migrations are applied at startup.
- **API:** port 4801, with an in-process queue (`CASEFLOW_QUEUE_MODE=in-process`, no Redis or worker) and files stored in the user's data folder.
- **Web:** port 4800, as a Next.js standalone server.

Docker is only needed to validate generated code. Without it, planning works, and the code generation page shows an installation assistant.

```bash
pnpm --filter @caseflow-ai/desktop run build:all   # API deploy, web standalone, Electron main
pnpm --filter @caseflow-ai/desktop start           # run from the repository
pnpm --filter @caseflow-ai/desktop run package     # Windows installer in apps/desktop/release
```

Only the Windows installer is packaged for now. End-user installation: [docs/install-desktop.md](docs/install-desktop.md).

Optional settings go in `caseflow.env` inside the app's data folder (`%APPDATA%\CASEFlow AI` on Windows), one `KEY=VALUE` per line. You can set:

- `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`;
- `MOCKUP_PROVIDER`;
- `KROKI_BASE_URL`.

Diagrams are rendered by the public `https://kroki.io` service unless `KROKI_BASE_URL` points to your own Kroki. Secrets are generated on first start and never leave the machine.

**ChatGPT plan (desktop only, DEC-117):** in **Ajustes de IA**, "Continuar con ChatGPT" signs in through the system browser and uses your ChatGPT Plus or Pro plan for AI generation.

- **Credentials:** encrypted with the operating system's secure storage and kept in the Electron main process. The API asks for short-lived access tokens through a loopback broker (port 4803).
- **Usage limit:** reaching it pauses plan requests. Switching to the provider from `caseflow.env` always requires your confirmation.

In the web edition the same button explains how to install the desktop app.

## Architecture documentation

- **`docs/CASEFLOW_AI_SPEC.md`** is the authoritative product and architecture specification.
- **`docs/FIRST_DELIVERABLE_MVP.md`** summarizes the current delivery scope (a summary, not a second source of truth).
- **`AGENTS.md`** is the operational contract for AI coding agents working in this repository — stricter and narrower than the spec, but must never contradict it.

When the two disagree, `docs/CASEFLOW_AI_SPEC.md` wins (see `AGENTS.md`'s own instruction-priority rules).

## License

CASEFlow AI is open source under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
