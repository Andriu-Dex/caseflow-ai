# Increment 1H — Cross-stage approval-gate audit (Phase D)

Date: 2026-09-23

## 1. Implemented

Audited the entire official dependency chain (`requirements.md` Phase D) and closed the one confirmed gap: **official Requirements generation now requires the APPROVED Project Context to have at least one linked APPROVED Project Source version**, not merely to be `APPROVED` itself.

## 2. The gap and the fix

Before this increment, `RequirementsService.generate()` only checked that the referenced Context version was `APPROVED` and in the same project — it did not check whether that Context had any supporting approved source knowledge behind it (a gap only possible to close after Increment 1G added the Context↔Sources link at all). Per the explicit gate condition in `requirements.md`/`instruction.md`:

> Approved Project Sources / usable project knowledge + APPROVED Project Context linked to those exact source versions → official Requirements generation.

`RequirementsService.generate()` now throws `422` with an explicit message when `projectContextDetail.sources.length === 0`. A Context can still be created and even approved without any linked source (manual/preliminary drafting remains possible), but it cannot be used for **official** Requirements generation — the two paths are now clearly distinct, and the manual path can never silently satisfy the official one.

## 3. Full chain audit (evidence, not just claims)

Verified by direct code inspection of every official `generate()`/creation method's Prisma `where` clause:

| Boundary | Gate found | Cross-project rejected | Exact-version (no "latest") |
|---|---|---|---|
| Source/Context → Requirements | `status: 'APPROVED'` + **now** ≥1 linked source | yes | yes (exact `sourceContextVersionId`) |
| Requirements → Use Cases | `validateRequirements(..., approved=true)` requires `status: 'APPROVED'` | yes | yes |
| Requirements/Use Cases → Data Model | `status: 'APPROVED'` on both source lists | yes | yes |
| Approved analysis → Navigation | `ELIGIBLE_SOURCE_TYPES.NAVIGATION_TREE` + `status: 'APPROVED'` | yes | yes |
| Approved analysis/navigation → Software Architecture | same mechanism, `ELIGIBLE_SOURCE_TYPES.SOFTWARE_ARCHITECTURE` | yes | yes |
| Approved analysis/navigation → System Architecture | same mechanism, `ELIGIBLE_SOURCE_TYPES.SYSTEM_ARCHITECTURE` | yes | yes |
| Approved Navigation/Use Cases/Data Model/Architecture → UI Blueprint | same mechanism, `ELIGIBLE_SOURCE_TYPES.UI_BLUEPRINT` | yes | yes |
| Approved UI Blueprint → Mockup | dedicated `status: 'APPROVED', artifactTypeCode: 'UI_BLUEPRINT'` check in `MockupsService` | yes | yes |

One reusable mechanism (`ELIGIBLE_SOURCE_TYPES` + exact-APPROVED-version Prisma filtering) already covers Navigation/Architecture/UI Blueprint generation uniformly; Use Cases and Data Model each have their own analogous, independently-audited check. A separate `approved: boolean` parameter in `UseCasesService.validateRequirements` deliberately distinguishes manual authoring (any exact Requirement reference, for drafting) from official AI generation (`APPROVED` only) — confirmed as an intentional design, not a gap.

## 4. New tests added (closing untested boundaries, not re-testing what already passed)

- `requirements.integration.spec.ts`: real Source → approval → source-backed Context → official generation (updated the existing generation test to go through this path instead of a source-less Context), plus a new dedicated test proving generation from a source-less `APPROVED` Context is rejected.
- `structured-analysis.integration.spec.ts`: UI Blueprint generation from an exact `APPROVED` Navigation Tree source (the `ELIGIBLE_SOURCE_TYPES.UI_BLUEPRINT` boundary had no direct test before — only `NAVIGATION_TREE`'s own generation was exercised), and a dedicated "exact version, never implicit latest" test: an artifact's `APPROVED` version 1 remains independently selectable and usable for official generation after a `DRAFT` version 2 is created from an edit, while the `DRAFT` v2 is rejected the same way any other unapproved version would be.
- `requirements.service.spec.ts`: unit coverage for the new source-backed-context gate (missing sources → rejected with the exact expected message; present → generation proceeds).

## 5. Coverage

```
Statements : 83.06% (1408/1695)
Branches   : 74.5% (494/663)
Functions  : 82.66% (415/502)
Lines      : 83.84% (1308/1560)
```

All global thresholds (≥70%) remain cleared.

## 6. Verified

- `pnpm db:validate`, `pnpm db:generate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 41 files / 246 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (15 files / 97 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` — no whitespace issues.

## 7. Not verified / not yet done

Phases E (staleness/potential-impact), F (global traceability), G (readiness), H (export), I (frontend), E2E, and push/PR/CI remain outstanding, per `instruction.md`'s own phase ordering. This increment closes Phase D only.

## 8. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `4f59c94` — `feat(workflow): enforce official source-backed Requirements gate; audit cross-stage gates` (4 files changed).
- Not pushed; no PR opened yet.
