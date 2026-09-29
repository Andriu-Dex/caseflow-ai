# CASEFlow AI — requirements.md

## First Deliverable Completion Contract

### From current Increment 1F/1F.1 state to professor-demo-ready First Deliverable

**Project:** CASEFlow AI  
**Date baseline:** 2026-09-22  
**Document purpose:** implementation contract for one autonomous agent pass.  
**Human control point:** final Pull Request review and merge only.

---

# 0. EXECUTION INTENT

The agent must complete the remaining First Deliverable implementation in one autonomous pass, starting from the current uncommitted `feature/data-model-diagrams` work.

The implementation must preserve all already-approved architecture and finish the product so the professor can interact with an actual system rather than a proposal.

The agent must:

1. inspect the repository and current 1F/1F.1 work;
2. preserve correct existing implementation;
3. correct any discrepancy against this document;
4. finish 1F/1F.1;
5. implement the professor-driven source-ingestion workflow;
6. enforce human approval gates between lifecycle stages;
7. align Requirements Engineering with ISO/IEC/IEEE 29148:2018;
8. implement Navigation Tree and Architecture artifacts;
9. implement UI Blueprint / Mockup artifacts where required for the First Deliverable;
10. implement a coherent CASEFlow frontend vertical workflow;
11. complete first-deliverable traceability/export/hardening needed for demonstration;
12. use logical Conventional Commits after verified coherent implementation units;
13. run all local quality/integration gates;
14. push;
15. create one final PR to `develop`;
16. wait for remote `Quality` and `Integration`;
17. fix failures if necessary;
18. return one consolidated final report;
19. STOP without merging.

Do not request confirmation for ordinary technical decisions. Stop only for a genuine external blocker that cannot be resolved safely without human intervention.

---

# 1. SOURCE-OF-TRUTH HIERARCHY

Read completely before changing code:

1. `CASEFLOW_AI_SPEC.md`
2. approved ADRs
3. `AGENTS.md`
4. `docs/FIRST_DELIVERABLE_MVP.md`
5. this `requirements.md`
6. Zod/OpenAPI/Prisma/current code
7. README/secondary documentation

This document specifies the final First Deliverable behavior and incorporates the latest professor clarification.

If a lower-level implementation conflicts with an approved higher-level decision, correct the implementation.

If this document conflicts with an explicit higher-authority architectural decision in a way that could cause data loss or major redesign, stop and report the contradiction.

---

# 2. PROFESSOR-DERIVED PRODUCT REQUIREMENTS

The following requirements come from the latest professor explanation and are now considered part of the First Deliverable product behavior.

## 2.1 Project begins with source objects

At the beginning of a project, the user must be able to identify and add the objects/materials that provide project knowledge.

Examples explicitly mentioned by the professor include:

- PDF;
- audio;
- form;
- invoice;
- notes/documents;
- other project material.

The system must not assume that uploaded material is already clean, complete or professionally written.

## 2.2 User defines what each source means

Uploading a file is not sufficient.

The user must provide contextual metadata explaining what the source is.

Examples:

```text
"Requirements from the finance area"
"Customer interview notes"
"Current invoice format"
"Existing registration form"
"Operations meeting audio"
```

The meaning/category/purpose of a source is part of project knowledge.

## 2.3 Messy real-world inputs are expected

The professor explicitly wants source documents that resemble real notes:

- spelling mistakes;
- incomplete sentences;
- poor grammar;
- informal notes;
- partial information;
- duplicated concepts;
- inconsistent terminology.

CASEFlow must not require polished AI-written documents as input.

The application must preserve the original source and distinguish it from any cleaned/structured interpretation generated later.

## 2.4 Information is loaded before official generation

The expected official workflow is:

```text
collect project sources
→ identify/classify them
→ extract/interpret their information
→ review/approve the usable knowledge
→ generate initial Requirements
```

Official downstream generation must not silently use arbitrary unreviewed uploads.

## 2.5 Sources can be added later

A user may add more information after the project has already advanced.

New information must:

- be versioned/traceable;
- not silently rewrite approved artifacts;
- produce a visible downstream impact/staleness warning;
- allow the user to intentionally generate a new version of affected artifacts.

## 2.6 Every phase requires user approval

The professor explicitly requires user approval when moving through stages.

AI must never determine that a project phase is approved.

The user remains the decision-maker.

## 2.7 The interface must be clean and easy to use

The interface must:

- be clean;
- be easy to understand;
- provide necessary information;
- avoid overwhelming the user;
- show artifacts, references and relationships clearly;
- provide understandable progression through the project lifecycle.

## 2.8 First Deliverable visible outputs

The professor reiterated that the First Deliverable includes, at minimum:

- Requirements;
- Use Cases;
- Use Case Diagram;
- Navigation;
- Prototypes/Mockups;
- Architectures;
- Data Model / design artifacts already required by the activity.

## 2.9 Future-partial diagram references

The transcription later mentions additional diagrams for the second partial, but the exact ASR wording of the final diagram names is not sufficiently reliable.

Do NOT invent those artifact types in this pass.

Record a backlog item:

```text
Confirm exact second-partial diagram types with professor before implementation.
```

Possible interpretations must not be encoded as product requirements until confirmed.

---

# 3. GLOBAL PRODUCT PRINCIPLE

CASEFlow AI follows:

```text
Generate
→ Review
→ Approve
→ Relate
```

and:

> AI proposes. CASEFlow validates. A human decides what becomes authoritative.

No AI provider may auto-approve an ArtifactVersion.

No downstream official stage may silently consume non-approved upstream knowledge.

---

# 4. ISO/IEC/IEEE 29148:2018 REQUIREMENTS ENGINEERING

CASEFlow AI shall use **ISO/IEC/IEEE 29148:2018** as the normative Requirements Engineering baseline for generation, review, validation, traceability and management of software requirements.

The product may describe its checks as:

```text
ISO/IEC/IEEE 29148:2018-aligned
```

or equivalent.

It MUST NOT claim formal certification or complete standards conformance unless a future explicit conformance assessment is implemented.

## 4.1 Generated Requirement quality

Generated and manually reviewed Requirements should be designed to be:

- individually identifiable;
- necessary/relevant to project sources;
- precise;
- clear;
- unambiguous where practical;
- feasible within supplied project context;
- internally consistent;
- traceable;
- verifiable/testable where applicable;
- sufficiently complete for their stated responsibility;
- implementation-neutral unless an actual project constraint demands a technology/implementation choice.

Prefer one principal obligation/capability per Requirement.

Do not combine unrelated obligations merely to reduce Requirement count.

## 4.2 Existing academic Requirement fields remain mandatory

Keep:

- stable code/ID;
- name;
- description;
- dependencies;
- priority;
- actors;
- preconditions;
- postconditions.

Types remain:

```text
FUNCTIONAL     → RF
NON_FUNCTIONAL → RNF
```

Priority remains:

```text
HIGH
MEDIUM
LOW
```

## 4.3 Quality checks

Add deterministic Requirement quality analysis where practical.

At minimum detect/report:

- blank/insufficient descriptions;
- unresolved dependency references;
- duplicate/self dependency;
- duplicate/near-duplicate exact normalized names where deterministic;
- unsupported structured references;
- placeholders such as `TBD`/`TBC` when not explicitly justified;
- obvious multi-obligation wording indicators;
- missing provenance.

Do not use a brittle keyword checker as proof of standards compliance.

Human review is authoritative.

## 4.4 Prompt update

Review `requirements.generate@1`.

If its current wording does not explicitly reflect the quality principles above, create a new prompt version rather than mutating historical prompt semantics silently.

Preferred if a meaningful behavior change is required:

```text
requirements.generate@2
```

Preserve old prompt definitions for auditability.

Record the exact prompt version finally used.

---

# 5. STAGE-GATED APPROVAL WORKFLOW

Official workflow:

```text
Sources / Source Reports
        ↓ APPROVE
Project Context
        ↓ APPROVE
Requirements
        ↓ APPROVE
Use Cases
        ↓ APPROVE
Analysis / Data Model / Use Case Diagram
        ↓ APPROVE
Navigation + Architectures
        ↓ APPROVE
UI Blueprint + Mockups
        ↓ APPROVE
Construction (future)
```

A stage may contain multiple artifacts.

Progress to the next official stage is permitted only when its required source versions are approved.

## 5.1 Status vocabulary

Continue using:

```text
DRAFT
GENERATED
IN_REVIEW
APPROVED
CHANGES_REQUESTED
```

Do not add a new artifact status merely for stage progress unless strictly necessary.

## 5.2 Acceptance is not approval

For AI candidates:

```text
candidate accepted
→ official ArtifactVersion GENERATED
```

not:

```text
candidate accepted
→ APPROVED
```

Approval remains an explicit subsequent human action.

## 5.3 Preview behavior

If any feature allows preview generation from non-approved inputs, it must:

- be explicitly marked preview;
- never become the default official workflow;
- never silently promote output;
- never be counted as completion of the stage.

If no preview is necessary for the First Deliverable, do not implement one.

---

# 6. PROJECT SOURCE / KNOWLEDGE INTAKE

Implement a first-class project source capability before treating Requirements generation as complete.

## 6.1 Artifact type

Preferred architecture:

```text
PROJECT_SOURCE
```

with stable code prefix:

```text
SRC
```

If the current master specification already defines an equivalent concept, use it instead.

Use the Artifact / ArtifactVersion core unless a documented architectural reason makes a separate entity clearly superior.

## 6.2 Source metadata

Each source version must support at least:

- title/name;
- source kind;
- user-defined purpose/meaning;
- business area/domain label;
- optional description;
- original filename where relevant;
- MIME type;
- size;
- content hash;
- storage reference;
- extraction/interpretation state;
- optional language;
- created timestamp;
- origin/provenance.

## 6.3 Controlled source kinds

At minimum:

```text
PDF
AUDIO
IMAGE
FORM
INVOICE
TEXT
NOTES
OTHER
```

`FORM` and `INVOICE` describe semantic source type, not only MIME type.

Do not infer the semantic source kind solely from file extension.

The user must be able to state what the object represents.

## 6.4 Raw source preservation

The original uploaded file is immutable evidence.

Never replace it with cleaned AI text.

Preserve:

```text
original source
≠ extracted content
≠ AI interpretation
≠ approved source report
```

## 6.5 Binary storage

Do not store uploaded binary files as large blobs in normalized PostgreSQL tables.

Use the project's S3-compatible storage infrastructure.

Persist in PostgreSQL only appropriate metadata such as:

- object key/reference;
- hash;
- MIME;
- size;
- file/version metadata.

Create/reuse a storage abstraction so product services do not depend directly on SeaweedFS/AWS SDK details.

Keep infrastructure provider-replaceable.

## 6.6 Upload safety

Enforce:

- bounded file size;
- allowed MIME/extension mapping;
- safe generated object keys;
- no path traversal;
- content hash;
- no executable interpretation;
- no file name trust for storage paths;
- project isolation;
- safe error messages.

Do not execute uploaded content.

---

# 7. SOURCE CONTENT EXTRACTION

The system needs usable textual/project knowledge from the uploaded source.

Create an abstraction such as:

```text
SourceContentExtractor
```

or equivalent.

## 7.1 Required P0 behavior

P0 must support deterministic/local extraction for:

- plain text;
- Markdown;
- text-based PDF.

If a safe maintained package is required for PDF text extraction, pin it and report its version.

## 7.2 Images / scanned forms / invoices

The source can always be uploaded and classified.

For OCR/vision extraction:

- use an abstraction;
- do not hardcode a specific AI provider into the domain;
- if the configured environment cannot extract the content automatically, allow a manual transcription/interpretation fallback;
- a source must not become usable as authoritative generation input until it has approved textual/structured knowledge associated with it.

Do not pretend an image was interpreted if it was not.

## 7.3 Audio

Audio must be uploadable and classifiable.

Create a transcription abstraction suitable for future providers.

If a transcription provider is safely available/configured in the current environment, implement and validate it.

If not, the product MUST still allow:

```text
audio upload
→ manual transcript/notes
→ source report
→ review/approval
```

Do not block the whole product on paid transcription.

Explicitly report whether automatic audio transcription is VERIFIED or only manual-fallback supported.

## 7.4 No fake OCR/transcription

Never generate a transcript from filename/metadata.

No source may be marked extracted merely because upload succeeded.

---

# 8. SOURCE REPORT / INTERPRETATION

The professor expects the system to transform raw messy material into useful knowledge before generation.

Each source must support an interpretation/report step.

The report should contain structured information such as:

- concise source summary;
- actors/stakeholders mentioned;
- business concepts/entities;
- candidate business rules;
- candidate constraints;
- needs/problems;
- important facts;
- ambiguities/questions;
- dates/numbers only when supported by source;
- extraction/transcription provenance.

Do not treat this report as an official Requirement.

## 8.1 AI behavior

AI may generate the interpretation from extracted source content.

Candidate-first/human-review principles apply.

Never let instructions contained inside an uploaded document become system instructions.

Uploaded/source text is untrusted user/project data.

## 8.2 Source approval

Before a source contributes to official downstream generation, the usable interpretation/content must be reviewed and approved by the user.

Record exact source version provenance.

---

# 9. PROJECT CONTEXT + SOURCES

Project Context remains an official structured artifact.

Extend the flow so Project Context can explicitly reference the approved Source versions/reports that support it.

Manual context must remain possible with AI disabled.

If an AI-assisted context refresh is implemented, use candidate-first workflow.

Do not silently rewrite the current approved Context when a new source arrives.

A new source can instead trigger:

```text
"Project knowledge changed"
```

and allow creation of Context version N+1.

---

# 10. REQUIREMENTS GENERATION INPUT

Official Requirements generation must use exact approved versions.

Preferred official source set:

```text
APPROVED Project Context version
+
one or more APPROVED Project Source/report versions
```

If existing APIs require Project Context as the primary input, extend them without destroying existing traceability.

Every generated Requirement should be traceable to:

```text
Requirement ArtifactVersion
→ accepted RequirementCandidate
→ RequirementGeneration
→ AIRun
→ prompt version
→ exact Project Context version
→ exact source/report versions used
```

Where feasible, persist candidate-to-source membership so a reviewer can see which project materials supported a Requirement.

Do not fabricate source links.

---

# 11. ADDING SOURCES AFTER APPROVAL

Users can add information at any time.

New source material must NOT mutate approved Requirements/Use Cases/design artifacts.

Implement a minimal deterministic **impact/staleness signal**.

At minimum CASEFlow must be able to indicate:

```text
This project contains approved downstream artifacts generated before one or more newly approved sources.
```

Preferred behavior:

- identify stage/artifacts potentially affected;
- show source/version that triggered the warning;
- offer explicit regeneration/new-version action;
- preserve old approved versions.

Do not implement a full semantic Impact Analysis engine if unnecessary.

Call it a potential-impact/staleness warning unless actual semantic dependency analysis is performed.

---

# 12. EXISTING 1F / 1F.1 MUST BE COMPLETED

Preserve and finalize the already-implemented Data Model + Diagram Engine.

Expected current architecture:

```text
structured model
→ DiagramEngine
→ deterministic source
→ DiagramProvider
→ KrokiDiagramProvider
→ local Kroki
→ real SVG
→ sanitizeDiagramSvg
```

## 12.1 Kroki

Pinned versions:

```text
yuzutech/kroki:0.32.1
yuzutech/kroki-mermaid:0.32.1
```

Kroki exposed locally only:

```text
127.0.0.1:8000
```

Mermaid companion not exposed to host.

No public rendering service.

## 12.2 SVG sanitizer

Current approved dependency:

```text
fast-xml-parser@5.11.1
```

Use real XML parsing + allowlist reconstruction.

Do not regress to regex-only sanitization.

## 12.3 Diagram semantics

ER:

```text
DATA_MODEL
→ deterministic Mermaid ER
→ real graphical SVG
```

Use Case:

```text
APPROVED USE_CASE versions
→ deterministic PlantUML
→ real graphical SVG
```

Use Case Diagram origin:

```text
SYSTEM_GENERATED
```

Do not reintroduce textual fake SVG.

## 12.4 Keep current 1F migrations

Preserve:

```text
20260922190000_data_models_diagrams
20260922210000_artifact_origin_system_generated
```

Do not rewrite historical migrations.

---

# 13. NAVIGATION TREE — FIRST DELIVERABLE

Implement structured Navigation Tree support now.

Artifact type already expected:

```text
NAVIGATION_TREE
```

Prefix:

```text
NAV
```

## 13.1 Canonical structure

At minimum model:

```text
NavigationTree
├── nodes[]
└── edges / parent-child relationships
```

A node should support:

- stable local identifier;
- label;
- view/screen name;
- optional route/path;
- optional description/purpose;
- node kind;
- parent relation;
- deterministic position/order;
- related Use Case(s) where appropriate.

Controlled node kinds may include:

```text
HOME
SECTION
VIEW
FORM
DETAIL
LIST
AUTH
OTHER
```

Do not over-model router framework implementation.

## 13.2 Sources

Official generation must use exact approved versions from relevant analysis:

- Requirements;
- Use Cases;
- Data Model where useful.

Same project only.

No arbitrary latest draft.

## 13.3 AI workflow

Production prompt:

```text
navigation.generate@1
```

Candidate-first.

Human acceptance creates:

```text
NAVIGATION_TREE
AI_GENERATED / GENERATED
```

Manual creation remains supported.

## 13.4 Navigation diagram

The canonical tree is structured data.

Generate visual representation deterministically.

Preferred source:

```text
Mermaid flowchart
```

through existing `DiagramProvider/Kroki`.

Do not ask AI to produce authoritative Mermaid.

Persist exact source provenance.

---

# 14. SOFTWARE ARCHITECTURE — FIRST DELIVERABLE

Implement:

```text
SOFTWARE_ARCHITECTURE
```

using the existing artifact vocabulary.

Prefix remains the approved architecture prefix from current spec.

## 14.1 Canonical model

Represent, at minimum:

- architecture style/pattern;
- layers/components/modules;
- responsibilities;
- dependencies/allowed connections;
- external interfaces where relevant;
- key architectural decisions;
- source traceability.

Avoid storing the entire architecture as one opaque Markdown field.

## 14.2 Generation

Prompt:

```text
software-architecture.generate@1
```

or next appropriate approved version.

Use exact approved sources, including:

- Requirements;
- Use Cases;
- Data Model;
- Navigation Tree when approved/available.

Candidate-first.

No auto approval.

## 14.3 Diagram

Generate deterministic visual source from accepted structured architecture.

Preferred:

```text
PlantUML component diagram
```

or another format already supported by local Kroki that better preserves the structured semantics.

Do not degrade architecture to an arbitrary AI image.

---

# 15. SYSTEM ARCHITECTURE — FIRST DELIVERABLE

Implement:

```text
SYSTEM_ARCHITECTURE
```

Canonical structure should model:

- system boundary;
- deployable/runtime nodes;
- application/service elements;
- database/storage;
- external services/systems;
- communication links;
- responsibilities;
- deployment/topology relationships;
- source provenance.

Prompt:

```text
system-architecture.generate@1
```

Candidate-first and human-reviewed.

Preferred deterministic diagram:

```text
PlantUML deployment/component representation
```

through Kroki.

Do not invent infrastructure unsupported by approved requirements/context without clearly marking it as an architectural proposal requiring review.

---

# 16. ARCHITECTURE APPROVAL

Navigation, Software Architecture and System Architecture are separate artifacts and require explicit approval.

They may be generated in the same stage, but the stage must clearly show which artifacts remain unapproved.

UI design artifacts may not become official from unapproved architecture/navigation inputs.

---

# 17. UI BLUEPRINT — FIRST DELIVERABLE

Implement:

```text
UI_BLUEPRINT
```

as structured screen/view design metadata.

## 17.1 Canonical screen model

At minimum:

- screen local ID;
- name;
- purpose;
- target actors;
- related Use Cases;
- navigation node;
- sections;
- primary actions;
- secondary actions;
- principal data shown;
- forms/inputs where applicable;
- states/empty/error/loading considerations where useful.

Do not store only a prose paragraph.

## 17.2 Generation

Prompt:

```text
ui-blueprint.generate@1
```

Sources must be approved:

- Navigation Tree;
- relevant Use Cases;
- architecture where needed;
- Data Model where needed.

Candidate-first.

Human acceptance then approval.

---

# 18. MOCKUP ARTIFACT — FIRST DELIVERABLE

Implement/finish:

```text
MOCKUP
```

The goal is to provide a visual prototype/sketch for the designed target application screens.

Do not use AI-generated raster images as the canonical design.

Preferred architecture:

```text
UI_BLUEPRINT structured screen
→ deterministic mockup/wireframe representation
→ safe visual preview
```

A simple deterministic HTML/SVG/wireframe representation is acceptable if it clearly communicates screen structure.

If the existing architecture has a better approved approach, use it.

Each mockup must link to the exact UI Blueprint version it represents.

Mockups remain versioned Artifacts.

---

# 19. CASEFLOW FRONTEND — REQUIRED FOR PROFESSOR DEMO

The professor expects the developed system, not only backend endpoints.

Implement a coherent frontend vertical workflow using the existing Next.js application.

Do not build a throwaway demo disconnected from actual APIs.

No hardcoded project/workspace IDs.

## 19.1 Required user journey

A user must be able to:

```text
Home
→ create/select workspace/project
→ add project sources
→ classify/describe source
→ inspect extracted/entered source knowledge
→ review/approve source
→ create/review/approve Project Context
→ generate/review/accept/approve Requirements
→ generate/review/accept/approve Use Cases
→ view Use Case Diagram
→ generate/review/accept/approve Data Model
→ view ER Diagram
→ generate/review/approve Navigation
→ view Navigation Diagram
→ generate/review/approve Software Architecture
→ generate/review/approve System Architecture
→ view architecture diagrams
→ generate/review UI Blueprint
→ view mockups
→ inspect provenance/version history
```

The UI can stage some advanced operations in detail pages, but this entire lifecycle must be navigable coherently.

## 19.2 No authentication required yet

Identity/RBAC remain deferred unless the master roadmap has changed.

Do not invent fake login/security.

Use the existing pre-identity project/workspace model.

---

# 20. HOME UX

Home must be primarily visual and orientational.

The user should answer quickly:

```text
Where am I?
What project am I working on?
What stage is complete?
What needs review?
What can I do next?
```

Recommended structure:

```text
Home
├── workspace/project selector
├── lifecycle/stage progress
├── artifact status summary
├── pending approvals/reviews
├── source/knowledge summary
├── recent project activity
└── primary next action
```

Do NOT place:

- complete Requirement bodies;
- full Use Case text;
- huge tables;
- long documentation paragraphs

on Home.

---

# 21. INFORMATION DENSITY / PROGRESSIVE DISCLOSURE

The frontend must not overwhelm users.

Use:

- concise cards;
- tabs;
- sections;
- accordions;
- drawers/details;
- focused review panels;
- status badges;
- filters/search when lists grow;
- contextual tooltips/help;
- visual diagrams where useful.

Detailed information remains accessible.

Do not hide information necessary for approval.

Low information density means good hierarchy, not removal of traceability.

---

# 22. APPROVAL UX

Statuses must be visually distinguishable:

```text
DRAFT
GENERATED
IN_REVIEW
APPROVED
CHANGES_REQUESTED
```

The UI must clearly distinguish:

```text
AI candidate
≠ accepted ArtifactVersion
≠ approved ArtifactVersion
```

Approval views must show:

- artifact/version;
- source/provenance summary;
- validation warnings;
- relevant diagram/structured content;
- Approve;
- Request Changes.

Do not bury approval actions.

---

# 23. SOURCE UX

Source upload UI must visibly request:

- file;
- source kind;
- title;
- what this source represents;
- business area/category;
- optional description.

After upload, show:

- extraction/transcript status;
- report/interpretation;
- original file metadata;
- review status;
- approval action;
- provenance/version.

For unsupported automatic extraction, clearly ask the user to enter a manual transcript/interpretation.

Do not imply the AI read content it did not read.

---

# 24. DIAGRAM UX

Display sanitized CASEFlow-produced SVG through a safe rendering boundary.

Do not inject arbitrary user SVG.

At minimum users should see:

- graphical diagram;
- diagram type;
- source artifact/version;
- generated source format;
- source version provenance;
- optional expandable Mermaid/PlantUML source for technical inspection.

Do not show source code instead of the diagram by default.

---

# 25. REFERENCES / TRACEABILITY UX

The professor emphasized seeing the information/artifacts/references used.

For generated artifacts, provide an accessible "Sources / Provenance" view.

The user should be able to answer:

```text
Where did this artifact come from?
Which source files/context/requires/use cases were used?
Which AI run/prompt generated it?
Which exact versions were used?
```

Do not expose secrets/raw prompts unnecessarily.

---

# 26. FIRST-DELIVERABLE TRACEABILITY

Complete the first-deliverable traceability chain.

Target chain:

```text
Project Source version
→ Source Report/interpretation
→ Project Context version
→ Requirement version
→ Use Case version
→ Data Model / Use Case Diagram
→ Navigation
→ Architectures
→ UI Blueprint
→ Mockup
```

Not every artifact needs a direct edge to every prior artifact.

Persist meaningful exact-version relationships.

Expose traceability through APIs and frontend.

---

# 27. CHANGE / STALENESS UX

When a new approved source is added after downstream approvals, show a visible warning.

Example:

```text
New project knowledge was approved after RF-001 v2 and CU-003 v1.
These artifacts may require review/regeneration.
```

Do not automatically mark an artifact semantically invalid unless the system actually proves it.

Use language such as:

```text
Potentially affected
Review recommended
Newer approved source available
```

---

# 28. EXPORT / PRESENTATION SUPPORT

The First Deliverable should be demonstrable and exportable.

At minimum provide a project-level export/summary containing:

- project context;
- Requirements;
- Use Cases;
- Use Case Diagram;
- Data Model / ER Diagram;
- Navigation Tree / diagram;
- Software Architecture / diagram;
- System Architecture / diagram;
- UI Blueprint;
- Mockup references/previews;
- version/status/provenance metadata.

Preferred export formats:

- JSON/structured machine-readable export;
- human-readable HTML or Markdown package;
- PDF only if the repository already has a stable safe path.

Do not introduce a brittle PDF stack solely to satisfy this section if HTML/Markdown + SVG provides the deliverable cleanly.

If PDF export is implemented, document the renderer/tooling precisely.

---

# 29. ACADEMIC VALIDATION

Preserve existing Use Case academic minimum:

```text
minimumRequired = 4
```

Do not enforce exactly four.

Add a project-level First Deliverable readiness endpoint/view.

It should report, at minimum:

- approved source knowledge available;
- approved Project Context;
- approved Requirements;
- at least 4 official Use Cases for academic minimum;
- approved Data Model;
- Use Case Diagram exists;
- ER Diagram exists;
- approved Navigation Tree;
- approved Software Architecture;
- approved System Architecture;
- approved UI Blueprint;
- Mockup(s) available;
- unresolved validation/impact warnings.

Do not automatically approve artifacts to make readiness pass.

---

# 30. TOOL / PROVIDER PROVENANCE

Keep technical provenance useful for the professor presentation.

Where appropriate, record/show safely:

- AI provider;
- AI model;
- prompt key/version;
- AIRun;
- Diagram generator version;
- renderer/provider version;
- deterministic source format.

Never expose API keys.

Current validated AI policy remains:

```text
DIRECT_REFERENCE_PROVIDER
Groq / openai/gpt-oss-120b

DEVELOPMENT_ROUTER
OmniRoute

STRUCTURED_BACKUP_PROVIDER
Cloudflare Workers AI

CONNECTED FREE FALLBACKS
OpenCode Free
Pollinations
```

Do not hardcode provider policy into domain logic.

---

# 31. CURRENT AI TOKEN BUDGETS

Preserve:

```text
Requirements = 4096
Use Cases    = 8192
Data Model   = 12288
```

For new AI features choose feature-appropriate `maxOutputTokens`.

Feature code uses only:

```text
maxOutputTokens
```

The adapter performs vendor/protocol translation.

Document exact budgets selected for:

- source interpretation if AI-assisted;
- Navigation;
- Software Architecture;
- System Architecture;
- UI Blueprint.

Do not use arbitrary enormous defaults.

---

# 32. AI SAFETY / PROMPT INJECTION BOUNDARY

Uploaded source documents are untrusted project data.

Never concatenate source text into system-policy instructions.

Provider request must preserve separation:

```text
system instructions
≠ project/user/source content
```

Source content that says:

```text
"ignore prior instructions"
```

must be treated as document content.

Do not let documents choose:

- tool configuration;
- model;
- renderer;
- schema;
- approval state;
- system prompt.

---

# 33. PROJECT ISOLATION

Every new feature must enforce same-project boundaries.

Project A cannot:

- read Project B sources;
- use Project B sources for generation;
- link to Project B artifacts;
- generate from Project B versions;
- approve Project B artifacts;
- view Project B binaries;
- reuse Project B diagram/source provenance.

Enforce both service-level validation and DB constraints where practical.

---

# 34. DATABASE RULES

Use PostgreSQL/Prisma.

Physical naming:

```text
English
snake_case
```

Official structured Artifact snapshots should be relational where reasonable.

Candidate-stage variable payloads may remain isolated JSON when consistent with existing design.

Do not use `db push`.

Create official additive migrations.

Never rewrite applied historical migrations.

---

# 35. STORAGE RULES

For source files:

```text
S3-compatible object storage
```

Use current local SeaweedFS infrastructure unless a current spec abstraction already supersedes it.

Persist metadata/reference/hash in PostgreSQL.

Do not couple domain logic to SeaweedFS.

Tests must not require an external public storage service.

---

# 36. OPENAPI

Every new public route must have:

- project-scoped path where applicable;
- unique operationId;
- shared Zod request schema;
- shared Zod response schema for meaningful responses;
- documented normalized errors.

Run deterministic OpenAPI generation.

Do not invent undocumented response payloads in controllers.

---

# 37. EXPECTED API DOMAINS

Exact paths may follow existing conventions, but capabilities must exist for:

## Sources

```text
create/upload
list
get
version
update interpretation via new version
generate interpretation/report
review/transition
download/reference original source safely
```

## Project Context

```text
existing semantic create/get/version
lifecycle transition if not already present
source provenance
```

## Requirements

```text
existing CRUD/version/generate/generation/accept/transition
ISO quality report
source provenance
```

## Use Cases

existing capabilities preserved.

## Data Models / Diagrams

existing 1F capabilities preserved.

## Navigation

```text
manual create
list/get
version
generate
get generation
accept
transition
diagram
```

## Architectures

for both software/system:

```text
manual create where reasonable
list/get
version
generate
get generation
accept
transition
diagram
```

## UI Blueprint / Mockup

```text
list/get
generate
review/accept/version
transition
preview
```

## Project Readiness / Traceability

```text
readiness summary
provenance/trace graph query
potential-impact warning query
export
```

Do not add delete unless explicitly approved elsewhere.

---

# 38. FRONTEND STACK

Use existing:

- Next.js 16;
- React 19;
- Tailwind 4;
- existing component conventions/packages.

Use shadcn or equivalent only if already present/approved.

Do not bring in a second frontend framework.

Accessibility:

- semantic controls;
- keyboard-accessible primary workflows;
- labels for form inputs;
- sensible focus states;
- status not represented by color alone.

Responsive behavior should be reasonable for desktop and tablet; mobile perfection is not required for the First Deliverable unless trivial.

---

# 39. FRONTEND DESIGN SYSTEM

Use shared patterns for:

- page shell;
- project selector;
- stage progress;
- artifact cards;
- status badges;
- candidate review;
- approval actions;
- version history;
- provenance;
- validation warnings;
- diagram viewing;
- source upload.

Do not create a different visual language per artifact type.

Avoid excessive prose.

Prefer visual hierarchy and concise microcopy.

---

# 40. HOME VISUAL REQUIREMENT

Home should be visually useful.

Include:

- project identity;
- stage progress/timeline;
- visual artifact readiness;
- pending approvals count;
- source count/status;
- "next recommended action";
- recent project activity if practical.

Do not turn Home into a dense database admin page.

---

# 41. TESTING STRATEGY

Maintain all existing tests.

Current baseline after 1F.1 is approximately:

```text
172 unit tests
73 integration tests
```

Do not decrease without a documented replacement/justification.

Add tests for all new domains.

## 41.1 Sources

Test:

- upload metadata;
- source kind validation;
- project isolation;
- file size/type boundaries;
- storage reference/hash;
- text extraction;
- PDF text extraction;
- manual fallback for unsupported extraction;
- source interpretation candidate;
- approval;
- source provenance;
- malicious filename/path;
- missing file;
- AI disabled behavior.

## 41.2 ISO Requirements

Test:

- new prompt version if introduced;
- quality-report deterministic checks;
- source traceability;
- no auto approval;
- invalid source statuses rejected.

## 41.3 Stage gates

Test that official generation rejects unapproved upstream sources.

At minimum:

```text
Sources/Context → Requirements
Requirements → Use Cases
Use Cases/Requirements → Data Model
Analysis → Navigation/Architecture
Navigation/Architecture → UI
```

## 41.4 Navigation

Test structured hierarchy, invalid parents/cycles, exact source provenance, deterministic diagram, project isolation.

## 41.5 Architecture

Test structured components/nodes, invalid refs, generation candidate validation, deterministic diagrams, provenance.

## 41.6 UI Blueprint / Mockup

Test structured screen model, source links, deterministic preview, unsafe content escaping, project isolation.

## 41.7 Frontend

At minimum component/page tests for:

- project selection;
- Home lifecycle summary;
- source upload metadata;
- approval action;
- candidate review;
- diagram rendering boundary;
- stage locked/unlocked states.

Use Playwright for a small real end-to-end happy path if existing tooling supports it without making CI fragile.

Preferred E2E:

```text
create/select project
→ add source
→ approve knowledge
→ proceed through at least one generated artifact review
→ view diagram/readiness
```

Use fake AI in CI.

---

# 42. REAL AI IN CI

Never call:

- Groq;
- OmniRoute;
- Cloudflare;
- OpenCode Free;
- Pollinations

in ordinary CI.

Use:

```text
AI_PROVIDER=disabled
FakeAIProvider
mocked HTTP
```

Live-provider verification remains developer-controlled.

---

# 43. DIAGRAM CI

Real local Kroki integration remains required in integration tests.

Do not replace real renderer integration with mocks merely to simplify CI.

No public Kroki endpoint.

---

# 44. COVERAGE

Preserve global thresholds:

```text
statements >= 70%
branches   >= 70%
functions  >= 70%
lines      >= 70%
```

Do not lower them.

Prefer staying near or above current 1F.1 coverage baseline.

---

# 45. LOGICAL COMMIT STRATEGY

Do NOT use one giant commit.

Do NOT commit after every file.

Create a Conventional Commit after each coherent verified implementation unit.

A commit must represent a meaningful working state.

Suggested logical boundaries, adapting to actual implementation:

```text
feat(data-models): finalize real diagram rendering
feat(sources): add versioned project knowledge intake
feat(requirements): align generation and quality checks with ISO 29148
feat(workflow): enforce project stage approval gates
feat(navigation): add structured navigation generation and diagrams
feat(architecture): add software and system architecture artifacts
feat(ui-design): add UI blueprints and deterministic mockups
feat(web): add first-deliverable project workflow
feat(traceability): add readiness, impact warnings and export
test(first-deliverable): cover end-to-end lifecycle
docs(first-deliverable): document final architecture and workflow
```

These names are examples.

Do not manufacture commits solely to match this list.

Before each commit:

- run relevant focused tests;
- ensure type/lint state is valid for the touched unit.

Before final push:

- run the entire verification suite.

Never commit a knowingly broken intermediate state.

---

# 46. GIT WORKFLOW FOR THIS ONE-PASS COMPLETION

Current branch is expected to be:

```text
feature/data-model-diagrams
```

and it has not been pushed/merged.

Because this execution expands beyond 1F, the agent may either:

A. safely rename the unpublished branch to:

```text
feature/first-deliverable-completion
```

or

B. continue on the existing branch if rename introduces unnecessary risk.

Preferred: rename only if the branch is confirmed unpublished and has no remote PR.

Do not lose staged or unstaged work.

Do not touch historical stash.

Final PR:

```text
feature/first-deliverable-completion
→ develop
```

or the retained equivalent branch.

Do not target `main`.

Do not merge automatically.

---

# 47. REMOTE CI

After push/create PR, wait for:

```text
Quality
Integration
```

If a job fails:

- inspect real failure;
- fix in same branch;
- run relevant local gates;
- create a logical fix commit;
- push;
- wait again.

Do not weaken gates.

---

# 48. QUALITY COMMANDS

Run as applicable after implementation:

```bash
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
pnpm verify
pnpm db:validate
pnpm openapi:generate
git diff --check
pnpm infra:up
pnpm verify:integration
```

Also run frontend/browser tests introduced by this implementation.

If the repository has a canonical aggregate command, preserve/use it.

Do not claim commands that were not executed.

---

# 49. LOCAL WINDOWS POSTGRESQL CONFLICT

Known native service:

```text
postgresql-x64-18
```

may occupy 5432.

The agent must not stop/start/reconfigure native Windows services without explicit user intervention.

Prefer isolated Docker/test DB approaches already documented.

If administrator intervention is unavoidable, stop and report the exact action required.

---

# 50. SECURITY

Mandatory:

- no secrets in Git;
- `.env` ignored;
- no API keys in logs/reports;
- safe source filenames/object keys;
- no arbitrary shell execution;
- no user-supplied renderer URL;
- no raw unsafe SVG;
- no arbitrary HTML from AI;
- no cross-project references;
- source content treated as untrusted data;
- no auto approval.

---

# 51. PERFORMANCE / SCALE

Do not optimize only for the academic fixture.

Use pagination or bounded list sizes where artifact/source lists can grow.

Retain existing generation limits.

For frontend, avoid loading full bodies of every artifact on Home.

Fetch detail on demand.

---

# 52. PROFESSOR DEMO MODE

The final product should support a clean demo sequence.

A demo project should be able to show:

```text
1. Create/select project
2. Upload intentionally messy source material
3. Explain/classify what the source is
4. Show extracted/manual knowledge
5. Review/approve source
6. Show/generate Project Context
7. Generate Requirements
8. Review/approve Requirements
9. Generate Use Cases
10. Review/approve Use Cases
11. Show Use Case Diagram
12. Generate/approve Data Model
13. Show ER Diagram
14. Generate/approve Navigation
15. Show Navigation Diagram
16. Generate/approve Software Architecture
17. Generate/approve System Architecture
18. Show architecture diagrams
19. Generate UI Blueprint
20. Show mockup/prototype
21. Show traceability/provenance
22. Show First Deliverable readiness
```

The system should not require hand-editing database IDs or calling curl for the primary demo path.

---

# 53. ACADEMIC TEAM/TOOLS EVIDENCE

The professor also expects the team to explain tools and how they worked.

Do not invent a full collaboration subsystem before Identity/RBAC.

However:

- keep technical provenance;
- document actual toolchain;
- maintain changelog/commit history;
- preserve architecture decisions;
- include a concise developer-facing First Deliverable implementation summary.

This supports the presentation without fabricating team activity data the system cannot know.

---

# 54. FUTURE SECOND-PARTIAL BACKLOG

Create/update backlog documentation noting:

```text
Professor mentioned additional diagram types for second partial.
Exact transcription is ambiguous.
Confirm exact required diagram names before implementation.
```

Do not implement guessed diagram types.

---

# 55. DOCUMENTATION

Update:

- `CASEFLOW_AI_SPEC.md`
- `docs/FIRST_DELIVERABLE_MVP.md`
- README only for real developer/user setup changes
- ADRs if a decision is architectural and long-lived

Document:

- source ingestion architecture;
- storage;
- extraction fallbacks;
- ISO-aligned Requirement quality;
- approval gates;
- Navigation;
- Architectures;
- UI artifact model;
- frontend workflow;
- traceability/readiness;
- new migrations;
- new env variables;
- Docker services;
- provider/renderer decisions.

No traces of conversation/AI assistance.

---

# 56. MIGRATIONS

All DB changes use additive official migrations.

Do not rewrite previous migrations.

Migration names should be timestamped and descriptive.

After adding migrations:

- validate Prisma;
- apply from zero to isolated test DB;
- ensure official history works;
- no `db push`.

---

# 57. DEFINITION OF DONE — FIRST DELIVERABLE

The entire execution is DONE only if all applicable boxes are true:

## Existing foundations

- [ ] 1F/1F.1 final rendering remains correct.
- [ ] Kroki local real rendering works.
- [ ] SVG sanitizer works.
- [ ] Data Model candidate/versioning/provenance passes tests.

## Source intake

- [ ] User can upload/create Project Sources.
- [ ] User defines what each source represents.
- [ ] Raw source preserved.
- [ ] Metadata/hash/storage reference persisted.
- [ ] Text/Markdown extraction works.
- [ ] Text-based PDF extraction works.
- [ ] Image/audio unsupported extraction has honest manual fallback.
- [ ] Source report/interpretation exists.
- [ ] Source can be reviewed/approved.
- [ ] Source provenance is exact.
- [ ] New sources can be added later.

## ISO Requirements

- [ ] Requirement generation is explicitly ISO/IEC/IEEE 29148:2018-aligned.
- [ ] Historical prompt version is not silently mutated.
- [ ] Deterministic Requirement quality report exists.
- [ ] No formal certification claim.
- [ ] Requirement provenance reaches exact source versions.

## Approval gates

- [ ] AI never auto-approves.
- [ ] Official downstream generation rejects unapproved required sources.
- [ ] Stage progression is visible in frontend.
- [ ] Approval actions are explicit.

## Requirements / Use Cases

- [ ] Existing flows still work.
- [ ] At least four Use Cases can satisfy academic validation.
- [ ] Use Case Diagram graphical rendering works.

## Data Model

- [ ] Structured ER model.
- [ ] Approved sources exact.
- [ ] ER graphical diagram.

## Navigation

- [ ] Structured NAVIGATION_TREE.
- [ ] Candidate-first AI generation.
- [ ] Versioning/approval.
- [ ] Deterministic Navigation diagram.

## Architectures

- [ ] SOFTWARE_ARCHITECTURE structured artifact.
- [ ] SYSTEM_ARCHITECTURE structured artifact.
- [ ] Candidate-first generation.
- [ ] Human approval.
- [ ] Deterministic diagrams.

## UI Design

- [ ] UI_BLUEPRINT structured artifact.
- [ ] MOCKUP artifact/preview.
- [ ] Source provenance.
- [ ] Human approval.

## CASEFlow frontend

- [ ] Workspace/project selection without hardcoded IDs.
- [ ] Visual Home.
- [ ] Stage progress.
- [ ] Source upload/classification.
- [ ] Candidate review.
- [ ] Artifact approval.
- [ ] Diagram viewing.
- [ ] Provenance/version viewing.
- [ ] Information density is controlled.
- [ ] Primary demo path requires no manual API calls.

## Traceability/readiness

- [ ] Full source→design traceability available.
- [ ] Potential-impact warning for newly approved source knowledge.
- [ ] First Deliverable readiness view/endpoint.
- [ ] Project export/summary available.

## Quality

- [ ] Unit tests green.
- [ ] Integration tests green.
- [ ] Frontend tests green.
- [ ] Coverage gates >=70%.
- [ ] OpenAPI generation green.
- [ ] Migrations from zero green.
- [ ] `git diff --check` green.
- [ ] No secrets.
- [ ] Git history is logical and Conventional Commit compliant.
- [ ] Remote Quality green.
- [ ] Remote Integration green.
- [ ] No automatic merge.
- [ ] No implementation of ambiguous second-partial diagrams.

---

# 58. FINAL REPORT FORMAT

Return one consolidated report only after the implementation, push, PR and CI are complete.

## 1. Final status

```text
PASS / BLOCKED
branch
commit list
PR
source branch
target branch
Quality
Integration
```

## 2. Professor requirements coverage

Map every professor-derived requirement to implemented behavior.

## 3. Project Sources

Report:

- artifact/entity design;
- source kinds;
- upload limits;
- storage provider;
- exact extraction support;
- PDF support;
- image support;
- audio support;
- manual fallbacks;
- source report;
- approval;
- provenance.

Be explicit about VERIFIED vs NOT VERIFIED.

## 4. ISO Requirements Engineering

Report:

- standard baseline;
- prompt version;
- quality checks;
- traceability changes;
- no-certification wording.

## 5. Approval gates

List every enforced gate.

## 6. Requirements

Current workflow, sources, prompt, tests.

## 7. Use Cases

Current workflow, academic minimum, diagram.

## 8. Data Model / Diagram Engine

Final renderer, versions, tests.

## 9. Navigation

Model, prompt, diagram, routes.

## 10. Software Architecture

Model, prompt, diagram, routes.

## 11. System Architecture

Model, prompt, diagram, routes.

## 12. UI Blueprint / Mockup

Model, generation/preview, routes.

## 13. Frontend

Pages/routes/components and user journey.

## 14. UX

Explain:

- Home visual strategy;
- progressive disclosure;
- approval UX;
- information-density controls.

## 15. Traceability / impact

Exact provenance and new-source warnings.

## 16. Readiness/export

What can be used during professor presentation.

## 17. Database

All new migrations, tables, enums, constraints/triggers.

## 18. API

All new/changed METHOD + PATH.

## 19. OpenAPI

Operation/schema status.

## 20. Tests

Exact:

- unit files/tests;
- integration files/tests;
- frontend/component/E2E tests;
- renderer tests;
- storage/source tests;
- stage-gate tests.

## 21. Coverage

Exact percentages.

## 22. Infrastructure

Docker services, image versions, ports, healthchecks.

## 23. Security

Source upload safety, storage, prompt-injection boundary, SVG, secrets, isolation.

## 24. AI configuration

Prompt keys/versions and `maxOutputTokens` for each generator.

## 25. Known limitations

Only real remaining limitations.

Do not hide unsupported automatic OCR/audio transcription if not implemented.

## 26. Commands actually run

Exact commands.

## 27. Commit history

List every commit SHA + subject and why it is a coherent unit.

## 28. Git status

Clean/dirty, stash preserved, remote sync.

## 29. Human action required

Expected final line:

```text
Review the PR and merge manually into develop.
```

If something else is required, explain the external blocker precisely.

---

# 59. STOP CONDITION

After the final report:

STOP.

Do not merge the PR.

Do not begin second-partial diagram work.

Do not begin Construction.

Wait for human review.
