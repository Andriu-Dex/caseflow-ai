# Plan de implementación — CASEFlow AI v2 (Construction & Code Generation)

> Documento de planificación. **No se modifica código en este paso.** No es código ni sustituye `AGENTS.md`/`docs/CASEFLOW_AI_SPEC.md` — donde este plan y esos documentos difieran, prevalecen ellos. Cada referencia normativa cita su fuente (`AGENTS.md §N`, `spec §N`, `DEC-NNN`).
>
> Nota de nombres: `docs/V1.2_IMPLEMENTATION_PLAN.md` tituló su propio contenido "v2" por error de numeración; ese plan (Identity/RAG/Impact/Consistency/Baselines) ya está cerrado y mergeado a `main`. Este documento es la v2 real en la numeración de negocio: **Construction**, el tramo final del roadmap de `spec §180` (Bloque 11, `spec §149-179`).

---

## 0. Alcance y frontera dura

**Rama de trabajo:** `feat/v2-construction`, creada desde `main` (que al momento de escribir este plan contiene exactamente el estado de v1.2 + la ronda de estabilización, PR #34 ya aprobado y mergeado).

**Esta v2 incluye**, en el orden de dependencia dado por `spec §194-198` (Incrementos 13-17):

1. Construction Foundation (entidades base, `TargetTemplate`, catálogo de dependencias)
2. Generation Plan + Design Gate (GenerationPlan → Conceptual Model → Navigation/UIBlueprint → Mockup → Design Baseline)
3. Implementation Plan + Data/API (ImplementationPlan → Logical/Physical Model → Prisma → OpenAPI)
4. Backend/Client/Frontend Generation (NestJS → API client TS → Next.js)
5. Tests/Sandbox/Auto-repair/Export (pruebas generadas, sandbox Docker, auto-repair, snapshot, ZIP)

**Esta v2 EXPLÍCITAMENTE NO incluye** (fuera de alcance, no tocar; `DEC-108`, `DEC-109`, `DEC-113`, `DEC-114`, `AGENTS.md §8/§53`):

- Preview hospedado temporal (P1, `DEC-108`).
- Git push automático o despliegue automático del proyecto generado (`DEC-109`).
- Sincronización bidireccional (reverse engineering de cambios externos al código generado, `DEC-113`).
- Otro `TargetTemplate` además de `CASEFLOW_WEB_TS_V1` (Django, Spring, mobile, microservicios — `DEC-110`, `AGENTS.md §6/§63`).
- Project Assistant, BYOK avanzado, roles custom, template builder, Figma, Kubernetes, Terraform, colaboración en tiempo real, dashboards avanzados (`AGENTS.md §8`, ya prohibidos mientras el P0 de V1 esté incompleto).
- Validación de generalidad en ≥2 dominios distintos (`DEC-114`) — se ejecuta **después** de que los 5 incrementos estén completos y estables, como paso de cierre de V1, no incremento propio.

**Regla de ejecución (`DEC-111`, `AGENTS.md §11/§63`): NO one-shot.** Ni a nivel de "generar todo el proyecto CASEFlow" ni, más importante, a nivel del propio producto generado ("un solo prompt → cientos de archivos → aceptar todo"). Implementar **incremento por incremento, en el orden dado**, con su propia serie de commits al final, corriendo la batería de verificación (§7) antes de continuar. Si un incremento posterior obliga a tocar uno anterior, está permitido pero debe documentarse en el commit.

**Gates humanos que el código debe hacer cumplir, no solo documentar** (son P0 — bloqueantes, no advertencias, a diferencia de Consistency Engine en v1.2):

- No hay generación oficial de código sin `GenerationPlan` `APPROVED` (`DEC-090`, `spec §156`).
- No hay `ImplementationPlan` sin una `DESIGN_BASELINE` `APPROVED` (`DEC-094`, `DEC-095`).
- No se congela el modelo físico/Prisma antes del Design Gate cuando el diseño puede seguir cambiando campos (`spec §157`, `AGENTS.md §13`).
- Ninguna dependencia fuera del Approved Dependency Catalog puede llegar a un manifiesto generado sin pasar por `DependencyProposal → Human Decision → ApprovedDependency` (`DEC-100`, `AGENTS.md §21/§63`).
- Código generado nunca corre en el proceso principal de CASEFlow AI (`DEC-101`, `AGENTS.md §26/§62`, P0/blocker si se viola).
- Auto-repair tiene un máximo duro de 3 rondas por ciclo de validación fallido (`DEC-103`, `AGENTS.md §27`).
- Un `GeneratedProjectSnapshot` oficial nunca se sobrescribe silenciosamente (`DEC-104`/`DEC-105`, `AGENTS.md §23/§62`, P0/blocker).

---

## 1. Incremento 13 — Construction Foundation

Fuente: `spec §194` (línea 6668), `spec §151-155` (TargetTemplate, DesignSystemProfile, Approved Dependency Catalog).

### 1.1 Motivación

Nada de Construction existe hoy en el código (confirmado por grep exhaustivo en `apps/api/src` y `packages/`: cero coincidencias de `generation-plan`, `implementation-plan`, `generated-project`, `target-template`, `dependency-catalog`, `code-generation`, `design-baseline`, `conceptual-model`, salvo un falso positivo en la directiva CSP `sandbox` de `mockups.controller.ts`, que no tiene relación). Es terreno nuevo por completo. Este incremento sienta las entidades base que todo lo demás referencia — sin él, ningún incremento posterior puede empezar.

Gate de cierre del incremento (`spec §194`): _"CASEFlow puede representar y versionar una futura generación sin generar todavía el proyecto completo."_

### 1.2 Modelo de datos (Prisma, aditivo — nunca `db push`, usar migración explícita)

La spec **no define columnas exactas** para estas entidades (a diferencia de v1.2, que sí las dio letra por letra) — es decisión de este incremento, siguiendo los patrones ya establecidos en el repo (versión inmutable, scoping por proyecto, enums fijos en vez de configuración libre — `AGENTS.md §4.4/§4.2/§21`).

- **`TargetTemplate`** — catálogo fijo de plantillas soportadas. `id`, `identifier` (único, ej. `"CASEFLOW_WEB_TS_V1"`), `name`, `archivedAt`. V1 solo tendrá una fila (`DEC-085`); no se construye una UI de administración de templates — es seed data versionado en código/migración, no editable desde la app (evita el "template builder" explícitamente fuera de alcance, `AGENTS.md §8`).
- **`TargetTemplateVersion`** — versión inmutable del stack/reglas de una `TargetTemplate`. `id`, `targetTemplateId`, `versionNumber`, `stackManifest` (JSONB — aquí sí aplica `AGENTS.md §31.1`: es "configuración de plantilla", no dato de negocio central, por eso JSONB es aceptable), `codingStandard` (texto/JSONB), `validationCommands` (JSONB: `{install, lint, typecheck, test, build}`), `createdAt`. Único `(targetTemplateId, versionNumber)`, inmutable tras crear (mismo principio que `ArtifactVersion`).
- **`ApprovedDependency`** — fila por paquete permitido, scoped a `targetTemplateVersionId`. `id`, `targetTemplateVersionId`, `category` (enum: `FRAMEWORK`, `UI`, `FORMS`, `SERVER_STATE`, `TESTING`, `OTHER`), `packageName`, `versionRange`, `layer` (enum: `FRONTEND`, `BACKEND`, `SHARED`), `createdAt`. Único `(targetTemplateVersionId, packageName)`.
- **`DependencyProposal`** — cuando una generación requiere algo fuera del catálogo. `id`, `projectId`, `generationRunId` (nullable, ver Incremento 16), `packageName`, `justification`, `status` (enum: `PENDING`, `APPROVED`, `REJECTED`), `decidedByUserId`, `decidedAt`. Un `APPROVED` crea la fila `ApprovedDependency` correspondiente (append-only, nunca auto-aplicado sin decisión humana — `DEC-100`).
- **`DesignSystemProfile`** — `id`, `identifier` (único, ej. `"CASEFLOW_STANDARD_WEB_V1"`), `versionNumber`, `profile` (JSONB estructurado: `uiLibrary`, `styling`, `icons`, `forms`, `serverState`, `navigation`, `tables`, `dialogs`, `feedback` — cada campo un string/enum, no prosa libre; `AGENTS.md §15` prohíbe explícitamente "reducirlo a un prompt libre sin versión"), `createdAt`. V1 solo tiene una fila activa (`DEC-093`).

### 1.3 Contratos (`packages/contracts/src/construction/`)

Nuevo directorio, un archivo por entidad siguiendo el patrón ya usado (`artifact.contract.ts`, `mockups/mockup.contract.ts`):

- `target-template.contract.ts` — `targetTemplateResponseSchema`, `targetTemplateVersionResponseSchema`, `approvedDependencyResponseSchema`.
- `dependency-proposal.contract.ts` — `createDependencyProposalRequestSchema`, `decideDependencyProposalRequestSchema` (`status`, `justification?`), `DEPENDENCY_PROPOSAL_STATUSES` como array `as const`.
- `design-system-profile.contract.ts` — `designSystemProfileResponseSchema`.

### 1.4 Backend

Nuevo módulo `apps/api/src/construction/target-templates/`:

- `TargetTemplatesService` — `list()`, `getActiveVersion(identifier)`. Sin CRUD desde la API en V1 (seed-only, ver §1.2).
- `DependencyCatalogService` — `isApproved(targetTemplateVersionId, packageName)`, `listApproved(targetTemplateVersionId)`.
- `DependencyProposalsService` + `DependencyProposalsController` — `POST /projects/{projectId}/dependency-proposals`, `GET /projects/{projectId}/dependency-proposals`, `POST /projects/{projectId}/dependency-proposals/{id}/decide`. Requiere autorización de proyecto ya existente (`ProjectMembershipGuard`).
- Script de seed (`scripts/seed-target-template.mjs`, mismo patrón que `scripts/seed-development.mjs`): inserta `CASEFLOW_WEB_TS_V1` v1 con el `stackManifest` de `spec §152` (Next.js, React, Tailwind, shadcn/ui, RHF, Zod, TanStack Query / NestJS, REST, OpenAPI, Prisma, PostgreSQL) y el catálogo inicial de `AGENTS.md §21`, y `CASEFLOW_STANDARD_WEB_V1` con el perfil de `spec §154`.

### 1.5 Frontend

No requiere pantallas propias todavía — es infraestructura consumida por incrementos posteriores. Único punto visible: si `DependencyProposalsService` produce alguno durante un `GenerationRun` (Incremento 16), debe aparecer en la revisión de esa corrida; se construye ahí, no aquí, para no adelantar UI sin datos reales que mostrar (evita especulación, `AGENTS.md §53`).

### 1.6 Pruebas mínimas requeridas

- Unit: `DependencyCatalogService.isApproved` (positivo/negativo, y por capa correcta), transición de estado de `DependencyProposal`.
- Integration: seed produce exactamente una `TargetTemplate`/`TargetTemplateVersion`/`DesignSystemProfile` activa; aislamiento por proyecto de `DependencyProposal` (P0, `AGENTS.md §62`).

### 1.7 Definición de terminado

Existe una `TargetTemplateVersion` activa y consultable con su catálogo de dependencias y su `DesignSystemProfile`, y el flujo `DependencyProposal → decisión humana → ApprovedDependency` funciona de punta a punta, sin que ningún incremento posterior necesite inventar esta infraestructura de nuevo.

---

## 2. Incremento 14 — Generation Plan + Design Gate

Fuente: `spec §195` (línea 6696), `spec §156-160` (GenerationPlan, Conceptual Model, UIBlueprint, Design Baseline), `AGENTS.md §12-16`.

### 2.1 Motivación

Es el primer artefacto de Construction que el usuario aprueba, y el gate que bloquea todo lo posterior (`DEC-090`). Responde _"¿qué sistema vamos a construir?"_ (`spec §156`). UIBlueprint y Mockups ya existen desde v1 (`structured-analysis`, `mockups` — reutilizados aquí, no reimplementados) y ya cuentan con el flujo de refinamiento por instrucción añadido en la última ronda de v1.2.

Gate de cierre del incremento (`spec §195`): _"no existe generación oficial sin plan y diseño requerido aprobados."_

### 2.2 Modelo de datos

- **`GenerationPlan`** — sigue el mismo patrón `Artifact`/`ArtifactVersion` ya establecido, registrado como un nuevo `artifactTypeCode` (`'GENERATION_PLAN'`) en la tabla de tipos de artefacto existente, **no** una tabla paralela nueva — reutiliza versionado, transición de estado (`DRAFT/GENERATED/IN_REVIEW/APPROVED/CHANGES_REQUESTED`) y auditoría ya construidos (`AGENTS.md §3`: "no crear arquitectura paralela cuando ya existe una apropiada"). El contenido estructurado (`GenerationPlanContent`) va en una tabla `*Detail` propia, igual que `structuredAnalysisDetail`/`mockupDetail`: `artifactVersionId`, `modules` (JSONB: nombre + entidades + responsabilidades), `conceptualEntities` (JSONB), `actors`, `workflows`, `screens`, `navigationSummary`, `externalIntegrations`, `authRequirements`, `technicalConstraints`, `risks`, `sourceRequirementVersionIds`/`sourceUseCaseVersionIds`/`sourceArchitectureVersionIds` (trazabilidad de entrada, `spec §156`).
- **`ConceptualDomainModel`** — mismo patrón, `artifactTypeCode: 'CONCEPTUAL_DOMAIN_MODEL'`. Contenido: `entities` (nombre + atributos conceptuales, sin tipos físicos todavía), `relationships` — deliberadamente más simple que el `DataModel` físico de v1 (`spec §157`: "NO es todavía el Prisma Schema definitivo").
- **`DesignBaseline`** — tabla propia (no es un `ArtifactVersion` más, es un snapshot que _referencia_ varias versiones exactas a la vez, mismo patrón conceptual que `ProjectBaseline` de v1.2 — reutilizar esa forma, no inventar una nueva). `id`, `projectId`, `generationPlanVersionId`, `conceptualDomainModelVersionId`, `navigationTreeVersionId`, `uiBlueprintVersionId`, `mockupVersionId`, `status` (enum: `DRAFT`, `APPROVED`), `approvedByUserId`, `approvedAt`, `createdAt`. Append-only una vez `APPROVED` (mismo principio que `ProjectBaseline`, `AGENTS.md §23/§31.3`).

### 2.3 Contratos

- `packages/contracts/src/construction/generation-plan.contract.ts` — `generationPlanContentSchema` (todos los campos de §2.2), `generateGenerationPlanCandidateResponseSchema` (mismo patrón `Candidate` de Requirements/UseCases — el LLM produce un borrador, nunca se persiste directo como oficial, `AGENTS.md §36.3`).
- `packages/contracts/src/construction/conceptual-domain-model.contract.ts` — análogo.
- `packages/contracts/src/construction/design-baseline.contract.ts` — `designBaselineResponseSchema`, `createDesignBaselineRequestSchema`.

### 2.4 Backend

- `apps/api/src/generation-plan/` — sigue el patrón exacto de `apps/api/src/structured-analysis/` (`GenerationPlanService`, `GenerationPlanController`, con `generate()` vía `AIOrchestrator` existente — nunca llamar al proveedor de IA directo, `AGENTS.md §36.1` — y `structured-generation-quality.ts` ya existente reutilizado para validar que el plan no cite artefactos fuera de las fuentes seleccionadas, mismo validador de la ronda de estabilización recién cerrada).
- `apps/api/src/conceptual-domain-model/` — mismo patrón.
- `apps/api/src/design-baseline/` — `DesignBaselineService.create(projectId, {generationPlanVersionId, ...})`: valida que **todas** las versiones referenciadas estén `APPROVED` antes de crear el baseline (si alguna no lo está, rechaza con `UnprocessableEntityException`, mismo estilo que `MockupsService.assertApprovedBlueprint`). `POST /projects/{projectId}/design-baselines`, `GET /projects/{projectId}/design-baselines`, `GET .../{id}`.
- Gate a implementar aquí mismo aunque se consuma en el Incremento 15: un helper `assertApprovedGenerationPlan(projectId)` y `assertApprovedDesignBaseline(projectId)` exportados, que el Incremento 15 importará — no lo reimplementa.

### 2.5 Frontend

- Página nueva `apps/web/app/generation-plan/page.tsx` — mismo patrón que `apps/web/app/requirements/page.tsx`: generar candidato con IA (con el `GenerationOverlay` compartido ya construido), revisar (`CandidateReview` ya existente y reutilizable), aprobar/rechazar.
- Página nueva `apps/web/app/conceptual-domain-model/page.tsx` — análoga; puede reutilizar el visor de diagramas de entidad-relación ya existente (`diagram-viewer.tsx`) si se decide representarlo como diagrama en vez de solo tabla, evaluar costo/beneficio al implementar, no aquí (evitar sobre-diseño especulativo, `AGENTS.md §53`).
- Página nueva `apps/web/app/design-baseline/page.tsx` — selector de las versiones exactas a congelar (todas deben estar `APPROVED`, la UI las lista con su estado), botón "Aprobar Design Baseline" que las congela.

### 2.6 Pruebas mínimas requeridas

- Unit: `structured-generation-quality` aplicado a `GenerationPlan` (reutilización de validador existente); construcción del `DesignBaseline` rechaza si cualquier versión referenciada no está `APPROVED`.
- Integration: flujo completo generar→revisar→aprobar `GenerationPlan`; crear `DesignBaseline` con versiones reales aprobadas del proyecto demo y confirmar que congela exactamente esas versiones; aislamiento cross-project (P0).

---

## 3. Incremento 15 — Implementation Plan + Data/API

Fuente: `spec §196` (línea 6721), `spec §161` (ImplementationPlan).

### 3.1 Motivación

Responde _"¿cómo exactamente construiremos el sistema aprobado?"_ (`spec §161`). Solo puede empezar después de un `DesignBaseline` `APPROVED` (`DEC-095`) — el Incremento 14 debe estar cerrado y probado antes de tocar este.

Gate de cierre del incremento (`spec §196`): _modelo válido, `prisma validate` pasa, endpoints mapeados, dependencias permitidas._

### 3.2 Modelo de datos

- **`ImplementationPlan`** — mismo patrón `artifactTypeCode` que `GenerationPlan` (`'IMPLEMENTATION_PLAN'`), reutilizando versionado/estado. Detail: `designBaselineId` (FK — trazabilidad obligatoria al diseño que implementa, `spec §161`), `nestModules` (JSONB: nombre, entidades, DTOs, endpoints, políticas de autorización, servicios), `nextRoutes` (JSONB: ruta, pantalla, forms, tablas, componentes reutilizados), `apiClientOperations` (JSONB), `plannedTests` (JSONB), `envVars` (JSONB: nombre + descripción, nunca valores reales — `AGENTS.md §34`), `externalAdapters` (JSONB).
- **`LogicalDataModel`** / **`PhysicalDataModel`** — evaluar en el momento de implementar si ameritan tablas propias o si basta con dos `artifactTypeCode` más reutilizando el `DataModel` de v1 ya existente (`entities`/`relationships`, mismo shape que `apps/api/src/data-models/`) con un campo `stage` (`LOGICAL`/`PHYSICAL`) — **preferir esto último** (reutilizar la entidad `DataModel` ya construida en vez de duplicarla, `AGENTS.md §3`), decidir con el código de v1 delante, no aquí en abstracto.
- **`GeneratedApiContract`** — el documento OpenAPI generado. `id`, `implementationPlanVersionId`, `openApiSpec` (JSONB, el documento completo), `createdAt`. Inmutable una vez creado (se regenera como fila nueva si cambia, nunca se edita in place).

### 3.3 Contratos

- `packages/contracts/src/construction/implementation-plan.contract.ts` — `implementationPlanContentSchema` con todos los campos de §3.2.
- Reutilizar `packages/contracts/src/data-models/data-model.contract.ts` ya existente para Logical/Physical (agregar el campo `stage` si aplica, cambio aditivo).

### 3.4 Backend

- `apps/api/src/implementation-plan/` — mismo patrón que Incremento 14. `ImplementationPlanService.generate()` requiere `assertApprovedDesignBaseline` (del Incremento 14) antes de generar candidato.
- Generación del `LogicalDataModel`/`PhysicalDataModel`: reutiliza `apps/api/src/data-models/data-models.service.ts` ya existente, agregando el modo `stage`.
- Generación de Prisma Schema y migración: **determinística, no IA** (`AGENTS.md §18`: "boilerplate estándar → templates, no LLM"). Nuevo `PrismaSchemaGeneratorService` — traduce `PhysicalDataModel` a un archivo `.prisma` válido usando un template, valida con `prisma validate` programático o vía `exec` controlado (nunca shell arbitrario del LLM, `AGENTS.md §26/§63`), lo persiste como artefacto generado (no lo aplica a ninguna base de datos real de CASEFlow — esto pertenece al proyecto _generado_, aislado).
- Generación de contratos OpenAPI: determinística a partir de `nestModules`/`apiClientOperations` del `ImplementationPlan` (template, no IA — mismo principio).

### 3.5 Frontend

Página nueva `apps/web/app/implementation-plan/page.tsx` — mismo patrón que Generation Plan: generar, revisar, aprobar. Sección de solo lectura mostrando el Prisma Schema y el documento OpenAPI generados (con resaltado de sintaxis si el componente ya existe en el sistema de diseño; si no, texto monoespaciado simple — no agregar una librería nueva de sintaxis sin justificar costo/beneficio, `AGENTS.md §51`).

### 3.6 Pruebas mínimas requeridas

- Unit: `PrismaSchemaGeneratorService` produce un schema válido a partir de un `PhysicalDataModel` sintético (caso feliz + caso con relación circular/atributo inválido, debe rechazar con mensaje claro, no crashear).
- Integration: `ImplementationPlanService.generate()` rechaza si no hay `DesignBaseline` `APPROVED` (P0 de gate); Prisma Schema generado pasa `prisma validate` real contra el motor instalado en el repo.

---

## 4. Incremento 16 — Backend/Client/Frontend Generation

Fuente: `spec §197` (línea 6743), `spec §18-22` (reglas híbridas de generación, `ts-morph`, OpenAPI).

### 4.1 Motivación

Es el incremento que produce código fuente real por primera vez. Combina templates + generación determinística + transformación AST (`ts-morph`) + IA solo donde hace falta interpretación (`DEC-097`, `AGENTS.md §18-19`) — nunca IA para boilerplate que un generador puede producir de forma más segura y barata.

Gate de cierre del incremento (`spec §197`): _"aplicación generada estructuralmente completa."_

### 4.2 Modelo de datos

- **`GenerationRun`** — una ejecución completa de generación oficial. `id`, `projectId`, `implementationPlanVersionId`, `designBaselineId`, `targetTemplateVersionId`, `status` (enum: `PLANNED`, `GENERATING`, `GENERATED`, `FAILED` — los estados de validación posteriores pertenecen al Incremento 17, no se mezclan aquí), `startedAt`, `finishedAt`, `errorMessage`, `createdByUserId`. Un `GenerationRun` nunca se reintenta editando la misma fila — un reintento crea una fila nueva (mismo principio de inmutabilidad de historial, `AGENTS.md §24`).
- **`GeneratedFile`** — un archivo producido por la corrida. `id`, `generationRunId`, `path` (relativo a la raíz del proyecto generado), `contentStorageKey` (vía `StorageProvider` ya existente, no se guarda el contenido inline en la fila — mismo patrón que `MockupScreenDetail`), `origin` (enum: `TEMPLATE`, `DETERMINISTIC`, `AST_TRANSFORM`, `AI_ASSISTED` — trazabilidad de cómo se produjo cada archivo, útil para depurar y para DEC-106).
- **`CodeTraceLink`** — trazabilidad de construcción explícita, requerida por `AGENTS.md §22`/`DEC-106` ("no ocultar el mapeo solo en comentarios generados"). `id`, `generationRunId`, `sourceArtifactVersionId` (el requisito/caso de uso/módulo de plan del que deriva), `generatedFileId`, `linkType` (enum: `IMPLEMENTS`, `TESTS`, `CONFIGURES`).

### 4.3 Contratos

`packages/contracts/src/construction/generation-run.contract.ts` — `generationRunResponseSchema`, `generatedFileResponseSchema`, `codeTraceLinkResponseSchema`.

### 4.4 Backend

- **`CodeGenerationEngine`** (`apps/api/src/code-generation/`, patrón de abstracción de proveedor como `DiagramProvider`/`MockupProvider` — pero interno, no un proveedor externo de terceros): orquesta, para un `GenerationRun` dado:
  1. Scaffolding de repositorio (estructura de `spec §153`, determinístico, templates estáticos con placeholders).
  2. Módulos NestJS por entrada de `nestModules` del `ImplementationPlan` — generación determinística de controller/service/DTO shells (`AGENTS.md §18`, "estándar CRUD → template, no LLM"); uso de `ts-morph` (`packages/construction-ts-tools` nuevo, o dentro del propio módulo si el volumen no justifica un paquete separado — decidir al implementar) para registrar cada módulo nuevo en `AppModule` sin regex frágil (`AGENTS.md §19`, ejemplo textual de caso de uso legítimo de `ts-morph`).
  3. Cliente API TypeScript generado desde `GeneratedApiContract` (OpenAPI) del Incremento 15 — herramienta determinística de generación de cliente a partir de OpenAPI, evaluar una dependencia ya aprobada en el ecosistema TS antes de escribir un generador propio (`AGENTS.md §51`).
  4. Frontend Next.js: scaffolding de rutas desde `nextRoutes` del plan, componentes de formulario con RHF+Zod usando el `DesignSystemProfile` (`CASEFLOW_STANDARD_WEB_V1`), consumiendo el cliente API recién generado — nunca lógica de request cruda duplicada por pantalla (`AGENTS.md §20`).
  5. Lógica de negocio no trivial (validaciones específicas del dominio, cálculos derivados, comportamiento de UI a medida) vía `AIOrchestrator` existente, con el resultado pasando por validación de esquema antes de escribirse a disco (`AGENTS.md §18.2/§36.3`) — nunca el LLM escribe directo al filesystem.
  6. Cada dependencia de paquete que el generador necesite y no esté en `ApprovedDependency` (Incremento 13) dispara un `DependencyProposal` y **detiene** la generación de esa parte hasta decisión humana — nunca la agrega silenciosamente (`DEC-100`).
  7. Cada archivo escrito crea su `GeneratedFile` + los `CodeTraceLink` correspondientes al artefacto de origen.
- `GenerationRunsController` — `POST /projects/{projectId}/generation-runs` (requiere `DesignBaseline` y `ImplementationPlan` `APPROVED`, encola job async — nunca síncrono en el request, `AGENTS.md §40`), `GET .../{id}`, `GET .../{id}/files`.
- Job worker (`apps/worker/src/generation-jobs/`) — mismo patrón thin-trigger que `process-mockup-job.ts`: llama de vuelta a la API autenticada internamente, la lógica pesada vive en `apps/api`.

### 4.5 Frontend

Página nueva `apps/web/app/construction/generation-runs/page.tsx` — iniciar una corrida (deshabilitada si no hay Design Baseline/Implementation Plan aprobados, con mensaje explicando qué falta), lista de corridas con estado, vista de archivos generados por corrida (árbol de archivos, tal vez con vista previa de contenido de texto — evaluar reutilización de algún visor existente antes de construir uno nuevo). Si hay `DependencyProposal` pendientes de esa corrida, mostrarlas con acción de aprobar/rechazar inline.

### 4.6 Pruebas mínimas requeridas

- Unit: cada paso determinístico del `CodeGenerationEngine` (scaffolding produce la estructura exacta de `spec §153`; el registro de módulo vía `ts-morph` produce un `AppModule` sintácticamente válido — parsear el resultado, no solo comparar string).
- Integration: `GenerationRun` completo contra un `ImplementationPlan` sintético pequeño (1-2 módulos) produce `GeneratedFile`s reales con `CodeTraceLink`s correctos; una dependencia fuera de catálogo crea un `DependencyProposal` y detiene esa parte sin fallar toda la corrida catastróficamente.
- **Evaluación real de IA separada de CI** (`AGENTS.md §44`/§36.7`): un caso donde la lógica de negocio no trivial se verifica manualmente contra un proveedor real, nunca en el pipeline determinista.

---

## 5. Incremento 17 — Tests/Sandbox/Auto-repair/Export

Fuente: `spec §198` (línea 6770), `spec §174-179` (SandboxExecutionProvider, pipeline de validación, auto-repair, snapshot, DoD de 20 puntos).

### 5.1 Motivación

Cierra el ciclo: sin esto, "generación exitosa" y "proyecto que realmente funciona" son estados indistinguibles — exactamente la confusión que `AGENTS.md §25` prohíbe ("Generation success and validation success are different states"). Es también donde vive el límite de seguridad más crítico del incremento completo: código no confiable ejecutándose, que **nunca** debe correr en el proceso principal de CASEFlow (`DEC-101`, P0/blocker).

Gate de cierre (`spec §198`, coincide con el DoD completo de `spec §179`, 20 puntos — usar esa lista como checklist literal de cierre de todo el incremento, no solo de este).

### 5.2 Modelo de datos

- **`SandboxRun`** — una ejecución de validación sobre un `GenerationRun`. `id`, `generationRunId`, `attemptNumber` (1 para la corrida inicial, incrementa con cada auto-repair — máximo válido: `1 + MAX_AUTO_REPAIR_ROUNDS`, `DEC-103`), `status` (enum reflejando `spec §175`: `PLANNED`, `INSTALLING`, `LINTING`, `TYPECHECKING`, `TESTING`, `BUILDING`, `VALIDATING`, `READY`, `FAILED`), `failedStage` (enum nullable, mismo set + `null`), `logsStorageKey` (sanitizado antes de guardar — nunca secretos, `AGENTS.md §26/§35`), `startedAt`, `finishedAt`.
- **`AutoRepairAttempt`** — `id`, `sandboxRunId`, `roundNumber` (1-3), `structuredErrors` (JSONB, la entrada estructurada que recibe el ciclo de reparación — `spec §176` exige "receive structured validation errors"), `patchSummary` (qué se cambió, auditable), `resultStatus` (enum: `IMPROVED`, `STILL_FAILING`, `NEW_FAILURE`). Regla dura del propio `spec §176`: una ronda de reparación **nunca** modifica artefactos aprobados de análisis/diseño para "hacer pasar" el código — si descubre una inconsistencia aguas arriba, crea un _finding_ (nuevo tipo simple, `RepairFinding`: `id`, `autoRepairAttemptId`, `message`, `relatedArtifactVersionId?`), nunca reabre ni edita esa versión aprobada directamente.
- **`GeneratedProjectSnapshot`** — inmutable, formalizado solo al llegar a `READY`. `id`, `projectId`, `generationRunId`, `targetTemplateVersionId`, `implementationPlanVersionId`, `designBaselineId`, `manifestHash` (hash del árbol de archivos completo), `validationResult` (JSONB, resumen final de install/lint/typecheck/test/build), `traceabilityManifestStorageKey`, `archiveStorageKey` (el ZIP final), `createdAt`, `createdByUserId`. Un nuevo `GenerationRun` exitoso **crea un snapshot nuevo**, nunca sobrescribe uno existente (`DEC-104`/`DEC-105`, P0).

### 5.3 Contratos

`packages/contracts/src/construction/sandbox-run.contract.ts`, `generated-project-snapshot.contract.ts` — shapes de respuesta para las entidades de §5.2.

### 5.4 Backend

- **`SandboxExecutionProvider`** (`packages/integrations/src/sandbox-execution-provider.ts`) — interfaz nueva, mismo patrón que `MockupProvider`/`DiagramProvider`. Contrato mínimo de `spec §174`: filesystem aislado, sin secretos de producción de CASEFlow, timeout, límites de CPU/memoria/procesos, allowlist de comandos (nunca comandos arbitrarios devueltos por un modelo — `AGENTS.md §26`, P0/blocker si se viola), red controlada, runtime desechable, logs sanitizados. Implementación V1: `DockerSandboxExecutionProvider`, orquestando un contenedor efímero por `SandboxRun` con los comandos exactos de `TargetTemplateVersion.validationCommands` (Incremento 13) — nunca comandos improvisados.
- `SandboxRunsService.run(generationRunId)` — ejecuta la secuencia P0 de `AGENTS.md §25`: `install → lint → typecheck → test → build → structural validation`, actualizando `status`/`failedStage` en cada paso, deteniéndose en el primer fallo.
- `AutoRepairService.attemptRepair(sandboxRunId)` — invocado solo si `status === FAILED` y `attemptNumber <= MAX_AUTO_REPAIR_ROUNDS` (`DEC-103`, constante compartida con `apps/worker`). Recibe los errores estructurados del `SandboxRun`, produce un parche acotado dentro de las dependencias/`TargetTemplate` aprobados (nunca amplía arquitectura ni agrega dependencias fuera de catálogo para "hacer pasar" — mismo principio que Consistency Engine no debe bloquear el flujo, pero aquí es al revés: nunca debe _forzar_ un pase artificial), re-encola un `SandboxRun` con `attemptNumber + 1`. Si se agota el límite, el `GenerationRun` completo queda en `VALIDATION_FAILED` y requiere revisión humana (`AGENTS.md §27`, textual).
- `GeneratedProjectSnapshotsService.formalize(generationRunId)` — solo se invoca cuando el `SandboxRun` final llegó a `READY`; nunca marca `READY` con una validación P0 fallida (`AGENTS.md §25/§49`, P0 si se viola). Genera el ZIP reproducible (`DEC-107`) con frontend, backend, contratos/cliente, Prisma+migraciones, tests generados, Dockerfiles/Compose del template, `.env.example` (placeholders únicamente, nunca secretos reales), README con instrucciones de ejecución reales y verificadas contra los mismos comandos usados en sandbox.
- Worker (`apps/worker/src/sandbox-jobs/`) — dispara `SandboxRunsService.run` de forma asíncrona, mismo patrón thin-trigger.

### 5.5 Frontend

Extiende la página de `generation-runs` del Incremento 16 (no una página nueva separada — es el mismo flujo, distinta etapa): estado de sandbox en vivo (reutilizar el patrón de polling + `GenerationOverlay`/estados de cola ya construido para Mockups en v1.2), historial de rondas de auto-repair con su resumen, botón de descarga del ZIP una vez `READY` (reutilizar `downloadFile`/`AuthedDownloadButton` ya existentes del cliente autenticado, construidos en la ronda de estabilización recién cerrada — no reinventar la descarga).

### 5.6 Pruebas mínimas requeridas

- Unit: `AutoRepairService` respeta el límite de 3 rondas exacto (probar el límite +1 explícitamente, debe fallar duro); `GeneratedProjectSnapshotsService.formalize` rechaza si el `SandboxRun` no está `READY`.
- Integration/contract: `SandboxExecutionProvider` — timeout real, comando fuera de la allowlist es rechazado, ausencia de secretos de producción de CASEFlow en el entorno del contenedor (prueba explícita, es el caso P0 más crítico del incremento completo junto con "código nunca corre en el proceso principal", `AGENTS.md §62`).
- Integration: pipeline completo contra un `GenerationRun` real y pequeño (del Incremento 16) hasta `READY`, snapshot formalizado, ZIP descargado y — como verificación manual, no en CI — el proyecto extraído realmente instala/builda siguiendo su propio README (DoD punto 20 de `spec §179`).
- Un nuevo `GenerationRun` exitoso posterior nunca sobrescribe un `GeneratedProjectSnapshot` previo (prueba explícita de `DEC-105`, P0).

### 5.7 Paso de cierre de V1 (no es un incremento, es la validación final de `DEC-114`)

Una vez los 5 incrementos están completos, estables y con su batería de verificación en verde: generar software real para **al menos 2 dominios distintos** (ej. el dominio demo ya usado en v1 más un segundo dominio nuevo) para confirmar que Construction es genérico y no quedó acoplado accidentalmente al primer caso de prueba (`DEC-114`, `AGENTS.md §55`). Documentar el resultado en un reporte de cierre, mismo formato que `docs/reports_v1.2/`.

---

## 6. Orden de trabajo dentro de la rama

```
feat/v2-construction
  ├─ commit(s): Incremento 13 (Construction Foundation) — sienta las entidades base, hazlo primero y completo
  ├─ commit(s): Incremento 14 (Generation Plan + Design Gate) — depende de 13
  ├─ commit(s): Incremento 15 (Implementation Plan + Data/API) — depende de 14 (Design Baseline aprobado)
  ├─ commit(s): Incremento 16 (Backend/Client/Frontend Generation) — depende de 15 (Implementation Plan + contratos)
  └─ commit(s): Incremento 17 (Tests/Sandbox/Auto-repair/Export) — depende de 16 (código generado real que validar)
```

No mezclar incrementos en el mismo commit. Cada incremento termina con la batería de verificación de §7 en verde antes de continuar al siguiente. A diferencia de v1.2 (5 incrementos mayormente independientes entre sí salvo por `createdByUserId`), estos 5 son **estrictamente secuenciales** — cada uno depende funcionalmente del artefacto oficial aprobado del anterior, no solo de su esquema.

---

## 7. Batería de verificación obligatoria (al final de cada incremento, y otra vez al final de todo)

```
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run test:coverage      # umbral global 70%, no bajarlo (AGENTS.md §46); áreas críticas ≥85%
pnpm --filter @caseflow-ai/web run test
pnpm run db:test:prepare && pnpm run db:test:migrate && pnpm run test:integration
pnpm run test:e2e           # al menos una vez al final, extendiendo el flujo E2E con el tramo de Construction
```

Además, específicamente para este plan:

- `git status --short` limpio antes de cada commit.
- Confirmar que ninguna migración reescribe o elimina datos históricos existentes (`AGENTS.md §32`).
- Confirmar aislamiento por proyecto con una prueba explícita en cada incremento que toque datos scoped a proyecto — P0/blocker si falla (`AGENTS.md §62`).
- A partir del Incremento 16: confirmar explícitamente que código generado nunca se ejecuta fuera del `SandboxExecutionProvider` (revisión de código, no solo prueba automatizada — es la condición P0 más severa de todo el plan).
- A partir del Incremento 17: correr al menos una vez el pipeline sandbox contra Docker real (no solo con fakes/mocks) antes de dar el incremento por cerrado — análogo a como se verificó manualmente la edición de mockups contra Stitch real en la ronda de estabilización de v1.2.

---

## 8. Riesgos específicos de este plan

| Riesgo                                                                                                                                                                                                                   | Mitigación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La cadena de 5 incrementos es estrictamente secuencial (a diferencia de v1.2) — un bloqueo temprano detiene todo lo posterior                                                                                            | Dimensionar el Incremento 13 con margen extra: es pequeño en LOC pero cualquier decisión de esquema mal tomada ahí se propaga a los 4 incrementos siguientes. Revisar el diseño de `TargetTemplateVersion`/`ApprovedDependency` con especial cuidado antes de escribir código sobre ellos.                                                                                                                                                                                                  |
| El Incremento 16 (generación de código real) es, por lejos, el más grande y el que más fácilmente puede degenerar en "generación masiva sin control" si se apresura                                                      | Aplicar literalmente `DEC-111`: generar por partes (scaffolding → módulo por módulo → frontend), verificando cada parte antes de la siguiente, nunca todo el repositorio generado de una sola pasada. Si en la práctica resulta mucho más grande de lo estimado, está permitido dividirlo en sub-incrementos (16a backend, 16b cliente, 16c frontend) documentando la división en el commit — no forzarlo a un solo commit gigante.                                                         |
| El sandbox Docker (Incremento 17) es la superficie de seguridad más sensible de todo el proyecto — un fallo aquí es P0/blocker por definición (`AGENTS.md §62`)                                                          | No dar el incremento por cerrado con solo pruebas mockeadas del `SandboxExecutionProvider`; exigir al menos una corrida real contra Docker antes de cerrar, con revisión de código explícita (no solo automatizada) de que ningún secreto de producción de CASEFlow es accesible desde dentro del contenedor.                                                                                                                                                                               |
| Auto-repair (Incremento 17) puede degradar silenciosamente en "debilitar tests para pasar" si no se vigila                                                                                                               | La regla de `spec §176` (nunca tocar artefactos aprobados de análisis/diseño para forzar un pase) debe verificarse con una prueba automatizada explícita, no solo confiar en el prompt del LLM — ej. una prueba de integración que intente inducir esa conducta con un caso sintético y confirme que el sistema crea un `RepairFinding` en vez de modificar el artefacto aprobado.                                                                                                          |
| Alcance total (5 incrementos secuenciales, el más grande de todo el proyecto hasta ahora) es considerable para una sola rama                                                                                             | Si en la práctica un incremento resulta mucho más grande de lo estimado, está permitido pausar y entregar lo hecho hasta ahí como una v2 parcial — no forzar los 5 incrementos si la calidad se ve comprometida (`AGENTS.md §64`). A diferencia de v1.2, aquí un incremento parcial probablemente significa "Construction generó documentación/plan pero no código ejecutable todavía" — es un estado válido e intermedio, no un fracaso, siempre que se documente con precisión qué falta. |
| Reutilización insuficiente de patrones ya construidos (Candidate/Review, versión inmutable, proveedor abstracto, job async, cliente autenticado, overlay de generación) llevaría a reinventar infraestructura ya probada | Cada incremento de este plan cita explícitamente qué patrón/componente existente debe reutilizar (ver §1-5); revisar esas referencias antes de escribir código nuevo equivalente.                                                                                                                                                                                                                                                                                                           |

---

## 9. Reporte final esperado del agente que ejecute este plan

Al terminar (todos los incrementos o los que se hayan completado), el agente debe reportar, siguiendo el mismo formato ya usado en este proyecto (`AGENTS.md §61`):

- **Implementado:** qué incrementos se completaron íntegros, y para el Incremento 17 en particular, si el pipeline sandbox se verificó contra Docker real o solo contra fakes.
- **Verificado:** resultado real de cada comando de §7, no hipotético; para el DoD de 20 puntos de `spec §179`, indicar explícitamente cuáles de los 20 están cumplidos.
- **No verificado:** qué no se pudo correr y por qué (ej. si Docker no estaba disponible en el entorno de ejecución, como ocurrió puntualmente durante v1.2).
- **Notas:** riesgos de §8 que se materializaron, decisiones de diseño no cubiertas por este plan que tuvo que tomar (especialmente en el Incremento 16, el más abierto), y cualquier incremento que quedó parcial. Si se llegó al §5.7 (validación de generalidad en ≥2 dominios), reportar el resultado explícitamente.
