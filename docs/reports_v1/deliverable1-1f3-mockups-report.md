# Increment 1F.3 — Mockups (deterministic UI Blueprint preview)

Date: 2026-09-22

## 1. Implemented

The `MOCKUP` artifact: a deterministic, versioned, safe visual preview derived from an exact `APPROVED` `UI_BLUEPRINT` version. No AI, no raster image, no candidate stage — creation itself is the (SYSTEM_GENERATED) generation step, matching the existing Use Case Diagram precedent rather than the candidate-first pattern used by Navigation/Architecture/UI Blueprint.

## 2. Rendering

`MockupRenderer.render(content: UiBlueprintContent)` builds one bordered "screen card" per blueprint screen (sorted ordinally by `localId` for determinism): a header bar with the screen name, a row per section, small button-shaped rects for primary/secondary actions, and a form summary line. All screen/section/action text is XML-escaped before insertion (`&`, `<`, `>`, `"`), since UI Blueprint content can itself be AI-generated and therefore untrusted. The resulting SVG is still passed through the existing `sanitizeDiagramSvg()` allowlist-based sanitizer before being stored — the same safety boundary used by every other rendered-SVG code path in the app, applied here even though this renderer (not an external service like Kroki) is the one producing the SVG.

## 3. Data model / migration

No new migration was needed: `MockupDetail` (`mockup_details`) and its validating trigger (`mockup_validate_detail`, requiring an exact `APPROVED` `UI_BLUEPRINT` version in the same project) were already added in `20260924000000_structured_analysis` during Increment 1F.2, anticipating this work. `MOCKUP` was already in the generic-artifact-creation blocklist and the first-deliverable type catalog.

## 4. API

`/projects/{projectId}/mockups`:

- `POST /` — create (requires `uiBlueprintVersionId`).
- `GET /` — list.
- `GET /{mockupId}` — get (metadata + exact source reference).
- `GET /{mockupId}/preview` — the safe SVG preview.
- `POST /{mockupId}/versions` — create a new version (e.g. re-render against an updated approved blueprint version).
- `POST /{mockupId}/versions/{versionId}/transition` — lifecycle transition.

Approval is always explicit: a created/versioned Mockup starts at `GENERATED`, never `APPROVED`.

## 5. Tests

- Unit: `mockup-renderer.spec.ts` (3 tests — deterministic output, unsafe-content escaping equivalent to the existing PlantUML/Mermaid security tests, screen ordering), `mockups.service.spec.ts` (6 tests — creation from an approved source, rejection of missing/unapproved/cross-project sources, list/get/preview with project isolation, versioning, lifecycle gate), `mockups.controller.spec.ts` (1 test asserting every route delegates correctly).
- Integration (real Postgres): `mockups.integration.spec.ts` (4 tests — end-to-end creation from a real approved `UI_BLUEPRINT` artifact with a real preview SVG assertion, draft/cross-project source rejection, versioning + stage-gated approval, project isolation for both `get` and `getPreview`).

## 6. Coverage

```
Statements : 82.97% (1399/1686)
Branches   : 74.19% (486/655)
Functions  : 82.6% (413/500)
Lines      : 83.75% (1299/1551)
```

All global thresholds (≥70%) remain cleared; `mockups.service.ts` and `mockup-renderer.ts` are individually at 98–100% line coverage.

## 7. Verified

- `pnpm db:generate`, `pnpm db:validate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 41 files / 244 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (15 files / 92 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` (full pipelines) — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.

## 8. Not verified

- Everything already listed as not verified in the 1F.2 report still applies: Project Sources intake, ISO 29148-aligned Requirements, cross-stage traceability/readiness/export, the frontend, and PR/CI. This increment closes only the Mockup gap.

## 9. Relevant decisions

- Mockup generation is immediate/deterministic (like Use Case Diagram), not candidate-first (unlike Navigation/Architecture/UI Blueprint) — there is nothing for an AI to propose or a human to select between; the only human decision is the lifecycle approval of the rendered result.
- The renderer is intentionally simple (fixed section cap, naive button-width heuristic) — sufficient to "clearly communicate screen structure" per spec §18 without building a general layout engine.

## 10. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `4fdd148` — `feat(ui-design): add deterministic mockups derived from approved UI Blueprint` (14 files changed).
- Not pushed; no PR opened yet.
