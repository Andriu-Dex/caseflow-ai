# Increment 1C — AI Generation Foundation

Date: 2026-09-21
Branch: `feature/ai-generation-foundation`

## 1. Implemented

- Provider-independent structured-generation foundation.
- Disabled/manual mode and one OpenAI-compatible adapter.
- Zod validation before returning typed candidates.
- Versioned code-based prompt registry.
- Persistent `AIRun` audit metadata with exact optional context-version provenance.
- No Requirements model, prompt, artifact persistence, or public generation endpoint.

## 2. AI package architecture

`packages/ai` owns contracts, normalized errors, prompt registry, orchestration, disabled provider, deterministic fake provider, and the audit-recorder port. The path is `Feature → AIOrchestrator → AIProvider → adapter`. It has no Prisma, NestJS, product-feature, or vendor dependency.

## 3. Provider abstraction

Final `AIProvider` interface:

```ts
interface AIProvider {
  readonly id: string;
  generateStructured(request: AIProviderRequest): Promise<AIProviderResponse>;
}
```

The request carries capability, purpose, separate system instructions and user messages, JSON Schema, schema name, model profile/override, optional temperature, timeout, and optional cancellation signal. The response normalizes provider/model, parsed payload, optional raw text, nullable token usage, and latency. Errors use the six required codes.

## 4. Orchestrator

`AIOrchestrator.generateStructured<T>` resolves the exact prompt key/version, records a started run, invokes the provider, validates the payload with the feature-supplied `ZodType<T>`, records success/failure, and returns `ValidatedGenerationCandidate<T>`. It never calls product repositories or persists Artifacts.

## 5. Provider adapter

The exact initial adapter is `OpenAICompatibleProvider` in `@caseflow-ai/integrations`. It uses native `fetch` against only `{AI_BASE_URL}/chat/completions`, uses the configured/explicit model, sends strict `json_schema` response format, parses defensively, and normalizes HTTP/network/timeout failures. No vendor SDK was added.

## 6. Prompt versioning

`PromptDefinition` identifies every prompt by stable `key` plus positive integer `version`, and includes capability, purpose, and system instructions. `PromptRegistry` rejects duplicate identities and requires an exact lookup. No Requirements prompt was introduced; tests use an in-memory `foundation.probe@1` definition only.

## 7. AIRun/audit model

Physical table: `ai_runs`.

Columns: `id`, `project_id`, `source_artifact_version_id`, `provider`, `model`, `capability`, `purpose`, `prompt_key`, `prompt_version`, `status`, `started_at`, `completed_at`, `latency_ms`, `input_tokens`, `output_tokens`, `total_tokens`, `error_code`, `input_hash`, `output_hash`.

Persisted: scope/provenance identifiers, provider/model, capability/purpose, prompt identity, state/timing, nullable usage, normalized error code, and SHA-256 input/output hashes. Not persisted: API keys, authorization headers, request/response bodies, raw provider payloads, stack traces, or secret diagnostics.

## 8. Configuration

Exact variables:

- `AI_PROVIDER=disabled|openai_compatible`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_TIMEOUT_MS` (default `30000`, maximum `300000`)

Disabled is the default and requires no other AI variable. Selecting `openai_compatible` validates all required settings through Zod before use. Dependencies added: `zod@4.6.5` to `@caseflow-ai/ai` and `@caseflow-ai/config`; workspace dependency `@caseflow-ai/ai` to integrations; workspace dependencies `ai`, `config`, and `integrations` to the API. No third-party provider SDK was added.

## 9. Security/prompt-injection boundary

System policy comes only from `PromptDefinition.systemInstructions`; project/context content remains in messages whose type only permits role `user`. Tests assert this separation. Serialized `AIError` exposes only normalized code and safe message. Adapter diagnostics never include response bodies, keys, or authorization values.

## 10. Database migration

Added official migration `20260921220000_ai_generation_foundation`. It creates `ai_run_status`, `ai_error_code`, and `ai_runs`; adds the composite unique target on `artifact_versions(id, project_id)`; and enforces project-scoped source-version provenance with a composite foreign key. Checks enforce hashes, nonnegative metrics, valid state/timestamps, and project presence for source provenance. The same four-migration history passed on `caseflow` and `caseflow_test`; `db push` was not used.

## 11. Tests

Unit suite: 20 files, 103 tests passed. Integration suite: 8 files, 50 tests passed. Coverage includes valid/invalid structured output, disabled/provider/timeout/rate-limit errors, metadata and provenance, prompt separation, secret-safe errors, configuration, mocked fetch URL/model/auth, malformed/non-2xx responses, zero retries, recorder success/failure, nullable usage, migration presence, and physical persistence.

All ordinary tests use `FakeAIProvider` or mocked `fetch`. Searches and test definitions show no live provider invocation; CI received no secrets or workflow changes.

## 12. Coverage

- Statements: 87.23%
- Branches: 81.29%
- Functions: 90.38%
- Lines: 88.85%

All required 70% thresholds pass unchanged.

## 13. CI impact

No workflow changes and no AI secrets. Existing migration deployment automatically applies the new migration. Unit/integration CI remains deterministic and network-free with respect to AI.

## 14. Verified

- Formatting, lint, typecheck, build, unit tests, coverage, and `pnpm verify`.
- Prisma schema validation.
- Fresh official migrations on both disposable development and test databases.
- Integration tests and `pnpm verify:integration`.
- Existing OpenAPI behavior remains unchanged because no AI endpoint exists.

Commands actually run (including diagnostic/initial runs):

```text
git status --short --branch
git branch --show-current
git stash list
git fetch origin --prune
git switch develop
git merge --ff-only origin/develop
git switch -c feature/ai-generation-foundation
rg ... (specification/config/source discovery)
pnpm install
pnpm db:generate
pnpm typecheck                    # initial failure from stale workspace declarations; scripts corrected
pnpm format
pnpm typecheck
pnpm test
pnpm format:check                 # initial failure on two newly added unformatted tests; formatted afterward
pnpm lint
pnpm test:coverage
pnpm format
pnpm db:validate
pnpm build
git diff --check
docker version --format ...
docker ps -a --filter name=caseflow-ai-1c-test ...
docker run --name caseflow-ai-1c-test ... -p 55432:5432 -d pgvector/pgvector:pg18-trixie
docker exec caseflow-ai-1c-test pg_isready -U caseflow
pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:test:prepare
pnpm db:test:migrate
pnpm test:integration
pnpm verify:integration
pnpm db:migrate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
pnpm verify
```

## 15. Not verified

No live provider was configured or manually probed. No `ai:probe` command was added because it is not required for this slice. External-provider compatibility beyond the mocked OpenAI-compatible HTTP contract was not claimed.

## 16. Relevant decisions

- Retry policy: zero automatic retries; every request results in at most one HTTP attempt.
- Timeout policy: adapter-level `AbortController`, bounded by the smaller of invocation/configured timeout; default 30 seconds, configured maximum 300 seconds.
- Schema validation: Zod is converted to JSON Schema for the provider request, then the returned parsed payload must pass the original Zod schema before it can become a typed candidate.
- Prompt identity: exact `prompt_key` and integer `prompt_version` are returned and persisted.
- Context provenance: callers pass both `projectId` and exact `sourceArtifactVersionId`; the orchestrator carries them and the database enforces the version belongs to that project.
- A sophisticated `ModelRouter` was intentionally deferred: the minimal profile/explicit-model abstraction satisfies 1C without inventing multi-provider policy.

## 17. Git branch/status

Work remains uncommitted on `feature/ai-generation-foundation`, as requested. Nothing was pushed or merged, Increment 1D was not started, and the pre-existing stash was preserved untouched.
