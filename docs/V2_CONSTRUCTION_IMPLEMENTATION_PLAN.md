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

> **Decisión tomada al implementar (reemplaza el diseño de tablas de la primera versión de este plan):** `TargetTemplate`, `TargetTemplateVersion`, el Approved Dependency Catalog y `DesignSystemProfile` son **constantes versionadas en código** (`packages/domain/src/construction/target-templates.ts`), no tablas sembradas. V1 tiene una sola plantilla que ningún usuario edita (`DEC-085`, sin "template builder", `AGENTS.md §8`), así que git es la única fuente de verdad, cada entorno (dev, test, producción) tiene exactamente la misma definición sin depender de un seed, y la inmutabilidad es literal (objetos congelados; un cambio es una entrada nueva con `version` mayor, nunca una edición). Solo lo que decide un humano vive en la base de datos.

- **Plantilla (`CASEFLOW_WEB_TS_V1` v1, código)** — stack de `spec §152`, arquitectura modular monolith, `DesignSystemProfile` embebido, catálogo de dependencias y comandos de validación. Cada dependencia tiene **versión exacta** (las mismas que usa CASEFlow AI, combinación ya probada) para que una corrida en sandbox sea reproducible. Los comandos de validación son **listas de argumentos, no cadenas de shell**, para que el sandbox del Incremento 17 aplique una allowlist exacta sin interpretar shell (`AGENTS.md §26`).
- **`DesignSystemProfile` (`CASEFLOW_STANDARD_WEB_V1` v1, código)** — campos estructurados (`uiLibrary`, `styling`, `icons`, `forms`, `serverState`, `navigation`, `tables`, `dialogs`, `feedback`), nunca prosa libre (`AGENTS.md §15`).
- **`DependencyProposal` (tabla)** — excepción al catálogo **limitada al proyecto**: aprobarla nunca modifica el catálogo compartido de la plantilla (eso filtraría la decisión de un proyecto a todos los demás, `AGENTS.md §4.2`). Guarda plantilla/versión, paquete, versión exacta, capa, `dev`, justificación, estado y quién decidió. Reglas en la base de datos: `CHECK` de coherencia (decidida ⇔ tiene fecha y autor de la decisión), `CHECK` de versión exacta, índice único parcial (a lo sumo una propuesta pendiente o aprobada por paquete; una rechazada queda como historial y el paquete puede proponerse de nuevo) y trigger que hace **definitiva** una propuesta decidida y prohíbe borrarla.
- **`AuditEvent` (tabla, añadida en este incremento)** — no existía ningún mecanismo de auditoría en el repositorio, y `AGENTS.md §35` exige auditar justamente los eventos de Construction (decisiones de dependencias, inicio/fin de generación, rondas de auto-repair, resultados de sandbox, snapshots). Registro mínimo solo de inserción (`projectId`, actor opcional, acción, entidad, metadata no sensible), protegido por un trigger que rechaza `UPDATE`/`DELETE`. `AuditService.record` acepta la transacción en curso para que el evento se confirme junto con el cambio que registra.
- **Permisos:** cualquier miembro del proyecto puede decidir una propuesta y queda registrado quién lo hizo — es la misma regla que ya usa todo el producto para aprobar artefactos (hoy ningún módulo aplica permisos por rol). Introducir RBAC por rol es un cambio transversal, no algo exclusivo de este incremento.

### 1.3 Contratos (`packages/contracts/src/construction/`)

`packages/contracts/src/construction/construction-foundation.contract.ts`: `targetTemplateResponseSchema` (con su `designSystemProfile`, dependencias y etapas de validación), `createDependencyProposalRequestSchema` (nombre de paquete npm válido, versión exacta, justificación obligatoria), `decideDependencyProposalRequestSchema`, `dependencyProposalResponseSchema` y los enums como arrays `as const`.

### 1.4 Backend

Módulo `apps/api/src/construction/` y módulo global `apps/api/src/audit/`:

- `GET /target-templates`, `GET /target-templates/{identifier}/versions/{version}` — solo lectura, requieren sesión.
- `DependencyCatalogService` — `resolve(projectId, template, packageName)` y `listAllowed(projectId, template)`: catálogo de la plantilla + excepciones aprobadas **de ese proyecto**, nada más.
- `DependencyProposalsService` + controlador — `POST/GET /projects/{projectId}/dependency-proposals`, `POST .../{id}/decide`. La decisión es una actualización condicional (`WHERE status = 'PENDING'`), así que dos decisiones simultáneas no pueden ganar ambas; cada paso se audita en la misma transacción.
- Sin script de seed: la plantilla está en código (ver §1.2).

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

> **Implementado así (decisiones tomadas al implementar):**
>
> - `GENERATION_PLAN` (prefijo `PG`) y `CONCEPTUAL_DOMAIN_MODEL` (prefijo `MC`) son **dos tipos nuevos del módulo `structured-analysis`**, no tablas de detalle propias: heredan sin código nuevo el versionado, la generación con IA por candidatos, la revisión, la validación de procedencia (`structured-generation-quality.ts`, con ramas propias: requisitos/casos de uso citados deben estar entre las fuentes), los formularios manuales y la página genérica. Sin diagrama en V1 (mismo precedente que el plano de interfaz).
> - Fuentes elegibles: el plan se deriva de requisitos, casos de uso, modelo de datos, navegación, ambas arquitecturas y el plano de interfaz aprobados; el modelo conceptual, del plan, requisitos, casos de uso y modelo de datos.
> - **`DesignBaseline` = cabecera + una fila por versión congelada** (`DesignBaselineEntry` con un rol igual al tipo de artefacto), mismo patrón normalizado que `ProjectBaseline`. Crear una línea base **es** la aprobación humana del Design Gate (no hay estado `DRAFT`); la vigente es la más reciente. Obligatorios: plan, modelo conceptual, navegación, plano de interfaz y boceto; opcionales: ambas arquitecturas. La base de datos valida por fila que la versión esté `APPROVED`, sea del mismo proyecto y del tipo del rol, y que el boceto derive exactamente del plano de interfaz congelado; triggers la hacen inmutable.
> - La aprobación del plan, del modelo conceptual y de la línea base se audita (`AuditEvent`) en la misma transacción.
> - No se añadieron etapas de readiness: esas 13 etapas definen el primer entregable, y agregar construcción cambiaría qué significa "proyecto listo". Las compuertas de construcción las aplica el backend.
> - Durante este incremento se detectó y corrigió un fallo P0 previo: cuatro controladores (`software-architecture`, `system-architecture`, `ui-blueprint`, `diagrams/use-cases`) no tenían ningún guard. Se añadió una prueba estructural que falla si cualquier controlador nuevo omite `JwtAuthGuard`.

Diseño original de este plan (referencia):

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

> **Implementado así (decisiones tomadas al implementar):**
>
> - `IMPLEMENTATION_PLAN` (prefijo `PI`) es otro tipo de `structured-analysis`. Su contenido **es a la vez el modelo lógico/físico y el contrato de la API**: módulos NestJS (PascalCase), entidades persistentes con campos tipados (`STRING`, `TEXT`, `INT`, `DECIMAL`, `BOOLEAN`, `DATE`, `DATETIME`, `ENUM` con valores), relaciones (`MANY_TO_ONE`, `ONE_TO_ONE`, `MANY_TO_MANY`), operaciones CRUD expuestas, roles de lectura/escritura, endpoints de negocio no CRUD, rutas Next.js, variables de entorno (sin valores) y pruebas planificadas. No se crearon artefactos separados de modelo lógico y físico: triplicarían la revisión humana sin aportar información, y el esquema físico se deriva de este plan sin ambigüedad.
> - Los nombres ya siguen las convenciones del código generado (inglés, PascalCase/camelCase, rutas en minúsculas), validados por el contrato, para que no haya un paso de "traducción" adivinado entre revisión y generación. El contrato también exige que los roles usados estén declarados, que no se redeclaren `id`/`createdAt`/`updatedAt` y que toda referencia interna (módulo, entidad) exista.
> - **Compuerta (DEC-095):** el plan lleva `designBaselineId`; crear, versionar o aceptar un plan exige que apunte a una línea base de diseño aprobada **del mismo proyecto**. Al generarlo con IA se elige una línea base y sus versiones congeladas (salvo el boceto, que no tiene contenido estructurado) son las únicas fuentes; la IA propone el cuerpo del plan y el sistema fija el `designBaselineId`.
> - **Generación determinística, sin IA (AGENTS.md §18):** `apps/api/src/code-generation/` convierte el plan en el esquema Prisma (UUID, timestamps, `snake_case`, relaciones inversas con nombre determinista, `onDelete: Restrict`) y en el documento OpenAPI 3.0 (esquemas de entidad y DTO de creación/edición, rutas REST con `operationId` estables, endpoints de negocio, seguridad bearer). Si el plan produjera un nombre en conflicto, el generador falla con un mensaje claro en lugar de emitir un esquema roto. Una prueba ejecuta el `prisma validate` real sobre el esquema generado.
> - `GET .../implementation-plan/{id}/artifacts` ofrece la vista previa de ambos, para que el revisor apruebe exactamente lo que se construirá. El campo se llama `databaseSchema` (no `prismaSchema`) porque el OpenAPI de CASEFlow no debe revelar su tecnología interna.
> - La aprobación del plan se audita (`IMPLEMENTATION_PLAN_APPROVED`).

Diseño original de este plan (referencia):

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

> **Implementado así (decisiones tomadas al implementar):**
>
> - **Motor determinístico (16a):** `apps/api/src/code-generation/engine/` genera el proyecto completo de `CASEFLOW_WEB_TS_V1` con plantillas: raíz pnpm, `packages/contracts` (Zod), `packages/api-client` (derivado del OpenAPI del plan, `DEC-099`), backend NestJS (módulos por capacidad de negocio, CRUD, guardas de rol, Prisma), frontend Next.js (rutas del plan, formularios RHF+Zod, TanStack Query), pruebas y Docker. Las versiones salen solo del catálogo aprobado, exactas (`DEC-100`). Se verificó fuera de CASEFlow con dos planes de dominios distintos: install, lint, typecheck, test y build pasan.
> - **Sin `ts-morph`:** no se edita código existente; `AppModule` y cada módulo se emiten completos desde el plan, así que una transformación AST no aporta seguridad (`AGENTS.md §19`: no forzarlo). El origen `AST_TRANSFORM` no se usa.
> - **Estados:** `QUEUED → GENERATING → GENERATED | FAILED`; los de validación son del Incremento 17. Triggers de base de datos imponen el ciclo de vida y la inmutabilidad de archivos y enlaces; un reintento del job no duplica nada (transición condicional `QUEUED → GENERATING`).
> - **Contenido inline:** `GeneratedFile.content` se guarda en la fila (con `sha256`); son archivos de texto pequeños e inmutables. El ZIP del snapshot (Incremento 17) sí irá al `StorageProvider`.
> - **Lógica de negocio con IA:** solo para los endpoints de negocio no CRUD; la IA escribe el cuerpo del método, que se revisa (sin imports, `process`, `eval`, red, SQL crudo ni sistema de archivos). Si se rechaza o la IA no está disponible, el endpoint conserva un stub honesto que responde 501 y la corrida registra una advertencia en español. No se crean `DependencyProposal` automáticas: una propuesta exige una versión exacta que solo una persona puede justificar; la advertencia indica qué paquete faltaría.
> - **Trazabilidad (`DEC-106`):** cada archivo enlaza (`IMPLEMENTS`/`TESTS`/`CONFIGURES`) a la versión exacta del plan de implementación, por elemento del plan, y a las versiones congeladas de la línea base de diseño que ese elemento cita.
> - **Job:** cola BullMQ única `construction` (tipos `generation-run` y, en el Incremento 17, `sandbox-run`); el worker es un disparador delgado que llama al callback interno protegido por `x-internal-jobs-secret`. Se audita `GENERATION_RUN_STARTED` y `GENERATION_RUN_FINISHED`.

Diseño original de este plan (referencia):

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

> **Implementado así (decisiones tomadas al implementar):**
>
> - **`SandboxExecutionProvider`** (`packages/integrations`) con `DockerSandboxExecutionProvider`: un volumen Docker propio por validación (nunca se monta un directorio del host), un contenedor desechable por etapa, usuario sin privilegios (`node`), `--cap-drop ALL`, `no-new-privileges`, límites de memoria/CPU/procesos, tiempo máximo por etapa con `docker kill`, sin variables de entorno heredadas y **red solo en `INSTALL`** (`--network none` en el resto). Los comandos se ejecutan como argv, sin shell, y solo si coinciden exactamente con `validationCommands` de la plantilla; las rutas de archivos se validan contra salidas del workspace. Los logs se sanean (códigos de terminal, valores de variables con aspecto de secreto, rutas temporales) y se guarda solo la cola. Todo se elimina al terminar, también ante fallos. La imagen (`node:<major>-bookworm` + pnpm exacto de la plantilla) se construye una vez y se reutiliza.
> - **Verificado con Docker real** (pruebas opcionales `CASEFLOW_SANDBOX_DOCKER_TESTS=1`, fuera del CI): el contenedor no ve ninguna variable de CASEFlow, no corre como root, no tiene red fuera de la instalación y respeta el tiempo máximo; un proyecto generado completo pasa install → lint → typecheck → test → build dentro del sandbox.
> - **Estados:** `SandboxRun` = un intento: `QUEUED → RUNNING → READY | FAILED | VALIDATION_FAILED | ERROR`. `FAILED` significa «falló y sigue un intento reparado»; `VALIDATION_FAILED` es el veredicto terminal que exige revisión humana; `ERROR` es una caída del entorno (Docker o almacenamiento) y no dice nada del código: es lo único que se puede reintentar. Un índice parcial único impide dos validaciones activas de la misma generación.
> - **Etapas:** las cinco de la plantilla en el sandbox y luego `STRUCTURE` (estructura obligatoria de la plantilla, `packageManager` fijado y cada dependencia del catálogo o de una propuesta aprobada con su versión exacta) y `TRACEABILITY` (todo archivo fuente y de prueba con enlace de trazabilidad). La evidencia de cada etapa se guarda en `SandboxStageResult` (append-only).
> - **Auto-repair acotado:** tope de 3 rondas impuesto también por la base de datos (`CHECK round_number BETWEEN 1 AND 3`, intento máximo 4). Solo se reparan etapas de código (lint, typecheck, pruebas, build), solo archivos fuente citados en el diagnóstico, sin módulos nuevos (ninguna importación que el proyecto no use ya), sin tocar pruebas ni configuración. La IA devuelve archivos completos que se revisan antes de aplicarse; los cambios quedan como `RepairPatch` (con hash previo y nuevo) y se aplican sobre los archivos generados inmutables en el intento siguiente. Las inconsistencias aguas arriba quedan como `RepairFinding`, enlazadas a la versión aprobada cuando se conoce su código; nunca se edita un artefacto aprobado. Sin IA, la ronda se registra como `NO_PATCH` y la validación termina en `VALIDATION_FAILED`.
> - **Snapshot:** se formaliza en la misma transacción que marca `READY` (un trigger rechaza un snapshot sin intento `READY` de la misma generación). Uno por generación; una generación nueva crea otro y nunca sobrescribe. El ZIP es reproducible (fechas fijas, orden estable) e incluye el código, el `pnpm-lock.yaml` resuelto en el sandbox y `caseflow-manifest.json` (plantilla, versiones del plan y de la línea base, resultado por etapa, hash de cada archivo y enlaces de trazabilidad); no incluye `node_modules` ni secretos. Se guarda como objeto privado en el `StorageProvider` y solo se descarga por la API, con membresía de proyecto, y cada descarga se audita.
> - **Job:** el tipo `sandbox-run` de la cola `construction`. Como una validación puede superar el tiempo de espera HTTP del worker, el callback interno la reconoce y la ejecuta en segundo plano; la transición condicional `QUEUED → RUNNING` hace inofensivas las entregas repetidas.
> - **Auditoría:** `SANDBOX_RUN_STARTED`, `SANDBOX_RUN_FINISHED`, `AUTO_REPAIR_ROUND`, `GENERATED_PROJECT_SNAPSHOT_CREATED`, `GENERATED_PROJECT_SNAPSHOT_DOWNLOADED`.
> - **Migraciones del proyecto generado:** el ZIP trae `prisma/schema.prisma`; la migración inicial (`init`) se crea con `pnpm run db:migrate`, como indica el README, en el primer arranque contra la base del usuario.
> - **Verificación real de punta a punta (DoD 15, 19 y 20 de `spec §179`):** API → Docker real → `READY` → snapshot → ZIP descargado; luego, fuera de CASEFlow, el ZIP extraído siguió su README (compose, install, `db:migrate`, `dev`) y la API respondió CRUD y validaciones en español y la web sirvió sus pantallas. Esta verificación encontró y corrigió tres fallos reales: (1) un plan sin rutas generaba una página de inicio con una importación sin uso (la detectó la etapa `LINT` del sandbox); (2) `pnpm run dev` en una copia limpia no compilaba antes los paquetes internos; (3) `prisma migrate dev` sin nombre esperaba una respuesta interactiva. Además, una caída transitoria del registro npm durante `INSTALL` se clasificaba como veredicto sobre el código: ahora es `ERROR` reintentable. Cada fallo tiene su prueba de regresión.

Diseño original de este plan (referencia):

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
