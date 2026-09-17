# AGENTS.md — CASEFlow AI

## 1. Purpose

This file defines mandatory operating rules for AI coding agents working in the CASEFlow AI repository.

CASEFlow AI is an integrated I-CASE platform. It must remain:

- generic;
- multi-workspace and multi-project;
- structured;
- traceable;
- versioned;
- auditable;
- human-reviewed;
- provider-agnostic;
- usable without external AI;
- capable in V1 of generating a functional web software project inside the supported TargetTemplate.

This file is an operational contract. It is intentionally shorter and stricter than the master specification.

The authoritative product and architecture specification is:

```text
docs/CASEFLOW_AI_SPEC.md
```

---

## 2. Instruction Priority

When instructions conflict, use this order:

1. Explicit requirements from the current user task.
2. `docs/CASEFLOW_AI_SPEC.md`.
3. Approved ADRs in `docs/decisions/`.
4. This `AGENTS.md`.
5. Established repository architecture and conventions.
6. Framework/ecosystem conventions.
7. General engineering preferences.

If a task materially conflicts with `CASEFLOW_AI_SPEC.md` and the user did not explicitly request an architectural/specification change:

- do not silently override the specification;
- identify the conflict;
- preserve the approved architecture;
- request clarification when the conflict is material.

If an approved ADR intentionally supersedes a previous decision, keep the specification synchronized when the task includes documentation changes.

---

## 3. Mandatory Reading Before Changes

Before meaningful implementation work:

1. Read this `AGENTS.md`.
2. Read the relevant sections of `docs/CASEFLOW_AI_SPEC.md`.
3. Read relevant ADRs when they exist.
4. Inspect nearby implementation and tests.
5. Inspect `package.json`, workspace configuration, scripts, environment configuration, and framework conventions before assuming commands.
6. Verify whether the requested capability already has:
   - a domain model;
   - shared contract;
   - provider interface;
   - generator;
   - reusable UI component;
   - test utility;
   - migration;
   - established pattern.

Do not create a parallel architecture when the repository already provides an appropriate one.

Do not assume the existence of a dependency, command, service, environment variable, or provider without checking when verification is possible.

---

## 4. Non-Negotiable Product Invariants

### 4.1 CASEFlow AI is generic

MUST NOT hardcode core logic specific to:

- RestGest Mateos;
- Tutorías Académicas;
- Inventory Demo;
- any other validation domain.

Validation domains belong in:

- Project data;
- fixtures;
- seeds;
- templates;
- examples;
- evaluation datasets.

They are not core product rules.

### 4.2 Workspace and Project isolation

All relevant domain data must remain scoped to the correct Workspace and Project.

Cross-project data leakage is a P0/blocker defect.

The same isolation requirement applies to:

- database queries;
- artifacts;
- versions;
- sources/fragments;
- evidence;
- embeddings/RAG;
- AI context;
- relationships;
- baselines;
- exports;
- generated-project data;
- generation plans;
- snapshots;
- sandbox runs.

### 4.3 Structured artifacts

Engineering information defined by the domain must remain structured.

Do not replace structured entities with arbitrary JSON/text blobs merely for implementation convenience.

### 4.4 Artifact identity and versioning

`Artifact` represents logical identity.

`ArtifactVersion` represents a historical state.

Approved or historical versions are immutable.

### 4.5 Human-in-the-loop

AI proposes; CASEFlow validates; humans approve.

Expected flow for engineering artifacts:

```text
AI Output
→ Schema Validation
→ Domain Validation
→ Candidate
→ Human Review
→ Official Artifact
```

Never persist an unvalidated LLM response directly as an approved official artifact.

### 4.6 Manual fallback

Core CASE functionality must remain usable when external AI, Stitch, email, or other external providers are unavailable.

AI assistance must not replace the deterministic product core.

### 4.7 Traceability is first-class

Important dependencies must be explicit relationships, not hidden inside prose.

Changes affecting artifacts, evidence, versions, reviews, design, implementation plans, generated code, or tests must consider:

- traceability;
- Impact Analysis;
- Consistency Engine;
- baselines;
- living documentation;
- construction traceability.

### 4.8 Canonical source over render

Structured/editable source is authoritative.

Examples:

- Mermaid source over PNG;
- UI Blueprint over screenshot/mockup;
- relational artifacts over exported PDF;
- structured project data over generated narrative;
- GenerationPlan/ImplementationPlan over inferred implementation intent;
- source code snapshot over screenshots of the generated app.

Rendered/exported output is derived and replaceable.

### 4.9 Construction is P0 in V1

CASEFlow AI V1 must not stop at documentation and diagrams.

V1 must support controlled forward engineering into a functional generated web project inside the approved TargetTemplate.

---

## 5. CASEFlow AI Technology Baseline

Do not replace these technologies during a focused task unless explicitly instructed:

- **Language:** TypeScript.
- **Frontend:** Next.js + React.
- **Backend:** NestJS.
- **Worker:** TypeScript + BullMQ.
- **Database:** PostgreSQL.
- **ORM:** Prisma.
- **Vector search:** pgvector when needed.
- **Queue/cache:** Redis.
- **Object storage abstraction:** `StorageProvider`.
- **Local S3-compatible storage:** SeaweedFS.
- **Email development:** Mailpit.
- **API:** REST + OpenAPI/Swagger.
- **Workspace/package manager:** pnpm workspaces.
- **Containers:** Docker / Docker Compose.

Expected high-level repository shape:

```text
apps/web
apps/api
apps/worker
packages/domain
packages/contracts
packages/ui
packages/ai
packages/integrations
packages/config
prisma
docs
infra
```

Preserve intentional repository evolution rather than forcing this structure mechanically.

---

## 6. Supported Generated-Project TargetTemplate

V1 officially supports one generated-project TargetTemplate:

```text
CASEFLOW_WEB_TS_V1
```

Its target stack is:

```text
Language       → TypeScript

Frontend
├── Next.js
├── React
├── Tailwind CSS
├── shadcn/ui
├── React Hook Form
├── Zod
└── TanStack Query

Backend
├── NestJS
├── REST
└── OpenAPI

Persistence
├── Prisma
└── PostgreSQL

Architecture
└── Modular Monolith

Workspace
└── pnpm workspaces

Testing
├── approved unit/integration stack
└── Playwright for E2E

Validation runtime
└── Docker sandbox
```

Do not introduce Django, Spring, Flutter, microservices, or another target stack into V1 unless the user explicitly changes the specification.

Future stacks must be added as new `TargetTemplate` implementations, not by contaminating `CASEFLOW_WEB_TS_V1` with stack-specific conditionals.

---

## 7. Generated-Project Architecture Rules

Generated V1 projects use a modular monolith.

Conceptual layout:

```text
generated-project/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   └── api-client/
├── prisma/
├── docker/
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Backend modules should follow business capabilities rather than arbitrary technical grouping.

Example:

```text
AuthModule
UsersModule
ProductsModule
OrdersModule
InventoryModule
```

Do not generate microservices in V1.

Do not generate arbitrary repository structures that ignore the TargetTemplate.

---

## 8. Roadmap Discipline

Implementation order is dependency-driven.

Current high-level roadmap:

```text
Foundation
→ Identity / Workspace / Project
→ Artifact Core
→ Knowledge Base
→ Manual Analysis
→ AI-assisted Analysis
→ Use Cases
→ Design Foundations
→ Traceability
→ Impact Analysis
→ Consistency Engine
→ Baselines
→ Living Documentation
→ Construction Foundation
→ Generation Plan
→ UI/Mockup Design Gate
→ Implementation Plan
→ Code Generation
→ Sandbox Validation
→ Generated Project Export
→ Collaboration / Notifications
→ Hardening
→ Generality Validation
→ Demo Hardening
→ Release Candidate
→ V1
```

Rules:

- P0 work takes precedence over P1/P2.
- MUST NOT implement a later feature that depends on an incomplete earlier P0 capability unless explicitly instructed.
- Construction is a P0 capability.
- Do not proactively build Project Assistant, advanced BYOK, custom roles, custom template builder, Figma integration, Kubernetes, Terraform/OpenTofu, real-time collaboration, advanced dashboards, or additional target stacks while V1 P0 work remains incomplete.

Prefer vertical slices that leave the repository runnable.

---

## 9. Vertical Slice Rule

Prefer complete integrated slices over isolated horizontal layers.

Example:

```text
Functional Requirement slice
├── Prisma model / migration
├── Domain rules
├── NestJS API
├── Authorization
├── Frontend
├── Tests
└── Audit
```

For Construction, a vertical slice may be:

```text
Generated Product module
├── traceability input
├── GenerationPlan item
├── ImplementationPlan item
├── Prisma entity
├── NestJS module/endpoint
├── API client operation
├── Next.js screen/form
├── generated tests
└── sandbox validation
```

Avoid spending long periods implementing all DB tables, then all APIs, then all UI without producing an integrated path.

Each meaningful increment should leave the repository executable or verifiably closer to the relevant gate.

---

## 10. Construction Pipeline — Mandatory Order

Official forward engineering must follow the approved sequence.

```text
Approved Requirements / Analysis
        ↓
GenerationPlan
        ↓
Conceptual Domain Model
        ↓
Navigation Tree
        ↓
UI Blueprints
        ↓
Mockups
        ↓
Human Design Review
        ↓
Approved Design Baseline
        ↓
ImplementationPlan
        ↓
Logical / Physical Data Model
        ↓
Prisma Schema + Migrations
        ↓
REST / OpenAPI Contracts
        ↓
NestJS Backend
        ↓
Generated TypeScript API Client
        ↓
Next.js Frontend
        ↓
Generated Tests
        ↓
Docker Sandbox Validation
        ↓
Limited Auto-Repair
        ↓
GeneratedProjectSnapshot
        ↓
ZIP Export / Optional Preview
```

MUST NOT skip mandatory gates merely to produce code faster.

---

## 11. No One-Shot Generation

MUST NOT implement Construction as:

```text
one giant prompt
→ hundreds of files
→ accept everything
```

Generation must be incremental, auditable, traceable, and validated by stage.

Each stage should receive explicit structured inputs and produce structured/validated outputs.

A failure in one stage should not trigger uncontrolled regeneration of the entire repository.

---

## 12. GenerationPlan Rules

`GenerationPlan` answers:

> What system are we going to build?

It must be versioned and reviewable.

It should include, when applicable:

- proposed functional modules;
- conceptual entities;
- actors/roles;
- main workflows;
- screens;
- navigation;
- external integrations;
- authentication/authorization needs;
- relevant technical constraints;
- risks;
- traceability to approved artifacts.

CASEFlow AI MUST NOT start an official code-generation run when the required `GenerationPlan` is not approved.

Do not silently mutate an approved plan.

A material change creates a new version/review cycle.

---

## 13. Conceptual Model and Design Gate

The conceptual domain model appears before physical persistence.

Expected progression:

```text
Conceptual Model
→ Human UI/UX Review
→ Logical Model
→ Physical Model / Prisma
```

Do not prematurely freeze Prisma entities before the required UI/UX Design Gate when design decisions can still change fields, workflows, or relationships.

---

## 14. UI Blueprint and Mockup Rules

`UIBlueprint` is canonical.

A Stitch result, screenshot, or other visual render is not the source of truth.

Expected flow:

```text
UIBlueprint
     │
     ├── StitchMockupProvider
     └── InternalWireframeRenderer
```

The external mockup provider should receive structured context such as:

- UI Blueprint;
- Navigation Tree;
- requirements;
- use cases;
- DesignSystemProfile;
- TargetTemplate UI constraints.

Stitch is preferred when available and appropriate, but MUST NOT be a hard dependency.

The internal fallback must remain possible.

---

## 15. DesignSystemProfile Rules

V1 uses:

```text
CASEFLOW_STANDARD_WEB_V1
```

Its intended stack includes:

- shadcn/ui;
- Tailwind CSS;
- Lucide icons;
- React Hook Form + Zod;
- TanStack Query;
- consistent responsive navigation;
- reusable data tables;
- accessible dialogs/forms;
- consistent feedback patterns.

The profile must be structured and versioned.

Do not reduce it to an unversioned free-form prompt.

Mockup generation and frontend generation should use the same DesignSystemProfile so the generated application approximates the approved design.

---

## 16. Human Design Review

Before official implementation generation, the user must be able to:

- approve the design;
- edit the UI Blueprint;
- regenerate mockups;
- request changes;
- justify exceptions.

The stabilized set is captured by an approved/frozen Design Baseline.

Official generation must record the exact Design Baseline used.

Do not begin official code generation from an unapproved design when the specification requires the Design Gate.

---

## 17. ImplementationPlan Rules

`ImplementationPlan` answers:

> How exactly will the approved system be built?

It is produced after the Design Gate.

It should map, when applicable:

- NestJS modules;
- persistent entities/relations;
- DTOs;
- endpoints;
- authorization policies;
- services;
- Next.js routes;
- screens;
- forms;
- tables;
- reusable components;
- API client operations;
- tests;
- environment variables;
- external adapters.

ImplementationPlan must remain traceable to requirements, use cases, design, and architecture.

It must be versionable and reviewable.

Do not infer a materially different implementation during generation without updating/reviewing the plan.

---

## 18. Hybrid Code Generation Rules

Generated software should combine:

```text
Templates
+
Deterministic Generation
+
AST-based TypeScript transformation
+
AI assistance where interpretation is actually needed
```

### Deterministic/template generation is preferred for

- repository structure;
- configuration;
- standard NestJS module/controller/service skeletons;
- Prisma boilerplate;
- DTO shells;
- standard CRUD;
- OpenAPI wiring;
- API-client scaffolding;
- Docker files;
- `.env.example`;
- README scaffolding;
- standard UI shell/components;
- predictable test skeletons.

### AI assistance is appropriate for

- project-specific business rules;
- non-trivial validation;
- workflow-specific service logic;
- derived calculations;
- custom UI behavior;
- repair proposals when deterministic validation fails.

Do not use an LLM for deterministic boilerplate when a generator/template is safer and cheaper.

---

## 19. TypeScript AST Rules

Use `ts-morph` when structural TypeScript changes materially improve safety over string manipulation.

Examples:

- adding imports;
- adding class members;
- registering NestJS modules;
- modifying arrays/decorators;
- creating/refactoring typed methods.

Do not use fragile regex/string replacement when an AST operation is reasonably available and the change is structural.

Do not force `ts-morph` into trivial file generation where a deterministic template is clearer.

---

## 20. OpenAPI Contract Rule

OpenAPI is the primary contract between generated backend and generated frontend.

Expected direction:

```text
NestJS Backend
→ OpenAPI
→ Generated TypeScript API Client
→ Next.js Frontend
```

Avoid independently hand-generating incompatible request/response types in frontend and backend when they can derive from the shared API contract.

Generated frontend should use the approved/generated API client instead of duplicating raw request logic across screens.

---

## 21. Approved Dependency Catalog

Every `TargetTemplateVersion` must have a versioned Approved Dependency Catalog.

The AI MUST NOT freely add arbitrary packages.

Examples of approved categories for V1 include:

```text
Framework
✓ next
✓ react
✓ @nestjs/*
✓ prisma

UI
✓ Tailwind/shadcn-compatible stack
✓ lucide-react

Forms / Validation
✓ react-hook-form
✓ zod

Server state
✓ @tanstack/react-query

Testing
✓ approved testing packages
```

If generation requires a dependency outside the catalog:

```text
DependencyProposal
→ Validation / Human Decision
→ ApprovedDependency
```

or solve the requirement with existing approved capabilities.

Never let model output directly mutate package manifests with arbitrary dependencies.

---

## 22. Generated Code Traceability

Construction traceability is mandatory.

The traceability graph should be extendable to:

```text
Source
→ Requirement
→ Use Case
→ UI / Architecture
→ API / Module / Entity
→ Source File / Component
→ Test
```

Do not hide this mapping only in generated comments.

Use explicit domain records such as `CodeTraceLink` or the repository's approved equivalent.

When upstream artifacts change, Impact Analysis should identify affected implementation artifacts.

---

## 23. GeneratedProjectSnapshot Rules

Every official generation must produce an identifiable `GeneratedProjectSnapshot` or approved equivalent.

Snapshots are historical records and must be immutable.

A snapshot should identify, at minimum when available:

- Project;
- TargetTemplate and version;
- GenerationPlan version;
- Design Baseline;
- ImplementationPlan version;
- GenerationRun;
- generated source location/artifact;
- validation result;
- relevant traceability manifest/hash.

Do not silently overwrite a previous official snapshot.

A new official generation creates a new snapshot.

---

## 24. Regeneration Rules

Regeneration MUST NOT silently overwrite historical snapshots or user changes.

If an upstream artifact changes:

```text
RF / CU / UI / Architecture changes
→ Impact Analysis
→ affected construction artifacts identified
→ user decides what to regenerate
```

V1 does not require automatic bidirectional synchronization from externally edited generated source code back into CASEFlow.

Do not pretend reverse engineering exists in V1.

---

## 25. Generated Project Validation

A Generated Project is valid only when required V1 validation gates pass.

Expected P0 validation sequence:

```text
install
→ lint
→ typecheck
→ test
→ build
→ structural validation
```

A project MUST NOT be marked `READY` while a required P0 validation is failing.

Validation results must be recorded.

Do not claim success because files were generated.

Generation success and validation success are different states.

---

## 26. Sandbox Execution — Mandatory Security Boundary

Generated code must never execute inside the main CASEFlow AI process.

Use `SandboxExecutionProvider` or the approved equivalent.

V1 uses isolated Docker-based validation.

The sandbox should enforce, as implementation allows:

- isolated filesystem/workspace;
- no CASEFlow production secrets;
- timeouts;
- CPU limits;
- memory limits;
- process limits;
- command allowlist;
- controlled network access;
- disposable runtime;
- sanitized logs.

Commands executed inside the sandbox must come from the TargetTemplate/validator, not arbitrary shell commands returned by a model.

Treat all generated code as untrusted until validation is complete.

---

## 27. Auto-Repair Rules

Auto-repair is allowed only as a bounded recovery mechanism.

Initial maximum:

```text
3 repair rounds per failed validation cycle
```

Each repair round must:

- receive structured validation errors;
- produce a focused patch/change;
- remain inside approved dependencies/TargetTemplate constraints;
- be auditable;
- rerun the required validation.

MUST NOT create an infinite autonomous repair loop.

If P0 validation still fails after the permitted rounds:

```text
VALIDATION_FAILED
```

and require human review.

Do not broaden architecture, add arbitrary dependencies, or weaken tests merely to make validation pass.

---

## 28. Generated Project Export

P0 output for V1 is a reproducible ZIP containing the generated project.

It should include, when applicable:

- frontend source;
- backend source;
- contracts/API client;
- Prisma schema and migrations;
- generated tests;
- Dockerfiles/Compose required by the TargetTemplate;
- `.env.example`;
- README with execution instructions;
- package/workspace configuration.

The exported project must be runnable following its README after supplying required environment values.

Temporary hosted preview is P1 and does not block V1.

Git push and automatic deployment are not P0 requirements for V1.

---

## 29. Language Policy

### Technical implementation → English

Use English for:

- code;
- identifiers;
- types/classes/interfaces;
- technical file/directory names;
- DB tables/columns/indexes/constraints;
- API routes/payload fields;
- tests/fixtures;
- logs;
- environment/config keys;
- code comments.

Do not mix Spanish and English in technical identifiers.

### User-facing content → Spanish

Use Spanish for:

- labels;
- buttons;
- menus;
- dialogs;
- validation/user errors;
- notifications;
- emails;
- end-user reports.

Preserve official proper names and technical identifiers where translation would be incorrect.

---

## 30. Naming Defaults

Follow framework and repository conventions first.

General defaults:

- TypeScript variables/functions: `camelCase`.
- Types/classes/components: `PascalCase`.
- Constants when appropriate: `UPPER_SNAKE_CASE`.
- Physical PostgreSQL schema: English `snake_case` when consistent with Prisma mappings.
- Generic directories: lowercase/kebab-case unless framework convention differs.
- Branches: English, lowercase, short-lived.

Generated source must follow the TargetTemplate coding standard.

---

## 31. Database and Domain Rules

### 31.1 3NF by default

Core relational data SHOULD remain in Third Normal Form.

Do not use JSONB to avoid modeling central entities/relations.

JSONB is acceptable for genuinely variable auxiliary metadata, provider payloads, or non-core external configuration.

### 31.2 Integrity

Use appropriate:

- primary keys;
- foreign keys;
- unique constraints;
- check constraints when useful;
- indexes;
- explicit nullability;
- transactional boundaries.

Do not rely only on frontend validation for integrity.

### 31.3 Historical data

Do not physically delete:

- historical ArtifactVersions;
- frozen baselines;
- official GeneratedProjectSnapshots;
- append-only AuditEvents.

### 31.4 Artifact codes

Project-scoped codes such as:

```text
RF-001
RNF-001
ACT-001
CU-001
ADR-001
UI-001
```

must not be reused after archival.

---

## 32. Prisma and Migrations

All schema changes must use Prisma migrations.

Do not use `prisma db push` as the normal production migration mechanism.

Before changing the schema:

1. inspect the existing Prisma schema;
2. inspect relevant migrations;
3. consider existing data;
4. consider backward compatibility;
5. consider indexes/constraints;
6. consider Workspace/Project isolation;
7. consider construction/history implications when relevant.

For potentially destructive changes, prefer:

```text
add new structure
→ migrate/backfill
→ update application
→ verify
→ remove old structure later
```

Do not silently rewrite historical migration files in an established environment.

---

## 33. API Rules

Use REST and OpenAPI unless the specification explicitly changes.

Use English routes and payload fields.

Examples:

```text
/projects
/projects/{projectId}/artifacts
/artifacts/{artifactId}/versions
/projects/{projectId}/knowledge-sources
/projects/{projectId}/generation-plans
/projects/{projectId}/generated-project-snapshots
```

### 33.1 Resource authorization

Never authorize a resource only because the client knows its UUID.

Validate the relevant scope:

```text
User
→ WorkspaceMembership
→ ProjectMembership
→ Resource
```

### 33.2 Errors

Public API errors must not expose:

- stack traces;
- SQL;
- secrets;
- storage credentials;
- internal paths;
- provider keys;
- sandbox internals that create risk;
- private implementation details.

### 33.3 Validation

Validate external input at system boundaries.

Use DTO/schema validation plus domain validation.

---

## 34. Authentication and Security Rules

Security is mandatory, not cleanup work.

### Passwords

Use Argon2id for local password hashing unless the specification explicitly changes.

Never store plaintext or reversibly encrypted passwords.

### Sessions

Expected design:

- short-lived access tokens;
- rotating refresh tokens;
- revocable sessions;
- secure cookie handling for browser refresh tokens.

Do not place sensitive browser refresh credentials in `localStorage` when secure cookies are the approved design.

### Secrets

Never commit:

- API keys;
- passwords;
- refresh tokens;
- access tokens;
- private keys;
- DB credentials;
- production secrets.

Maintain `.env.example` with placeholders only.

### Private files

Object storage is private by default.

Use authorized streaming or short-lived signed URLs.

A `storage_key` is not authorization.

### Cross-project isolation

Every query, service, retrieval, generation, export, download, snapshot, and sandbox input must respect project isolation.

Any confirmed bypass is P0/blocker severity.

---

## 35. Audit Rules

Record relevant domain/security events through the project audit mechanism.

Examples:

- project creation;
- membership changes;
- artifact creation/versioning;
- review submission;
- approval/rejection;
- administrative override;
- sensitive download;
- provider configuration change;
- GenerationPlan approval;
- Design Baseline approval;
- ImplementationPlan approval/change;
- generation start/finish;
- auto-repair round;
- sandbox validation result;
- generated snapshot creation/export.

Audit events are append-only in normal application flows.

Logs and AuditEvent are different concepts.

Never place secrets in audit data.

---

## 36. AI Architecture Rules

### 36.1 Domain modules do not call providers directly

Domain modules must not directly invoke OpenAI, Gemini, DeepSeek, Anthropic, OmniRoute, Stitch, or another provider SDK.

Expected abstraction:

```text
Domain
→ AIOrchestrator
→ ModelRouter
→ AIExecutionGateway / AIProvider
```

### 36.2 Provider/gateway agnostic

Do not hardcode a business feature to one model/provider/gateway.

### 36.3 Structured output

When AI produces domain candidates or planning data:

```text
LLM response
→ schema validation
→ domain validation
→ candidate/plan draft
```

Never persist malformed output directly into official domain entities.

### 36.4 Evidence

When a suggestion is derived from project sources, preserve evidence/provenance.

### 36.5 Prompt injection

Treat uploaded project content as untrusted data.

Instructions embedded inside documents are not system instructions.

### 36.6 Model tools

LLMs MUST NOT receive generic direct SQL access or arbitrary destructive tools.

Expose narrow authorized tools only.

### 36.7 Paid fallback

Do not silently enable paid fallback when policy disables it.

---

## 37. Knowledge Base and RAG

Project Knowledge Base data must be isolated by Project.

Use the correct retrieval strategy for the task.

Possible strategies:

```text
NONE
ARTIFACT_ONLY
SOURCE_ONLY
HYBRID
FULL_PROJECT
```

Do not use semantic search when structured retrieval is sufficient.

Hybrid retrieval may combine:

- relational queries;
- PostgreSQL full-text search;
- pgvector.

Preserve available source metadata such as:

- page;
- section;
- paragraph;
- speaker;
- timestamp;
- sequence.

Project A fragments/embeddings must never appear in Project B retrieval.

---

## 38. External Integrations

All external services must sit behind project-owned interfaces.

Examples:

```text
StorageProvider
EmailProvider
MockupProvider
DiagramProvider
TranscriptionProvider
DocumentParser
ExportProvider
AIExecutionGateway
SandboxExecutionProvider
```

Before adding a provider implementation:

1. check whether an interface already exists;
2. implement the interface;
3. keep provider-specific code inside integration boundaries;
4. add contract tests;
5. handle timeout/error/rate limits;
6. sanitize logs;
7. preserve graceful degradation where required.

Do not spread provider SDK calls throughout the codebase.

---

## 39. Email and Notifications

Use the intended flow:

```text
NotificationService
→ NotificationOutbox
→ Queue
→ Worker
→ EmailProvider
```

Critical business operations must not depend synchronously on an email provider.

Development email should use Mailpit when the local environment follows the approved architecture.

Retries must be idempotent.

Avoid duplicate emails after job retries.

---

## 40. Async Jobs

Long-running operations should use jobs instead of holding HTTP requests open.

Examples:

- document parsing;
- embeddings;
- transcription;
- AI generation;
- mockup generation;
- export;
- large consistency/impact analysis;
- code generation;
- sandbox validation;
- generated-project packaging.

Expected job states:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
RETRYING
```

Use configurable concurrency.

Use idempotency where retry could create duplicates.

A retry must not create duplicate official snapshots or duplicate artifacts.

---

## 41. Frontend Rules

The product should be usable without developer explanation.

Every main UI path should consider:

- loading;
- empty state;
- success feedback;
- safe error feedback;
- unavailable external integrations;
- authorization;
- responsive layout;
- accessibility.

User-facing text is Spanish unless explicitly specified otherwise.

Do not show raw technical errors to end users.

Do not use emojis as substitutes for UI icons.

Reuse the established component system.

Do not add another UI library without clear justification.

---

## 42. Diagram Rules

Diagram source is canonical.

Prefer the project `DiagramProvider` abstraction.

Mermaid is the initial expected engine where appropriate.

Rendered PNG/SVG/PDF is derived.

Do not persist only an image when editable source is required.

---

## 43. Living Documentation

Documentation should derive from structured approved project artifacts.

Do not duplicate structured data into manually maintained documents when it can be generated.

Exports are snapshots.

CASEFlow's structured repository remains the source of truth.

Construction documentation should include traceable implementation information where required by the specification.

---

## 44. Testing Strategy

Use the appropriate test layer.

### Unit

For:

- domain rules;
- versioning;
- authorization rules;
- consistency rules;
- impact logic;
- planning/generation logic;
- dependency-catalog validation;
- traceability mapping.

### Integration

For:

- NestJS + Prisma + PostgreSQL;
- queues;
- object storage;
- artifact lifecycle;
- knowledge/evidence;
- baselines;
- generation records/snapshots;
- sandbox orchestration boundaries.

### Contract

For:

- AI gateways;
- EmailProvider;
- StorageProvider;
- MockupProvider;
- DiagramProvider;
- SandboxExecutionProvider.

### E2E

Protect the full product flow.

The central flow must evolve toward:

```text
Login
→ Workspace
→ Project
→ Source
→ Requirements
→ Review / Approval
→ Use Cases
→ Design
→ Traceability
→ Quality
→ GenerationPlan
→ Mockup / Design Gate
→ ImplementationPlan
→ Code Generation
→ Sandbox Validation
→ Generated Project Export
→ Documentation
```

### AI evaluation

Real provider/model evaluation stays separate from deterministic normal tests.

Ordinary CI must not depend on live LLM services.

### Construction evaluation

Generated projects should be evaluated for at least:

- structural completeness;
- TargetTemplate compliance;
- dependency compliance;
- traceability;
- install success;
- lint success;
- typecheck success;
- test success;
- build success.

---

## 45. Test Integrity

Do not:

- delete valid tests to make CI pass;
- weaken assertions to hide regressions;
- disable failing tests without justification;
- introduce arbitrary sleeps when deterministic synchronization exists;
- change domain behavior solely to satisfy an incorrect test;
- weaken generated-project tests just to make auto-repair succeed.

Bug fixes should include regression tests when practical.

---

## 46. Coverage

Current target:

```text
Global line coverage >= 70%
```

Critical areas should aim for:

```text
>= 85%
```

Especially:

- domain;
- authentication;
- authorization;
- versioning;
- traceability;
- consistency;
- impact analysis;
- construction planning/validation where practical.

Coverage is not a substitute for meaningful tests.

---

## 47. Quality Gates

Before declaring a task complete, inspect available repository scripts.

When available and relevant, run the repository's actual equivalents of:

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Also run relevant:

- integration tests;
- E2E tests;
- Prisma validation;
- security checks;
- generator tests;
- sandbox contract tests.

Do not invent script names without checking `package.json`.

Do not claim a command passed unless it actually ran.

If a command cannot run, state why.

---

## 48. Definition of Done — Normal Feature

A feature is not DONE merely because a happy path works.

Relevant completion criteria include:

- requested behavior implemented;
- `CASEFLOW_AI_SPEC.md` respected;
- authorization applied;
- input validation applied;
- domain invariants preserved;
- tests added/updated;
- error handling present;
- audit added where required;
- no secrets added;
- UI states handled where relevant;
- documentation/config examples updated when behavior/setup changes;
- repository remains buildable/deployable.

For artifact capabilities, consider:

```text
Create
Read
Edit Draft
Version
Review
Approve / Reject
Archive
Evidence
Traceability
Audit
```

When AI-assisted:

```text
Generate Candidate
Review Candidate
Accept / Edit / Discard
```

Do not call an artifact module complete because it only has CRUD endpoints.

---

## 49. Definition of Done — Construction Capability

A Construction capability is not DONE because it can emit source files.

Relevant completion criteria include:

- TargetTemplate identified/versioned;
- approved GenerationPlan enforced;
- required Design Gate enforced;
- Design Baseline recorded;
- ImplementationPlan traceable;
- dependency catalog enforced;
- generated code mapped to approved artifacts where required;
- sandbox execution isolated;
- install/lint/typecheck/test/build validation recorded;
- auto-repair bounded to approved limit;
- GeneratedProjectSnapshot created for official generation;
- historical snapshots not overwritten;
- export reproducible;
- README execution path valid.

A generated project is `READY` only when mandatory P0 validations pass.

---

## 50. Performance

Prefer clear implementations first.

Avoid obvious inefficiencies:

- N+1 queries;
- repeated network calls;
- repeated parsing;
- unbounded lists;
- loading whole documents when a fragment is sufficient;
- retrieving all project artifacts when scoped data is enough;
- regenerating an entire project when only a scoped construction unit needs regeneration.

For normal API operations, the current design target is approximately:

```text
p95 < 500 ms
```

under reasonable demonstration load, excluding long-running external/AI/construction operations.

Long-running work belongs in jobs.

Do not perform speculative micro-optimization without evidence.

---

## 51. Dependencies

Do not add dependencies casually.

Before adding one:

1. check existing dependencies;
2. check standard/framework capabilities;
3. evaluate maintenance;
4. evaluate security;
5. evaluate bundle/runtime cost;
6. evaluate license;
7. verify compatibility;
8. justify why it is preferable to a small local implementation.

For **generated projects**, the Approved Dependency Catalog is mandatory.

For the **CASEFlow AI repository itself**, do not perform unrelated major dependency upgrades.

Use pnpm to update lockfiles.

Do not manually edit generated lockfile contents.

---

## 52. Git Rules

Use English branch names and commit messages.

Prefer Conventional Commits:

```text
feat:
fix:
docs:
test:
refactor:
chore:
ci:
```

Examples:

```text
feat(requirements): add acceptance criteria
fix(auth): prevent refresh token reuse
feat(construction): add generation plan approval gate
test(sandbox): reject non-allowlisted commands
```

Keep commits and PRs focused.

Do not rewrite shared Git history unless explicitly requested.

Do not push directly to `main` when the repository workflow expects PRs.

---

## 53. Scope Control

While implementing a task, do not:

- refactor unrelated modules;
- rename unrelated APIs;
- redesign approved architecture;
- add speculative features;
- implement later roadmap items merely because they seem useful;
- replace provider abstractions;
- change public behavior without need;
- introduce large abstractions for hypothetical future stacks;
- turn V1 into a multi-stack code generator;
- add microservices to generated projects;
- skip review/design gates;
- bypass snapshot/history rules.

Make the smallest coherent change that fully satisfies the task.

Small does not mean incomplete.

---

## 54. Ambiguity

If a requirement is ambiguous but has a safe interpretation:

- preserve current behavior;
- minimize scope;
- avoid destructive operations;
- follow established patterns.

Ask for clarification before proceeding when ambiguity could cause:

- data loss;
- security problems;
- architectural conflict;
- breaking APIs;
- destructive migrations;
- major dependency changes;
- changes to TargetTemplate semantics;
- bypass of a Design/Generation gate;
- contradiction with `CASEFLOW_AI_SPEC.md`.

---

## 55. Generality Check

Before adding domain behavior, ask:

> Would this still make sense for a completely different software project?

If not, determine whether it belongs in:

- Project data;
- template configuration;
- DesignSystemProfile;
- TargetTemplate;
- seed data;
- fixture;
- provider;
- generated-project implementation;

instead of CASEFlow core.

This check is mandatory for functionality derived from RestGest Mateos or Tutorías examples.

For Construction, generality must be validated by generating software for at least two different domains before V1.

---

## 56. Graceful Degradation

External service failure must not corrupt the core product.

Examples:

```text
AI unavailable
→ manual CASE workflow remains available

Stitch unavailable
→ UI Blueprint remains + internal wireframe fallback

Email unavailable
→ NotificationOutbox retries

Diagram rendering unavailable
→ diagram source remains

Paid model disabled
→ do not silently charge

Preview unavailable
→ validated ZIP export remains sufficient for V1
```

Graceful degradation does not mean silently declaring a failed generated project `READY`.

---

## 57. Generated and Temporary Files

Do not commit temporary/generated artifacts unless the repository intentionally tracks them.

Respect `.gitignore`.

Examples usually not committed:

- local `.env`;
- caches;
- build artifacts;
- debug output;
- sandbox working directories;
- temporary generated repositories;
- ZIP validation temp files;
- editor metadata.

Generated project fixtures/snapshots may be committed only when the project explicitly uses them for tests/demo/evaluation.

Do not manually edit generated files when an official generation mechanism exists unless the task specifically requires it.

---

## 58. Documentation Rules

Update documentation when changing:

- setup;
- environment variables;
- public APIs;
- architecture;
- deployment;
- security behavior;
- developer workflows;
- provider integrations;
- TargetTemplate behavior;
- GenerationPlan/ImplementationPlan schemas;
- sandbox behavior;
- generated-project validation rules.

If a task introduces a material architectural decision that changes `CASEFLOW_AI_SPEC.md`, propose/create an ADR and update the specification when requested.

Do not silently allow code and documentation to diverge.

---

## 59. Before Making Changes — Checklist

Before editing:

- [ ] Read relevant `CASEFLOW_AI_SPEC.md` sections.
- [ ] Inspect relevant modules/files.
- [ ] Inspect tests and established patterns.
- [ ] Verify dependencies and scripts.
- [ ] Identify authorization impact.
- [ ] Identify Workspace/Project isolation impact.
- [ ] Identify migration/data impact.
- [ ] Identify audit impact.
- [ ] Identify traceability/versioning impact.
- [ ] Identify provider/external-service impact.
- [ ] Confirm roadmap/P0 priority.
- [ ] If Construction-related, identify the TargetTemplate and active gate.
- [ ] If generating/modifying code, check Approved Dependency Catalog impact.
- [ ] If executing generated code, confirm sandbox boundary.

---

## 60. After Making Changes — Checklist

Before reporting completion:

- [ ] Review every modified file.
- [ ] Verify no unrelated edits.
- [ ] Verify no secrets/debug data.
- [ ] Run relevant tests.
- [ ] Run lint when available.
- [ ] Run type checking when available.
- [ ] Run build when relevant.
- [ ] Run Prisma validation/migration checks when relevant.
- [ ] Confirm authorization and project isolation behavior.
- [ ] Confirm user-visible Spanish text.
- [ ] Update docs/config examples when needed.
- [ ] If Construction-related, verify gates and traceability.
- [ ] If sandbox-related, verify command/resource restrictions.
- [ ] If generated-project-related, distinguish generation success from validation success.
- [ ] State exactly what was verified.
- [ ] State anything that could not be verified.

Never claim verification that was not actually performed.

---

## 61. Completion Report Format

When finishing a coding task, keep the report concise and factual.

Include:

### Implemented

What changed.

### Verified

Commands/checks actually executed and their result.

### Not verified

Anything that could not be run.

### Notes

Only relevant risks, migrations, configuration changes, generated-project status, or follow-up work.

Do not report hypothetical checks as successful.

---

## 62. P0 / Release-Blocking Conditions

Treat at least the following as P0/blocker conditions when confirmed:

- cross-project data leakage;
- authorization bypass;
- data corruption;
- modification of immutable approved history;
- broken central workflow;
- broken mandatory Construction gate;
- generated code executing in the main CASEFlow process;
- sandbox receiving CASEFlow production secrets;
- arbitrary model-controlled shell execution;
- official snapshot silently overwritten;
- project marked READY despite failing mandatory validation;
- generated project not reproducibly exportable when V1 release criteria require it.

Do not hide or downgrade these failures to make a demo appear successful.

---

## 63. Explicitly Forbidden Construction Shortcuts

An agent MUST NOT, unless the user explicitly changes the specification:

- implement one-shot whole-repository generation;
- skip GenerationPlan approval;
- skip required UI/Mockup Design Gate;
- skip Design Baseline capture;
- generate code from an unreviewed ImplementationPlan when approval/review is required;
- let an LLM install arbitrary dependencies;
- let an LLM execute arbitrary shell commands;
- run generated code inside the API/worker process;
- remove/falsify tests to pass validation;
- exceed the approved auto-repair limit;
- silently overwrite GeneratedProjectSnapshots;
- silently overwrite external/manual changes;
- claim bidirectional reverse engineering in V1;
- add another TargetTemplate to solve a task meant for `CASEFLOW_WEB_TS_V1`;
- introduce microservices into V1 generated projects;
- treat Stitch output as canonical over UI Blueprint;
- mark a generated project READY before mandatory validation succeeds.

---

## 64. Core Agent Rule

> Build CASEFlow AI as a real integrated I-CASE platform, not as a collection of AI demos or a one-shot code generator.

Every implementation decision should protect:

- generic project support;
- structured artifacts;
- version history;
- human review;
- traceability;
- consistency;
- security;
- provider independence;
- manual fallback;
- controlled forward engineering;
- Design Gate integrity;
- sandboxed generated-code execution;
- reproducible generated-project validation;
- a complete and demonstrable V1.

When in doubt, prefer correctness, integrity, clarity, approved gates, and completion of the current P0 path over speculative sophistication.
