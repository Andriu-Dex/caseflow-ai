# Foundation 0D — Local Infrastructure — Completion Report

Date: 2026-09-16
Task: Foundation 0D — Local Infrastructure (CASEFlow AI Increment 0)

## 1. Implemented

### Docker Compose (`infra/docker/compose.yml`)

Five services: `postgres`, `redis`, `seaweedfs`, `storage-init` (one-shot bucket bootstrap), `mailpit`. Default Compose network, named volumes only (no bind mounts for data — the SeaweedFS S3 identity config is the one intentional read-only config bind mount, not data).

| Service      | Image                          | Host port(s)                                                 | Named volume     |
| ------------ | ------------------------------ | ------------------------------------------------------------ | ---------------- |
| postgres     | `pgvector/pgvector:0.8.6-pg18` | 5432                                                         | `postgres_data`  |
| redis        | `redis:8.10.1-alpine`          | 6379                                                         | `redis_data`     |
| seaweedfs    | `chrislusf/seaweedfs:4.47`     | 8333 only (master/volume/filer/grpc/IAM ports stay internal) | `seaweedfs_data` |
| storage-init | `amazon/aws-cli:2.36.46`       | none (one-shot, `restart: "no"`)                             | none             |
| mailpit      | `axllent/mailpit:v1.31.1`      | 1025, 8025                                                   | `mailpit_data`   |

### Image version policy

- No `latest`/`dev`/`edge` tags anywhere.
- PostgreSQL/pgvector uses the exact approved tag `pgvector/pgvector:0.8.6-pg18`.
- Redis: latest stable 8.x Alpine patch found on the registry, `8.10.1-alpine`.
- Mailpit: latest stable release found, `v1.31.1` (≥ 1.30.0 as required; note the upstream image's current tagging convention uses a `v` prefix — `axllent/mailpit:1.31.1` without `v` does not exist).
- SeaweedFS: inspected `chrislusf/seaweedfs` (the official open-source Community image; there is no separate "Enterprise" tag in this repository — SeaweedFS Enterprise is a distinct commercial offering, not a Docker Hub tag), used the latest stable numeric release, `4.47`.
- All four pulled and their digests resolved locally (see section 4 below).

### PostgreSQL

- `POSTGRES_USER=caseflow`, `POSTGRES_PASSWORD=caseflow-local-dev`, `POSTGRES_DB=caseflow`, reachable at `localhost:5432`.
- Healthcheck: `pg_isready -U caseflow -d caseflow`.
- **Important fix**: the official image changed its PostgreSQL 18+ data layout convention — mounting the volume directly at `/var/lib/postgresql/data` now causes the container to refuse to start ("these Docker images are configured to store database data in a format which is compatible with `pg_ctlcluster`..."). The volume is mounted at `/var/lib/postgresql` instead (the currently-documented convention for PG 18+), which starts and persists correctly.
- No application tables created via Compose/init scripts — only Prisma Migrate touches schema (see below).

### pgvector

- Established through Prisma Migrate, not a Docker init-script side effect: `prisma/migrations/20260916024257_enable_pgvector/migration.sql` contains exactly `CREATE EXTENSION IF NOT EXISTS vector;`.
- No speculative application tables were created.
- Verified directly in PostgreSQL after applying the migration (and again after a full `infra:down`/`infra:up` cycle) — see Verified section.

### Prisma 7

- Pinned to `prisma@7.10.0` / `@prisma/client@7.10.0` (the only 7.10.x patch currently published; no `7.10.1`+ exists yet).
- `prisma.config.ts` created at the repository root:
  ```ts
  import 'dotenv/config';
  import { defineConfig, env } from 'prisma/config';

  export default defineConfig({
    schema: 'prisma/schema.prisma',
    datasource: {
      url: env('DATABASE_URL'),
    },
  });
  ```
- `dotenv` (`17.4.2`) was added **deliberately** and is required: Prisma 7's config loader does not auto-load `.env` files the way the old CLI did — official Prisma 7 docs are explicit that "environment variables from `.env` files need to be loaded explicitly," via `import 'dotenv/config'` at the top of `prisma.config.ts`. Without it, `env('DATABASE_URL')` resolves to nothing and every Prisma CLI command fails.
- `prisma/schema.prisma` kept minimal — **and had to be simplified further than in Foundation 0A**: Prisma 7 completely **removed** the `datasource.url` property from schema files. Running `prisma validate` with the old `url = env("DATABASE_URL")` line now fails with error `P1012`, explicitly instructing that connection URLs must move to `prisma.config.ts`. The schema now only declares `generator client` and `datasource db { provider = "postgresql" }`, with no models, exactly as instructed.
- No `prisma db push` was used anywhere; Prisma Migrate (`migrate dev --create-only` to scaffold, `migrate deploy` to apply) is the only schema-evolution mechanism used.
- `PrismaClient` was **not** wired into any NestJS module — `@prisma/client` is installed (needed for `prisma generate`/the standard toolchain to be complete) but nothing in `apps/api`/`apps/worker` imports or instantiates it.

### Redis

- `redis:8.10.1-alpine` on port 6379, healthcheck `redis-cli ping | grep -q PONG`.
- No BullMQ, no application Redis client added.

### SeaweedFS

- `chrislusf/seaweedfs:4.47`, run as `weed server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3-config.json`.
- Only port 8333 (S3) is published to the host; master (9333), volume (8080), filer (8888), IAM (8111), gRPC, and Iceberg/Lance ports all stay internal to the Compose network.
- S3 identity/credentials configured through a mounted config file (`infra/docker/seaweedfs/s3-config.json`, read-only bind mount — this is static repository-tracked configuration, not data):
  ```json
  {
    "identities": [
      {
        "name": "caseflow",
        "credentials": [{ "accessKey": "caseflow", "secretKey": "caseflow-local-dev" }],
        "actions": ["Admin", "Read", "Write", "List", "Tagging"]
      }
    ]
  }
  ```
- Data persisted in named volume `seaweedfs_data`.
- **Bucket initialization**: `weed shell`'s interactive REPL proved unreliable to script non-interactively in this environment (its piped-stdin handling hung indefinitely regardless of `-i`/`-t` flags — verified through repeated direct testing, network connectivity to master/grpc/filer ports was confirmed fine, so the hang is in the shell's own input handling, not networking). Rather than fight an unscriptable interactive tool, bucket bootstrap uses a small one-shot `storage-init` service running the official `amazon/aws-cli:2.36.46` image, which issues a real, idempotent S3 `head-bucket`-then-`create-bucket` call against the SeaweedFS S3 endpoint. This is infrastructure bootstrap tooling (a one-off Compose service, `restart: "no"`), not "AWS SDK/StorageProvider application code" — no AWS SDK or S3 client was added to any `apps/*`/`packages/*` package.

### Mailpit

- `axllent/mailpit:v1.31.1`, SMTP on 1025, UI on 8025.
- Named volume `mailpit_data` mounted at `/data`, with `--database=/data/mailpit.db` for persistence (Mailpit supports this natively via its own `-d/--database` flag).
- No EmailProvider or application SMTP sending was implemented.

### `.env.example`

Preserved the existing four variables and added exactly the local infra configuration this task establishes:

```
NODE_ENV=development
API_PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000

DATABASE_URL=postgresql://caseflow:caseflow-local-dev@localhost:5432/caseflow?schema=public
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:8333
S3_BUCKET=caseflow
S3_ACCESS_KEY_ID=caseflow
S3_SECRET_ACCESS_KEY=caseflow-local-dev
S3_REGION=us-east-1
SMTP_HOST=localhost
SMTP_PORT=1025
MAILPIT_UI_URL=http://localhost:8025
```

All values are local-dev-only defaults matching the Compose file; no production secrets. A local `.env` (copied from the example, used only for this session's verification) is confirmed ignored by git (`.gitignore:6:.env`).

### Root scripts

```
pnpm infra:up      → docker compose -f infra/docker/compose.yml up -d
pnpm infra:down    → docker compose -f infra/docker/compose.yml down   (no -v; never deletes volumes)
pnpm infra:status  → docker compose -f infra/docker/compose.yml ps
pnpm infra:logs    → docker compose -f infra/docker/compose.yml logs -f
pnpm db:validate   → prisma validate
pnpm db:migrate    → prisma migrate deploy
```

No destructive `down -v`/reset script was added, per instructions.

## 2. Verified

All commands below were actually executed:

- `pnpm install` → succeeded (all 10 workspace projects). Required approving two previously-blocked install scripts (`@prisma/engines`, `prisma`) via pnpm 11's `allowBuilds` mechanism in `pnpm-workspace.yaml` — this is the supported approval flow for legitimately-needed install scripts, not a bypass of the protection.
- `docker compose -f infra/docker/compose.yml config` → valid, no errors.
- `pnpm infra:up` → all five services created; `postgres`, `redis`, `seaweedfs`, `mailpit` reached `healthy`; `storage-init` ran to completion (`Exited (0)`).
- **PostgreSQL**: container healthy; `psql -U caseflow -d caseflow` connects; `SHOW server_version` → `18.6`; `pg_isready` healthcheck green.
- **pgvector**: `pnpm db:migrate` (`prisma migrate deploy`) applied `20260916024257_enable_pgvector`; then verified directly in PostgreSQL: `SELECT extname, extversion FROM pg_extension WHERE extname='vector'` → `vector | 0.8.6`. Re-verified again after a full `infra:down`/`infra:up` cycle — still present.
- `pnpm db:validate` (`prisma validate`) → `The schema at prisma\schema.prisma is valid`.
- **Redis**: `redis-cli ping` → `PONG` (both before and after the down/up cycle).
- **SeaweedFS**: healthy container; S3 endpoint responds on `localhost:8333` (`curl` → HTTP 403 for an unsigned anonymous request — a real HTTP response proving the service is up; a signed `aws s3api list-buckets` call succeeds); bucket `caseflow` confirmed to exist via `aws s3api list-buckets`, both from inside the Compose network and reachable on the host port.
- **Mailpit**: healthy container; `curl http://localhost:8025/` → HTTP 200; SMTP port 1025 confirmed listening on the host via `netstat`.
- `pnpm format:check` → passed.
- `pnpm lint` → passed.
- `pnpm typecheck` → passed (all 9 packages/apps).
- `pnpm build` → passed (all 9 packages/apps, including `apps/web`'s `next build`).
- **Persistence across `infra:down` → `infra:up`**: `pnpm infra:down` stopped and removed all 5 containers and the network; `docker volume ls` confirmed all four named volumes (`postgres_data`, `redis_data`, `seaweedfs_data`, `mailpit_data`) still existed. `pnpm infra:up` recreated containers against the same volumes; re-verified afterward:
  - `pg_extension` still shows `vector 0.8.6` and `_prisma_migrations` still lists `20260916024257_enable_pgvector` — the database survived, no migration reran.
  - `aws s3api list-buckets` still shows bucket `caseflow` with the **same original `CreationDate`** (`2026-09-16T02:22:41Z`) as before the restart — proof the bucket was not silently recreated, i.e., SeaweedFS data genuinely persisted.
  - `storage-init`'s logs after the restart are empty (its idempotent `head-bucket` check succeeded silently; it did not need to fall back to `create-bucket`).
  - Redis `PONG` and Mailpit HTTP 200 reconfirmed after the restart too.

## 3. Not verified

- Mailpit's own message persistence (sending a real test email through SMTP 1025 and confirming it survives a restart) was not exercised — only the service's reachability and its `--database` file-backed persistence configuration were verified. No EmailProvider exists yet to send anything through it.
- No automated test suite covers this infrastructure; all verification above is direct CLI/HTTP/SQL inspection, matching the scope of an infrastructure-foundation task.
- Long-running stability (multi-hour uptime, resource limits under load) was not tested — only functional health and basic persistence.

## 4. Relevant notes — explicit answers

**Exact image tags and resolved digests:**

| Image                                           | Digest                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `pgvector/pgvector:0.8.6-pg18`                  | `sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a` |
| `redis:8.10.1-alpine`                           | `sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576` |
| `chrislusf/seaweedfs:4.47`                      | `sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882` |
| `axllent/mailpit:v1.31.1`                       | `sha256:98b916bd3c8d61f7633a52d3ea2f58d00620cb01ca57ab59edde68c347a95365` |
| `amazon/aws-cli:2.36.46` (infra bootstrap only) | `sha256:eedfdcb56e9a1b02fabcf656977ca226f40860c6672aca41d435e036bc95a075` |

**Docker health status**: `postgres`, `redis`, `seaweedfs`, `mailpit` all report `healthy` via their configured healthchecks; `storage-init` is a one-shot job that exits `0`.

**Named volumes created**: `postgres_data`, `redis_data`, `seaweedfs_data`, `mailpit_data` (all Docker-managed named volumes, no host bind mounts for data).

**Exact Prisma version**: `prisma@7.10.0` and `@prisma/client@7.10.0` (pinned; the CLI itself notes a `8.0.0-rc.15` pre-release exists, deliberately not used).

**Prisma 7 configuration structure**: `prisma.config.ts` at the repo root (`defineConfig` from `prisma/config`, `schema` + `datasource.url` via `env('DATABASE_URL')`), paired with a schema-only `prisma/schema.prisma` that no longer carries a `url` field at all (removed per Prisma 7's own validation rules).

**Migration created**: `prisma/migrations/20260916024257_enable_pgvector/migration.sql` — exactly `CREATE EXTENSION IF NOT EXISTS vector;`, nothing else.

**Proof pgvector is installed**: `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';` → `vector | 0.8.6`, checked both immediately after migration and after a full infra restart.

**Redis PONG result**: `PONG`, both before and after the restart cycle.

**SeaweedFS S3/bucket verification**: S3 endpoint responds on `localhost:8333` (HTTP 403 unsigned / 200 signed); bucket `caseflow` exists and was confirmed via `aws s3api list-buckets` from both inside the Compose network and against the host-published port.

**Mailpit UI/SMTP verification**: `http://localhost:8025/` → HTTP 200; SMTP port 1025 confirmed listening on the host.

**Persistence across `infra:down` → `infra:up`**: yes, confirmed for PostgreSQL (extension + migration history) and SeaweedFS (bucket, same creation timestamp) — see Verified section for full detail.

**Dependencies added and justification**:

- `prisma` (dev) / `@prisma/client` — the approved ORM toolchain this task explicitly required.
- `dotenv` (dev) — required by Prisma 7's `prisma.config.ts` loader, which does not auto-load `.env` files (see above); used only by that one config file, not by application code.
- `amazon/aws-cli:2.36.46` — a **Docker image**, not an npm/application dependency — used solely as a one-shot infra-bootstrap container to create the SeaweedFS bucket via real S3 API calls, after SeaweedFS's own `weed shell` proved unscriptable in this environment. No AWS SDK was added to any application package.

**Windows/Docker Desktop limitations encountered**:

1. Docker Desktop's daemon was not running at task start and had to be launched (`Docker Desktop.exe`) before any `docker`/`docker compose` command would work.
2. **A pre-existing native Windows PostgreSQL 18 service (`postgresql-x64-18`) was already bound to host port 5432**, colliding with the Compose file's required `5432:5432` mapping and causing intermittent/confusing connection errors (an `ECONNRESET` from a raw TCP test, and a misleading Prisma `P1000` authentication error, depending on which of the two listeners handled a given connection). This was **not** something this session could resolve alone: stopping a Windows service requires administrator privileges, which this session does not have (`Stop-Service`/`net stop` both failed with "access denied"). The user was asked and explicitly chose to stop the native service (`net stop postgresql-x64-18`) themselves in an elevated context; afterward, `netstat` confirmed only Docker's proxy remained on port 5432, and every subsequent Postgres/Prisma operation worked correctly. This is a durable environment fact worth remembering for any future work on this machine: **a native PostgreSQL 18 install exists locally and will conflict with this project's Dockerized Postgres on port 5432 whenever both try to run at once.**
3. `git bash`'s MSYS path-conversion mangled `docker run --entrypoint /usr/bin/weed ...`-style absolute-path arguments (rewriting them into invalid Windows paths) until `MSYS_NO_PATHCONV=1` was set for those specific commands — a shell-tooling quirk of this environment, not a Docker or project issue.

Per the task instructions, **Foundation 0E was not started**.
