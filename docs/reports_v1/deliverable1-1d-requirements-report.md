# Increment 1D — Requirements

## 1. Implemented

Requisitos manuales y candidatos IA persistidos, versionados, revisables y aislados por proyecto.

## 2. Requirement data model

Tablas: `requirement_details` (`artifact_version_id`, `requirement_type`, `name`, `description`, `priority`, `generation_candidate_id`, `source_context_version_id`, `ai_run_id`); `requirement_actors` (`id`, `artifact_version_id`, `position`, `name`); `requirement_preconditions` y `requirement_postconditions` (`id`, `artifact_version_id`, `position`, `description`); y `requirement_dependencies` (`id`, `artifact_version_id`, `depends_on_artifact_id`).

## 3. Requirement type / code strategy

`FUNCTIONAL → RF`; `NON_FUNCTIONAL → RNF`. El servicio asigna el prefijo; el cliente no lo envía.

## 4. Manual workflow

Creación y nuevas versiones completas funcionan con `AI_PROVIDER=disabled`; origen `MANUAL`, estado `DRAFT`.

## 5. AI generation workflow

Usa una versión exacta de Project Context, `AIOrchestrator`, validación Zod y persistencia separada de candidatos.

## 6. Prompt/schema

Prompt exacto `requirements.generate@1`. Máximo 20 candidatos; valores recortados/no vacíos, colecciones acotadas, IDs únicos, referencias existentes, sin duplicados, autorreferencias ni ciclos.

## 7. Candidate persistence

`requirement_generations` (`id`, `project_id`, `source_context_version_id`, `ai_run_id`, `created_at`), `requirement_candidates` y `requirement_candidate_dependencies`. Los candidatos no son ArtifactVersion.

## 8. Acceptance workflow

Transacción única. Solo crea seleccionados; una dependencia no seleccionada rechaza toda la operación. Dependencias aceptadas se resuelven a Artifact IDs.

## 9. Lifecycle/review

Endpoint de transición sobre versión de requisito; reutiliza el lifecycle genérico y bloquea transiciones inválidas y edición de aprobados.

## 10. Provenance

`RequirementDetail → RequirementCandidate → RequirementGeneration → AIRun → source Project Context ArtifactVersion`, con enlaces directos a `ai_run_id` y `source_context_version_id`.

## 11. Database migration

`20260921232355_requirements`; constraints, FKs, checks, triggers de tipo/aislamiento/inmutabilidad y unicidad.

## 12. API

- `POST/GET /projects/{projectId}/requirements`
- `GET /projects/{projectId}/requirements/{requirementId}`
- `POST /projects/{projectId}/requirements/{requirementId}/versions`
- `POST /projects/{projectId}/requirements/generate`
- `GET /projects/{projectId}/requirements/generations/{generationId}`
- `POST /projects/{projectId}/requirements/generations/{generationId}/accept`
- `POST /projects/{projectId}/requirements/{requirementId}/versions/{versionId}/transition`

## 13. OpenAPI

Rutas y cuerpos derivados de contratos Zod; generación determinista verificada.

## 14. Tests

111 unitarios y 55 de integración aprobados; cubren contratos, flujo manual, versiones, IA fake, aceptación, dependencias, ciclo de vida, aislamiento y migración. Sin red IA.

## 15. Coverage

Statements 74.18%, branches 70.24%, functions 78.66%, lines 75.43%.

## 16. Real-provider verification

No ejecutada: no se configuró credencial real. El adapter exige `/chat/completions` y soporte `json_schema` estricto.

## 17. Dev/test parity

La misma historia oficial de cinco migraciones se aplicó al entorno de prueba; no se usó `db push`.

## 18. Verified

`pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm db:validate`, `pnpm verify:integration`, `pnpm openapi:generate`, `git diff --check`.

## 19. Not verified

Proveedor real y frontend; no eran requisitos ejecutables sin credenciales/navegación de proyecto.

## 20. Relevant decisions

Los candidatos conservan listas auxiliares JSON; el Requirement oficial queda normalizado. Dependencias forman DAG al validarse candidatos. La IA deshabilitada solo bloquea generación; manual/versionado/revisión continúan.

## 21. Git branch/status

Rama `feature/requirements`, cambios sin commit/push/merge; stash previo intacto. No se inició 1E.

Comandos ejecutados: inspección `git status/branch/stash/log/diff`; `git fetch`; sincronización y creación de rama; búsquedas `rg`; `pnpm prisma migrate dev --name requirements --create-only`; `pnpm format`; `pnpm db:validate`; `pnpm db:generate`; `pnpm typecheck`; `pnpm test`; `pnpm test:coverage`; `pnpm install --frozen-lockfile`; `pnpm verify`; `pnpm verify:integration`; `pnpm openapi:generate`; `git diff --check`; Docker temporal PostgreSQL/pgvector en puerto 55432 y su eliminación.
