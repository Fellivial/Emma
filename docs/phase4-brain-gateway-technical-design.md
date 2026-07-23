# Emma Brain Gateway — Phase 4: Technical Design

## Document Status

- Roadmap: [Brain Gateway Roadmap v1.0 (Frozen)](roadmaps/brain-gateway-roadmap-v1.md)
- Phase: Phase 4 — Technical Design
- Type: **Specification-only.** This document translates the nine Accepted ADRs (0006–0014) into implementation-ready technical specifications — module structure, interfaces, contracts, sequence diagrams, error model, migration strategy, testing strategy. It does **not** modify any ADR, does **not** modify the Phase 3.1 Architecture Freeze, does **not** introduce new architecture, does **not** write production code, does **not** perform a migration, and does **not** change runtime behavior. Every specification decision below resolves a question an ADR explicitly deferred to this phase — it does not re-decide anything an ADR or the Freeze already decided.
- Branch: `feature/brain-gateway-phase4-technical-design`
- Baseline treated as approved and not re-derived: [Brain Gateway Roadmap v1.0](roadmaps/brain-gateway-roadmap-v1.md), [Phase 3.1 Architecture Freeze](phase3-1-brain-gateway-architecture-freeze.md), [Phase 3.2 ADR Authoring](phase3-2-brain-gateway-adr-authoring.md), [Phase 3.3 ADR Independent Review](phase3-3-adr-independent-review.md) (PR #155, merged), [ADR-0003](adr/ADR-0003-brain-gateway-architecture.md), [ADR-0006](adr/0006-provider-registry-capabilities-descriptor-adapter-layer.md)–[ADR-0014](adr/0014-brain-gateway-extension-model.md).
- Repository state reviewed directly (not re-derived from prior phase prose): `src/core/brain/{gateway,types}.ts`, `src/core/brain/providers/openrouter.ts`, `src/core/models.ts`, `src/core/context-manager.ts`, `src/app/api/emma/route.ts`, `src/core/memory-db.ts`, `src/core/personas.ts`, `src/core/agent-loop.ts`, `src/lib/{errors,embeddings}.ts`, `src/core/cost-gate.ts`, `src/core/env-validation.ts`, `supabase/schema.sql`, `eslint.config.mjs`, `vitest.config.ts`, `tests/unit/*.test.ts`, `package.json`.

This single document contains the Phase 4 deliverables as numbered sections, consistent with the single-document precedent set by Phase 3.1/3.2/3.3:

1. Current Implementation Baseline (Review Existing Implementation)
2. Implementation Boundary Definition
3. Provider Registry Technical Design (ADR-0006)
4. Capability Descriptor Technical Design (ADR-0006)
5. Routing Engine Technical Design (ADR-0007)
6. Context Pipeline Technical Design (ADR-0008)
7. Memory Ranking Technical Design (ADR-0009)
8. Prompt Composition Technical Design (ADR-0010)
9. Operational Instrumentation Design (ADR-0011)
10. Configuration System Design (ADR-0012)
11. Extension Model Technical Design (ADR-0013)
12. Governance Technical Design (ADR-0014)
13. Public Interface Specification
14. Internal Component Design
15. Sequence Diagram Package
16. State Transition Design
17. Error Handling Specification
18. Migration Strategy
19. Testing Architecture / Strategy
20. Technical Traceability Matrix
21. Technical Design Consistency Review
22. Technical Design Readiness Report
23. Explicit Non-Goals Confirmation
24. Success Criteria Checklist

---

## 1. Current Implementation Baseline

Reviewed directly against the repository, not assumed from ADR prose.

### 1.1 Existing interfaces / public contracts

- `src/core/brain/gateway.ts` exports exactly four functions — `brainChat`, `brainChatStream`, `brainEmbed`, `isBrainConfigured` — plus re-exports every type from `types.ts`. It holds one module-level `const provider: BrainProvider = createOpenRouterProvider()`, chosen once at import time. This is the single seam Provider Registry (§3) replaces.
- `src/core/brain/types.ts` defines the full normalized contract: `BrainTask` (closed 3-value union), `BrainMessage`/`BrainContentPart`/`BrainToolCall`/`BrainToolDefinition` (OpenAI-compatible transcript shape, deliberately preserved per its own header comment for `tasks.step_transcript` compatibility), `BrainChatRequest`, `BrainEmbedRequest`, `BrainChatResult`/`BrainEmbedResult` (value-returned `{ok:false, error}` for upstream HTTP errors), `BrainStream`/`BrainStreamEvent`/`BrainStreamResult` (async-generator streaming, single trailing `done` event), `BrainRequestError` (status/code/message/bodyPreview/retryable), `BrainProvider` (four-method interface: `name`, `isConfigured`, `chat`, `chatStream`, `embed`).
- `src/core/brain/providers/openrouter.ts` is the sole `BrainProvider` implementation. It owns: OpenRouter URLs, auth headers, `TASK_MODELS` (task→fallback-array map built from `src/core/models.ts`), response/stream normalization, `normalizeHttpError` (including the provider-specific `529` mapping), and embedding calls.
- `src/core/models.ts` is the single source of truth for OpenRouter model IDs (`MODEL_BRAIN`, `MODEL_VISION`, `MODEL_UTILITY` + fallback arrays), consumed only by `openrouter.ts`.

### 1.2 Dependency graph (as it exists today)

```
Application Layer (15 files import from @/core/brain/gateway or @/lib/embeddings)
  route.ts, vision/route.ts, summarize/route.ts, ingest/whatsapp/route.ts,
  history/route.ts, emotion/route.ts, persona/route.ts, memory/route.ts,
  cron/reflection/route.ts, agent-loop.ts, tool-registry.ts,
  task-summarizer.ts, pattern-detector.ts, embeddings.ts
        │  imports brainChat / brainChatStream / brainEmbed (never provider-shaped types)
        ▼
src/core/brain/gateway.ts  ──imports──►  src/core/brain/providers/openrouter.ts
        │                                        │
        │                                        ├─ imports src/core/models.ts (model IDs)
        │                                        └─ imports src/lib/errors.ts (fetchWithRetry,
        │                                           shared retryOn list incl. provider-specific 529)
        ▼
src/core/brain/types.ts (imported by both gateway.ts and openrouter.ts; zero runtime code)
```

`embeddings.ts` already routes through `brainEmbed` — the ADR-0003-era fork this ADR's Context section describes as historical (Phase 7A finding) was closed during Phase 7B; it is **not** an open gap Phase 4 needs to re-close. This confirms the repository is at the Phase 7B-complete baseline every ADR assumes.

### 1.3 Runtime flow (today)

`route.ts` (streaming chat): auth → waitlist gate → per-user rate limit → sanitise input → cost gate → build messages (client-truncated to `MAX_HISTORY_MESSAGES = 20`, server has no independent token accounting) → `buildSystemPrompt()` (flattens `buildSystemPromptBlocks()`'s two blocks to one string) → `brainChatStream()` → SSE deltas to client → `parseEmmaResponse()` → `response-validator.ts` (log-only) → `done` event with parsed expression/routineId → `saveCompanionState()`.

`context-manager.ts` (client hook): `useContextManager` computes `calculateBudget()` against a 100k-token budget (4-char-per-token approximation), triggers `/api/emma/summarize` when 75% utilized, falls back to `trimToFit()` on failure — entirely independent of `route.ts`'s 20-message cap.

`memory-db.ts`'s `getRelevantMemoriesForUser()`: fetches **all** active rows for a user (no DB-side `LIMIT`), scores in-process by keyword-overlap × confidence only when row count exceeds `limit`.

`agent-loop.ts`: calls `brainChat()` per step (up to `task.maxSteps`), dispatches tool calls via `tool-registry.ts`, no routing/capability logic — task tier is fixed per call site.

### 1.4 Extension points that exist today

- `BrainProvider` interface (four methods) — the only substitutability seam in the Brain domain.
- `CostGateDependencies` (`src/core/cost-gate.ts`) — the **only** other place in the Application Layer using dependency inversion (a DI-shaped dependencies object with a `defaultDependencies` production implementation, injectable for tests). This is the concrete precedent Technical Design reuses for every new DI-shaped interface below, per ADR-0013's decision to make DI a systemic convention.
- `document_chunks` table (`supabase/schema.sql:1153-1187`) — an existing pgvector pipeline: `extensions.vector(1536)` column, `hnsw (embedding extensions.vector_cosine_ops)` index, a `match_document_chunks(query_embedding, match_user_id, match_threshold, match_count)` SQL RPC returning ranked rows. **This is a proven, shipped precedent for exactly the database-side ranking mechanism ADR-0009 requires** — Memory Ranking Infrastructure (§7) is designed as a direct structural analog, not a novel mechanism.

### 1.5 Configuration model (today)

`src/core/env-validation.ts`'s `PRODUCTION_REQUIRED_ENV` is a flat array of 13 required variable names, including `OPENROUTER_API_KEY` unconditionally. `validateEnvironment()` checks presence/placeholder/format per variable with no per-variable conditional logic and no concept of "one of several."

### 1.6 Testing infrastructure (today)

Vitest (`vitest.config.ts`): `tests/**/*.test.ts`, `@` alias to `src`, `node` environment, coverage over `src/core/**` and `src/lib/**`. 63 existing test files in `tests/unit/`, flat structure, no subdirectories. Relevant existing coverage: `brain-gateway.test.ts`, `openrouter.test.ts`, `context-manager.test.ts`, `memory-relevance.test.ts`, `personas-custom-routines.test.ts`, `errors.test.ts`, `env-validation.test.ts`. No provider-conformance suite exists (cannot exist — `n=1`, per every ADR's accepted "n=1 evidentiary risk"). ESLint (`eslint.config.mjs`) is a flat config extending `eslint-config-next/core-web-vitals` with a small custom rules block; **no import-boundary or dependency-inversion lint plugin is installed today** (confirmed: no `eslint-plugin-boundaries`, no `eslint-plugin-import` restricted-paths rule configured) — ADR-0013's lint rules are new tooling, not an extension of existing tooling.

---

## 2. Implementation Boundary Definition

### 2.1 In scope for the eventual implementation phase (Phase 6), specified here

| New/changed module                                                                                                           | Domain                         | ADR                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------- |
| `src/core/brain/registry.ts` (new)                                                                                           | Provider                       | ADR-0006                     |
| `src/core/brain/types.ts` (extended: `CapabilitiesDescriptor`, `correlationId`, `PROVIDER_UNAVAILABLE`)                      | Provider, Operational, Routing | ADR-0006, ADR-0011, ADR-0007 |
| `src/core/brain/providers/openrouter.ts` (extended: exports its `CapabilitiesDescriptor`; 529 handling stays provider-local) | Provider                       | ADR-0006                     |
| `src/core/brain/routing.ts` (new)                                                                                            | Routing                        | ADR-0007                     |
| `src/core/brain/gateway.ts` (extended: registry-backed selection, instrumentation wrapper)                                   | Provider, Operational          | ADR-0006, ADR-0011           |
| `src/core/context-pipeline.ts` (new)                                                                                         | Context                        | ADR-0008                     |
| `src/core/memory-db.ts` (internals only; signature preserved)                                                                | Memory                         | ADR-0009                     |
| `supabase/schema.sql` (additive: `memories.embedding`, `match_memories` RPC)                                                 | Memory                         | ADR-0009                     |
| `src/core/personas.ts` (internal restructuring, then 5 external callers)                                                     | Prompt                         | ADR-0010                     |
| `src/core/env-validation.ts` (extended: conditional provider check)                                                          | Configuration                  | ADR-0012                     |
| `eslint.config.mjs` (extended: `no-restricted-imports` rules)                                                                | Extension                      | ADR-0013                     |
| `docs/brain-gateway-extension-model.md` (new, authored in Phase 6 per §12)                                                   | Governance                     | ADR-0014                     |

### 2.2 Out of scope (unchanged by this phase and by the eventual implementation)

Everything ADR-0003 already scoped out (Policy Routing/Layer 3, a second real provider, a local scheduler, workspace rendering, memory _algorithms_ beyond the ranking mechanism itself, emotion algorithms, agent orchestration redesign, fine-tuned models) remains out of scope. Additionally out of scope for Phase 4/6 specifically: Configuration's Runtime Configuration Store and Feature-Flag Layer (ADR-0012, activation-contingent, not designed below beyond noting their future trigger condition); Extension's runtime-assertion boundary check (ADR-0013 §11.1C, optional defense-in-depth, not designed); a distinct workflow-orchestration layer (ADR-0013 §11.4B, rejected).

### 2.3 Module ownership and responsibilities

| Layer (per ADR-0003)    | Owns                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application Layer       | Context Pipeline (`context-pipeline.ts`), Prompt Pipeline (`personas.ts`), Memory Ranking (`memory-db.ts`), Configuration boot validation (`env-validation.ts`)              |
| Brain Gateway           | Provider Registry (`registry.ts`), Capabilities Descriptor (type, populated per-provider), Routing Engine (`routing.ts`), Operational Instrumentation (`gateway.ts` wrapper) |
| Provider Layer          | Adapter Layer responsibilities (wire-format/error normalization), one file per provider (`providers/openrouter.ts` today)                                                    |
| Cross-cutting / tooling | Extension enforcement (`eslint.config.mjs`), Governance artifact (`docs/brain-gateway-extension-model.md`)                                                                   |

No component crosses the Application ↔ Gateway ↔ Provider boundary ADR-0003 established. The Context Pipeline and Prompt Pipeline remain Application-Layer components that _call_ the Gateway (for summarization and embedding respectively) — they do not move into the Gateway, consistent with ADR-0008's rejection of the Gateway-Adjacent-Service candidate.

---

## 3. Provider Registry Technical Design (ADR-0006)

### 3.1 Structure

```ts
// src/core/brain/registry.ts
export interface RegisteredProvider {
  provider: BrainProvider;
  capabilities: CapabilitiesDescriptor;
}

export interface ProviderRegistry {
  /** Throws if a provider with this name is already registered (boot-time programmer error). */
  register(provider: BrainProvider, capabilities: CapabilitiesDescriptor): void;
  get(name: string): RegisteredProvider | undefined;
  /** Providers whose isConfigured() === true, in registration order. */
  getConfigured(): RegisteredProvider[];
  findByCapability(requirement: Partial<CapabilitiesDescriptor>): RegisteredProvider[];
  list(): RegisteredProvider[];
}

export function createProviderRegistry(): ProviderRegistry;
```

### 3.2 Lifecycle

Constructed once, at `gateway.ts` module load, replacing today's `const provider: BrainProvider = createOpenRouterProvider()`:

```ts
const registry = createProviderRegistry();
registry.register(createOpenRouterProvider(), OPENROUTER_CAPABILITIES);
```

No runtime add/remove after boot — this is deliberately **not** a Runtime Configuration Store (ADR-0012 §2.7 defers that). The Registry is a boot-time-populated, per-request-_queryable_ structure, not a per-request-_mutable_ one. This satisfies ADR-0006's "replacing the Gateway's single module-level provider reference with a lookup" without accidentally implementing the deferred Runtime Configuration Store candidate.

### 3.3 Registration

`register()` validates: (a) no existing entry with the same `provider.name` (throws `Error("Provider '<name>' already registered")` — a boot-time fail-loud, not a runtime-recoverable condition); (b) `capabilities` has every required field present and `contextWindowTokens > 0` (§4.2) — an incomplete descriptor is rejected at registration, not silently accepted, directly closing the GAP-01 "proven only by inspection" problem at the earliest possible point.

### 3.4 Lookup

`gateway.ts`'s three exported functions change from `provider.chat(request)` to routing through the Routing Engine (§5), which itself queries the Registry. `getConfigured()` returns the today-single-entry list; `findByCapability()` is exercised by Routing Layer 2 and by the provider-conformance test suite (§19.3) with fake registered providers, but is not exercised by production traffic while `n=1` holds (accepted risk, unchanged from ADR-0006 §Consequences).

### 3.5 Initialization ordering

Registry construction and provider registration happen synchronously at module import — identical timing to today's module-level `const`, so this is a drop-in replacement with zero change to when `OPENROUTER_API_KEY` is read or when network calls could first occur (none occur at construction; `isConfigured()` remains a pure environment check).

---

## 4. Capability Descriptor Technical Design (ADR-0006)

### 4.1 Schema shape decision (resolves Freeze §7 clarification 1)

ADR-0006 named this the central open question: "too coarse (a boolean per capability) vs. too fine (a richer negotiation protocol)." Decision: **boolean-per-capability, plus one numeric field**, provider-level (not per-model). Rationale: every capability the codebase exercises today — streaming, vision, tool-calling, embeddings, structured output — is used as a hard yes/no gate at each of the 15 call sites (a call site either needs vision or it doesn't; there is no partial/negotiated vision support anywhere in the current code). A negotiation protocol would be speculative machinery for a distinction (partial capability support) that does not exist in any current caller. `contextWindowTokens` is the one field needed as a number, not a boolean, because the Context Pipeline (§6) needs a numeric budget input — but it is **provider-level**, not per-model, and is documented as a conservative approximation (see §4.3), consistent with Configuration/Routing not yet doing per-model negotiation (that is Layer-3/policy-routing territory, explicitly deferred).

```ts
// src/core/brain/types.ts (addition)
export interface CapabilitiesDescriptor {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  supportsEmbeddings: boolean;
  supportsStructuredOutput: boolean; // responseFormat / json_schema generation
  /** Conservative (minimum) context window across this provider's task-tier model set, in tokens. */
  contextWindowTokens: number;
}
```

### 4.2 Validation

Performed at `registry.register()` time (§3.3): all six fields must be present (TypeScript's structural typing already enforces this at compile time for any literal passed in-repo; the runtime check exists only to guard a dynamically-constructed descriptor, e.g. one deserialized from configuration in a future phase) and `contextWindowTokens` must be a positive integer.

### 4.3 OpenRouter's descriptor (Phase 6 authoring reference, not created by Phase 4)

For the record, illustrating that the schema is satisfiable by the existing provider without redesign: `supportsStreaming: true`, `supportsVision: true` (task="vision" call sites already send `image_url` parts), `supportsToolCalling: true` (agent-loop already sends `tools`), `supportsEmbeddings: true`, `supportsStructuredOutput: true` (`responseFormat` already implemented in `buildChatBody`), `contextWindowTokens`: the smallest advertised window across `BRAIN_MODELS`/`VISION_MODELS`/`UTILITY_MODELS`' fallback entries — a static, hand-maintained constant, not derived from a live OpenRouter API call (no such call exists today and adding one is out of scope for this phase).

### 4.4 Versioning and compatibility

No schema version field is introduced. With `n=1`, versioning is speculative (an accepted position, matching every other domain's `n=1` risk acceptance). The extensibility path is additive: a new capability becomes a new optional-with-default-false boolean field; existing providers are unaffected until they explicitly opt in. This is recorded, not implemented, as the schema-evolution rule the Governance artifact (§12) documents.

---

## 5. Routing Engine Technical Design (ADR-0007)

### 5.1 Structure

```ts
// src/core/brain/routing.ts
export interface RoutingRequest {
  task: BrainTask;
  /** Hard requirements only — Layer 2 is inactive when omitted or empty. */
  requiredCapabilities?: Partial<CapabilitiesDescriptor>;
}

export interface RoutingResult {
  registered: RegisteredProvider;
  /** Which layer produced this selection — lets callers/tests assert which layers are live. */
  resolvedBy: "task" | "capability";
}

/** Returns null when requiredCapabilities is non-empty and no configured provider satisfies it. */
export function routeRequest(
  registry: ProviderRegistry,
  request: RoutingRequest
): RoutingResult | null;
```

### 5.2 Layer 1 — Task routing (active immediately, zero behavior change)

When `requiredCapabilities` is omitted or `{}`: `routeRequest` returns `registry.getConfigured()[0]` (today's single configured provider) tagged `resolvedBy: "task"`. This is byte-for-byte today's selection behavior — the task tier itself continues to select the model array inside the provider's Adapter Layer (`TASK_MODELS`, unchanged), exactly as ADR-0007 specifies ("Layer 1 already exists... requires no change").

### 5.3 Layer 2 — Capability routing (frozen target, structurally present, inert until n≥2)

When `requiredCapabilities` is non-empty: `routeRequest` calls `registry.findByCapability(requiredCapabilities)`, restricted to `getConfigured()` results, and returns the first match tagged `resolvedBy: "capability"`, or `null` if none match. **"No match, pass through" contract (resolves Freeze §7/ADR-0007's deferred item):** a `null` result is _not_ silently widened to "return any configured provider anyway" — that would defeat the purpose of a hard capability requirement. Callers (Gateway functions) translate `null` into a `BrainRequestError` with the new `PROVIDER_UNAVAILABLE` code (§17.1) rather than guessing. No caller populates `requiredCapabilities` yet (n=1 — there is exactly one provider, so any requirement it satisfies is trivially true and any it doesn't makes the field pointless today); Layer 2 ships present-but-unexercised-by-production-traffic, exercised only by the provider-conformance suite (§19.3) using fake registered providers. This is precisely the "Layer 2 frozen as the target but not yet activatable" state ADR-0007 describes.

### 5.4 Layer 3 — Policy routing (explicitly not designed)

No interface is introduced for Layer 3. `RoutingRequest` has no policy field, reserved or otherwise — inventing even a placeholder field would be speculative design of a layer ADR-0007 explicitly defers pending an ADR-0003 scope revisit that has not happened. This is a deliberate omission, not an oversight.

### 5.5 Activation-ordering signal

`RoutingResult.resolvedBy` is the mechanism ADR-0007 requires ("must clearly signal which layers are live") — a caller or test can assert `resolvedBy === "task"` today and expect that invariant to hold until a second provider and a populated `requiredCapabilities` together produce `"capability"`.

---

## 6. Context Pipeline Technical Design (ADR-0008)

### 6.1 Reconciliation decision (resolves Freeze §7 clarification 2)

The reconciled semantics converges on the **token-budget model** (today's client-side `context-manager.ts`), extended to also run server-side, with the message-count concept demoted from a competing cap to a floor. Rationale: message-count is a strictly less informative special case of token accounting (it assumes every message costs the same, token-budget does not); nothing is lost by generalizing to token-budget everywhere, whereas the reverse (generalizing to message-count) would regress the client's existing, more accurate accounting. `route.ts`'s flat `MAX_HISTORY_MESSAGES = 20` is superseded, not merged — GAP-09 is closed by having one authority, not by having the two prior authorities average their answers.

### 6.2 Structure

```ts
// src/core/context-pipeline.ts
export interface ContextPipelineOptions {
  systemPromptTokens: number;
  config?: ContextConfig; // reuses today's ContextConfig shape (maxTokens, reserves, ratios)
  /** Override point for future provider-specific tokenization (ADR-0008 extensibility). Defaults to the existing 4-char approximation. */
  estimateTokens?: (text: string) => number;
}

export interface ContextPipelineResult {
  managed: ApiMessage[];
  summarized: boolean;
  budget: ContextBudget; // reuses today's ContextBudget shape
}

export interface ContextPipeline {
  prepare(messages: ApiMessage[], opts: ContextPipelineOptions): Promise<ContextPipelineResult>;
}

export function createContextPipeline(deps?: {
  summarize: (payload: string) => Promise<string>;
}): ContextPipeline;
```

`summarize` is DI-injected (the `CostGateDependencies` pattern, §1.4) defaulting to a call against the existing `/api/emma/summarize` route — itself already Brain-Gateway-mediated, so no new provider coupling is introduced.

### 6.3 Stages

1. **Estimate** — per-message token cost via `estimateTokens` (default: today's `estimateMessageTokens`, unchanged 4-char/3.8-divisor approximation).
2. **Budget** — `calculateBudget()` logic (unchanged formula), producing `overBudget`/`needsSummarization`.
3. **Decide** — under budget → pass through unchanged; needs summarization with enough old messages → summarize; needs summarization/over-budget with too few old messages → trim only (today's `trimToFit`, unchanged).
4. **Summarize** — build payload (`buildSummarizationPayload`, unchanged), call the injected `summarize` dependency, prepend `[SUMMARY]` message, final trim pass.
5. **Return** — `{ managed, summarized, budget }`; persistence of the summary (if any) remains the caller's decision, unchanged from today.

### 6.4 Callers

`route.ts`'s server-side `truncateHistory()` (flat 20-cap) is replaced by a call to `contextPipeline.prepare()`. The client `useContextManager` hook becomes a thin wrapper: its `processMessages` calls the same `ContextPipeline.prepare()` (imported from the shared module, safe for client bundles since it has no server-only dependency beyond the injectable `summarize` fetch call it already made). Both callers now query one authority for "what does the model already know" — GAP-09 closed by construction, per ADR-0008.

### 6.5 Extensibility

The `estimateTokens` override is the attachment point ADR-0008 names for "future providers' differing tokenization" — a provider-aware tokenizer can be substituted later (once Routing Layer 2 makes provider selection visible to a caller) without changing `ContextPipeline`'s own contract. No such tokenizer is designed now.

---

## 7. Memory Ranking Technical Design (ADR-0009)

### 7.1 Schema (models the existing `document_chunks` precedent directly, §1.4)

```sql
-- Additive migration
alter table public.memories add column if not exists embedding extensions.vector(1536);
create index if not exists idx_memories_embedding on public.memories
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function match_memories(
  query_embedding extensions.vector(1536),
  match_user_id    uuid,
  match_count      int default 15
)
returns table (
  id text, category text, key text, value text, confidence real,
  source text, last_accessed timestamptz, created_at timestamptz,
  similarity float
)
language sql stable as $$
  select m.id, m.category, m.key, m.value, m.confidence, m.source,
         m.last_accessed, m.created_at,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id and m.status = 'active' and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
```

`1536` matches `EMBEDDING_MODEL = "openai/text-embedding-3-small"` (`providers/openrouter.ts`), the same model `document_chunks.embedding` already assumes — no new embedding model is introduced.

### 7.2 Ranking interface

```ts
// memory-db.ts internals — signature of getRelevantMemoriesForUser() unchanged
export async function getRelevantMemoriesForUser(
  userId: string,
  query: string,
  limit = 15
): Promise<MemoryEntry[]>;
```

Internally: `embedText(query, ...)` (already Brain-Gateway-mediated, `src/lib/embeddings.ts`) → `supabase.rpc('match_memories', { query_embedding, match_user_id: userId, match_count: limit })`, replacing the "fetch all active rows, then score in-process" pattern. The existing `last_accessed` stamping side effect (fire-and-forget, unchanged) still applies to the returned ID set.

### 7.3 Dual-path migration strategy (backfill safety)

Rows with `embedding is null` (pre-migration rows, before backfill completes) are excluded by `match_memories`' `where ... embedding is not null` clause — they would otherwise rank as maximally dissimilar or error the distance operator. `getRelevantMemoriesForUser()` therefore runs a **dual-path** query during the backfill window: the vector RPC for embedded rows, plus the existing in-process keyword-overlap pass for `embedding is null` rows, merging and re-sorting the two result sets by score before applying `limit`. Once backfill is confirmed complete (a Phase 5/Implementation-Planning sizing question, per ADR-0009's own deferral), the keyword-overlap path is deleted and the function becomes vector-only. This dual-path is the "zero-downtime, no forced big-bang migration" mechanism the roadmap's Objective requires.

### 7.4 Extensibility / dependency implications

The embedding-generation step is Brain-Gateway-mediated (`embedText`), so no new provider coupling is introduced — consistent with ADR-0003's embedding-abstraction principle and ADR-0009's own Architectural Impact statement.

---

## 8. Prompt Composition Technical Design (ADR-0010)

### 8.1 Fragment model

```ts
export type PromptFragment = (ctx: PromptContext) => string | null;

export function composePrompt(fragments: PromptFragment[], ctx: PromptContext): SystemBlock[];
```

A fragment returns `null` when not applicable to the current context (e.g., no vision context this turn) — `composePrompt` filters nulls and groups outputs into the same stable/dynamic two-block split `buildSystemPromptBlocks()` already returns, preserving the existing `SystemBlock[]` contract every caller of `buildSystemPrompt()`/`buildSystemPromptBlocks()` already consumes.

### 8.2 Phase 1 — internal `personas.ts` restructuring (resolves the "internal persona/protocol separation" migration step)

`personas.ts`'s existing monolithic `stable` string (persona base + `RESPONSE_LENGTH_PROMPT` + `ROUTINE_PROMPT` + `AVATAR_PROMPT` + routine list + memories + active user + custom persona) is decomposed into named fragment functions: `personaBaseFragment`, `protocolTagsFragment` (the three prompt-convention constants, today interleaved as string literals), `routineListFragment`, `memoriesFragment`, `activeUserFragment`, `customPersonaFragment`. `buildSystemPromptBlocks()` becomes `composePrompt(CHAT_STABLE_FRAGMENTS, ctx)` for its stable block and `composePrompt(CHAT_DYNAMIC_FRAGMENTS, ctx)` for its dynamic block (`timeContextFragment`, `documentContextFragment`, `visionContextFragment`, `emotionStateFragment`, `behaviorDirectivesFragment` — each a direct extraction of today's corresponding `if (ctx.X)` block). **Output must be byte-identical to today's function for identical input** — this phase is a pure internal refactor with no behavior change, verified by a snapshot-equality test (§19.1) before any external call site is touched, exactly as ADR-0010 specifies ("without touching the other five owners").

### 8.3 Phase 2 — channel adapters (resolves fragment boundary / channel-adapter interfaces)

```ts
export interface ChannelAdapter {
  channel: "chat" | "vision" | "summarize" | "whatsapp" | "history";
  compose(ctx: PromptContext): SystemBlock[];
}
```

Each of the five external owners (`vision/route.ts`, `summarize/route.ts`, `ingest/whatsapp/route.ts`, `history/route.ts`'s two independent owners) is migrated **one at a time**, in this order — least-coupled first: `summarize/route.ts` (single-purpose, no persona voice needed) → `ingest/whatsapp/route.ts` → `history/route.ts` (both owners) → `vision/route.ts` (most fragment-dependent, migrated last). Each adapter selects the subset of Phase-1 fragments its channel needs (e.g., WhatsApp omits `avatarFragment`) but **must** reuse the shared `[EXTERNAL DATA]` injection-guard fragment verbatim rather than reimplementing it — this is the specific reuse ADR-0010 targets (today implemented three separate times).

### 8.4 Deferred

The exact base/adapter boundary for any _future_ sixth channel is not pre-specified beyond the pattern above — new channels compose from the same fragment library, per Governance's Extension Model artifact (§12).

---

## 9. Operational Instrumentation Design (ADR-0011)

### 9.1 Correlation ID mechanism (resolves Freeze §7 clarification 3)

**Decision: an explicit optional string parameter, not `AsyncLocalStorage`/ambient context.** Rationale: no `AsyncLocalStorage` usage exists anywhere in the repository today; the codebase's one existing DI/cross-cutting-identifier precedent (`DeletionWorkflowResult.requestId`, `src/core/account-deletion/workflow-types.ts`) is an explicit field, not ambient context. An explicit parameter is consistent with Repository Consistency and requires no new Node.js API surface.

```ts
// types.ts additions
export interface BrainChatRequest {
  // ...existing fields
  /** Generated by the caller (crypto.randomUUID()); the Gateway synthesizes one if omitted, for its own span only. */
  correlationId?: string;
}
// BrainEmbedRequest gains the same optional field.
```

Callers that have not yet been touched (during the migration window) simply omit it — the Gateway synthesizes a fallback ID for its own span tagging, so instrumentation coverage grows incrementally without ever being blocked on migrating all 15 call sites at once (mirroring ADR-0003's own "pure addition" migration precedent).

### 9.2 Tracing / structured logging

```ts
// gateway.ts, wrapping each of the three exported functions
function withInstrumentation<T>(
  task: BrainTask,
  correlationId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const id = correlationId ?? crypto.randomUUID();
  return Sentry.startSpan(
    { name: `brain.${task}`, attributes: { correlationId: id } },
    async (span) => {
      const start = Date.now();
      try {
        const result = await fn();
        logBrainRequest({ correlationId: id, task, durationMs: Date.now() - start, ok: true });
        return result;
      } catch (err) {
        logBrainRequest({ correlationId: id, task, durationMs: Date.now() - start, ok: false });
        throw err;
      }
    }
  );
}
```

Uses `@sentry/nextjs`'s existing `startSpan` API — already a dependency (`package.json`), zero new packages, per ADR-0011's platform decision. `logBrainRequest` is a `console.warn`-based structured log on failure only (matching `errors.ts`'s existing `console.warn` precedent, §1.1) — not a new logging library.

### 9.3 Metrics

Request latency is captured via span duration (Sentry's native mechanism); no separate counter/gauge/histogram library is introduced. Sentry's gap for gauge-style metrics (named in ADR-0011's own Alternatives Considered) is accepted, not solved, in this phase — reconsideration is explicitly deferred to a future OpenTelemetry evaluation if Technical Design (this phase) or later experience finds it necessary. It is not found necessary here.

### 9.4 Observability boundary

The Gateway logs `correlationId`, `task`, `provider.name`, `durationMs`, `ok` — nothing about persona, behavior flags, memory content, or why the request was made. This is the exact boundary ADR-0011 and ADR-0003 Principle 3 require.

---

## 10. Configuration System Design (ADR-0012)

### 10.1 Concrete boot-validation logic (resolves the deferred item)

```ts
// env-validation.ts additions
export type EnvironmentIssueReason =
  | "missing"
  | "placeholder"
  | "invalid_url"
  | "invalid_format"
  | "no_provider_configured"; // new

function hasConfiguredProvider(env: EnvironmentSource): boolean {
  // OR-chain: grows by one clause per provider added to the Registry.
  return Boolean(env.OPENROUTER_API_KEY?.trim());
}
```

`OPENROUTER_API_KEY` is removed from the flat `PRODUCTION_REQUIRED_ENV` array. `validateProductionEnvironment()` gains one additional check after the existing loop: if `!hasConfiguredProvider(env)`, push `{ variable: "OPENROUTER_API_KEY", reason: "no_provider_configured" }` (kept as a single synthetic issue naming the checked variable, not a new free-form message, so existing consumers of `EnvironmentValidationIssue` need no shape change). Production boot now fails only when **no** configured provider's credentials are present, exactly as ADR-0012 specifies.

### 10.2 Ordering constraint (explicit, to prevent a future circular-import mistake)

`env-validation.ts` does **not** import `registry.ts` or `gateway.ts`. `hasConfiguredProvider()` re-derives "which env var(s) would configure a provider" from its own small, explicit list, evaluated before the Registry object exists at module load. Keeping this list in sync with the Registry's actual provider list is a Governance responsibility (§12), not a shared runtime import — importing the Gateway from `env-validation.ts` (which the Gateway or its providers could transitively import in turn) risks a boot-order/circular-import class of bug this design avoids structurally.

### 10.3 Deferred configuration interfaces

Runtime Configuration Store and Feature-Flag Layer: **no interface is specified**. Per ADR-0012 (and Freeze Finding Ed-2), these activate only once Routing Layer 2/3 need a runtime home or a second provider needs staged rollout — neither condition holds yet. Designing their interfaces now would be speculative architecture Phase 4's own Explicit Non-Goals forbid.

---

## 11. Extension Model Technical Design (ADR-0013)

### 11.1 Concrete lint rule set (resolves the deferred item)

**Decision: ESLint's built-in `no-restricted-imports`, not a new plugin.** Rationale: `eslint-config-next/core-web-vitals` is the only ESLint plugin surface today (§1.6); `no-restricted-imports` is a core rule requiring zero new dependencies, satisfying Repository Consistency over installing `eslint-plugin-boundaries`.

**Boundary enforcement (§11.1 selection — static, CI-time):**

```js
// eslint.config.mjs — new block
{
  files: ["src/**/*.ts", "src/**/*.tsx"],
  ignores: ["src/core/brain/**"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["@/core/brain/providers/*"],
        message: "Provider implementations are internal to the Brain Gateway (ADR-0003 Principle 1, ADR-0013). Import from @/core/brain/gateway instead.",
      }],
    }],
  },
},
```

**Dependency-inversion enforcement (§11.2 selection — same mechanism, same philosophy):** the identical `no-restricted-imports`-`patterns` shape is the template for every future DI-shaped boundary; a concrete `patterns` entry is added when each new substitutable component (Context Pipeline, Prompt Pipeline) actually ships in Phase 6 — not retroactively invented now for modules that do not exist yet, per ADR-0013's own accepted "coverage only as complete as the rules authored" limitation. This is a rule _template_, applied first to the one boundary (Provider) that exists today.

### 11.2 Workflow concept

No new interface. Multi-step orchestration continues to compose `agent-loop.ts` invocations, per ADR-0013's decision — nothing to specify beyond confirming no design work is needed here.

### 11.3 Deferred

`§11.1C` runtime-assertion defense-in-depth: not designed (optional, per ADR-0013).

---

## 12. Governance Technical Design (ADR-0014)

### 12.1 Artifact location and format (resolves the deferred item)

**Location:** `docs/brain-gateway-extension-model.md`. **Format:** plain markdown, matching the existing `docs/explanation-*.md` convention (prose + code snippets), not a template/scaffolding system (ADR-0014 rejected that alternative). **Required sections:** (1) How to add a provider — implement `BrainProvider`, author a `CapabilitiesDescriptor`, register both via `registry.register()` in `gateway.ts`, add Adapter Layer error-normalization for the new wire format; (2) How to add a capability — extend `CapabilitiesDescriptor` additively, default `false` for existing providers, no version bump; (3) How to add a Gateway-adjacent boundary — author the corresponding `no-restricted-imports` entry (§11.1), cross-referencing ADR-0013.

### 12.2 Authoring timing

This artifact's **content** is authored in Phase 6 (Incremental Implementation), alongside the Provider Registry work it documents — writing it now, before the Registry exists, would describe a mechanism from prose alone rather than from the lived experience ADR-0014 itself values (the same "avoid describing what isn't built yet" discipline this initiative has now applied consistently). Phase 4's deliverable is the location/format/required-sections decision above, which is what ADR-0014 explicitly assigned to Technical Design.

### 12.3 Forcing function

The `no-restricted-imports` DI rule (§11.1) is this artifact's forcing function, exactly as ADR-0014 pairs them: where the artifact states a DI/boundary expectation, the lint rule makes it checkable.

---

## 13. Public Interface Specification

Consolidated list of every new/changed public contract introduced by this design (types only — no implementation):

| Interface                                                                                     | Location              | New/Changed                            | Domain        |
| --------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------- | ------------- |
| `CapabilitiesDescriptor`                                                                      | `brain/types.ts`      | New                                    | Provider      |
| `BrainChatRequest.correlationId?`                                                             | `brain/types.ts`      | Changed (additive)                     | Operational   |
| `BrainEmbedRequest.correlationId?`                                                            | `brain/types.ts`      | Changed (additive)                     | Operational   |
| `BrainRequestError.code` gains `"PROVIDER_UNAVAILABLE"`                                       | `brain/types.ts`      | Changed (additive union member)        | Routing       |
| `ProviderRegistry`, `RegisteredProvider`, `createProviderRegistry`                            | `brain/registry.ts`   | New                                    | Provider      |
| `RoutingRequest`, `RoutingResult`, `routeRequest`                                             | `brain/routing.ts`    | New                                    | Routing       |
| `ContextPipeline`, `ContextPipelineOptions`, `ContextPipelineResult`, `createContextPipeline` | `context-pipeline.ts` | New                                    | Context       |
| `getRelevantMemoriesForUser()`                                                                | `memory-db.ts`        | Unchanged signature, changed internals | Memory        |
| `PromptFragment`, `composePrompt`, `ChannelAdapter`                                           | `personas.ts`         | New                                    | Prompt        |
| `buildSystemPrompt()`, `buildSystemPromptBlocks()`                                            | `personas.ts`         | Unchanged signature and output         | Prompt        |
| `EnvironmentIssueReason` gains `"no_provider_configured"`                                     | `env-validation.ts`   | Changed (additive union member)        | Configuration |
| `no-restricted-imports` rule block                                                            | `eslint.config.mjs`   | New                                    | Extension     |

Every "Changed" row is additive (new optional field or new union member) — no existing field is removed, retyped, or made required. This is a structural guarantee, not an incidental one: it is what makes every migration phase in §18 independently revertible.

---

## 14. Internal Component Design

### 14.1 Module boundaries and visibility

```
src/core/brain/
  types.ts       — exported types only, zero runtime logic, importable from anywhere
  registry.ts    — exports ProviderRegistry/createProviderRegistry; imported only by gateway.ts
  routing.ts     — exports routeRequest; imported only by gateway.ts
  gateway.ts     — the ONLY module application code may import from this directory
  providers/     — NEVER imported outside src/core/brain/ (enforced, §11.1)

src/core/context-pipeline.ts   — imported by route.ts (server) and the useContextManager hook (client)
src/core/personas.ts           — imported by route.ts and, after Phase 6.8, the 5 other prompt call sites
src/core/memory-db.ts          — signature-stable; no new external imports
src/core/env-validation.ts     — imported by route.ts's boot check; imports nothing from brain/
```

### 14.2 Dependency direction

Unchanged: Application → Gateway → Provider, strictly downward (ADR-0003). The Context Pipeline and Prompt Pipeline remain Application-Layer peers of `route.ts`, not new layers between Application and Gateway — they call the Gateway (for summarization/embedding) exactly as `route.ts` itself does, they do not intermediate the Gateway boundary.

### 14.3 Ownership

Per §2.3's table. No component has two owners after this design — the explicit goal of ADR-0008/0010's ownership-fragmentation closure.

---

## 15. Sequence Diagram Package

### 15.1 Request lifecycle (chat, streaming) — after this design ships

```
Client          route.ts                 ContextPipeline    Registry/Routing   Gateway            Provider(OpenRouter)
  │  POST /api/emma │                          │                  │               │                    │
  │────────────────►│ auth, waitlist, rate-limit, sanitise, cost-gate            │                    │
  │                 │──prepare(messages)──────►│                  │               │                    │
  │                 │◄─managed, budget──────────│                  │               │                    │
  │                 │ composePrompt(stable+dynamic fragments) → SystemBlock[]     │                    │
  │                 │──brainChatStream(req+correlationId)─────────────────────────►│                    │
  │                 │                                             │──route(task)─►│                    │
  │                 │                                             │◄─Provider─────│                    │
  │                 │                                             │  Sentry.startSpan wraps call       │
  │                 │                                             │───────────────►provider.chatStream()
  │                 │                                             │                │──POST /chat/completions (SSE)─►
  │◄──SSE deltas────│◄────────────────────────────────────────────────────────────│◄──SSE chunks───────│
  │                 │ parseEmmaResponse → response-validator (log-only)           │                    │
  │◄──done event────│                                             │               │                    │
```

### 15.2 Routing (Layer 1 today; Layer 2 once n≥2)

```
gateway.ts ──► routeRequest(registry, {task, requiredCapabilities?})
                 │
                 ├─ requiredCapabilities empty ──► Layer 1: getConfigured()[0] ──► {resolvedBy:"task"}
                 │
                 └─ requiredCapabilities present ─► Layer 2: findByCapability(...)
                                                       ├─ match found ──► {resolvedBy:"capability"}
                                                       └─ no match ─────► null ──► caller returns
                                                                                    BrainRequestError
                                                                                    {code:"PROVIDER_UNAVAILABLE"}
```

### 15.3 Provider selection (Registry)

```
gateway.ts (module load) ──register(openrouter, capabilities)──► ProviderRegistry
gateway.ts (per request) ──getConfigured()/findByCapability()──► ProviderRegistry ──► RegisteredProvider[]
```

### 15.4 Context assembly

```
route.ts ──messages──► ContextPipeline.prepare()
                          │
                          ├─ under budget ─────────────────────────► managed = messages (unchanged)
                          ├─ needs summarization, enough old msgs ──► summarize() [Gateway-mediated] ──► [SUMMARY]+recent
                          └─ needs summarization, too few old msgs ► trimToFit() (unchanged)
```

### 15.5 Prompt composition

```
route.ts ──ctx──► composePrompt(CHAT_STABLE_FRAGMENTS, ctx) ──► stable SystemBlock
         ──ctx──► composePrompt(CHAT_DYNAMIC_FRAGMENTS, ctx) ──► dynamic SystemBlock (or omitted if empty)
```

### 15.6 Response pipeline

```
brainChatStream result ──► SSE deltas to client (unchanged)
                       ──► full text accumulated ──► parseEmmaResponse() ──► {text, emotion, routineId}
                                                  ──► validateResponseBehavior() [log-only, unchanged]
                                                  ──► done event to client (unchanged)
```

---

## 16. State Transition Design

| Component                   | States                                                                                                                                              | Transitions                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Provider Registry           | `Uninitialized → Populated (Ready)`                                                                                                                 | One-way at module load; no runtime transitions after boot (immutable by design, §3.2) |
| `BrainStream`               | `Open → Streaming → Done` \| `Open → Streaming → Cancelled` \| `Open → Streaming → Errored`                                                         | Unchanged from today's `OpenRouterStream` implementation                              |
| Routing layer activation    | `Layer1-only → Layer1+Layer2-present-but-inert (today, n=1) → Layer1+Layer2-exercised (n≥2, future)`                                                | Layer 3 has no state — not modeled (§5.4)                                             |
| Context Pipeline (per call) | `UnderBudget → (no transition)` \| `NeedsSummarization → Summarizing → Summarized` \| `NeedsSummarization → TrimmedFallback` (on summarize failure) | Stateless across calls — no persisted state machine, matching today's hook behavior   |
| Boot validation             | `Booting → EnvChecked → Ready` \| `Booting → EnvChecked → BootFailed(no_provider_configured \| ...)`                                                | Fails closed in production, unchanged posture                                         |

---

## 17. Error Handling Specification

### 17.1 Error hierarchy (additive only)

`BrainRequestError.code` gains one member: `"PROVIDER_UNAVAILABLE"` — raised by Gateway functions when `routeRequest()` returns `null` for a non-empty `requiredCapabilities`. `retryable: false` (retrying an unsatisfiable capability requirement against the same registry cannot succeed). All five existing codes (`BAD_REQUEST`, `AUTH_ERROR`, `RATE_LIMIT`, `OVERLOADED`, `TIMEOUT`, `UPSTREAM_ERROR`) are unchanged, still owned by each provider's Adapter Layer.

### 17.2 Propagation

Upstream HTTP errors: unchanged, `{ok:false, error}` value return (never thrown). Transport failures: unchanged, throw (`EmmaError`/`AbortError`→`TIMEOUT`). Routing "no match": a **value** return (`null` internally, translated to `{ok:false, error:{code:"PROVIDER_UNAVAILABLE"}}` by the Gateway function) — not a throw, because "no configured provider satisfies this requirement" is an expected, foreseeable outcome once `n≥2`, exactly like every other upstream-error case in this contract.

### 17.3 Retry

Unchanged mechanism (`fetchWithRetry`, caller-supplied `maxRetries`). The provider-specific `529` status stays inside `openrouter.ts`'s own `normalizeHttpError`/`retryable` logic (already true today — confirmed by direct reading of `providers/openrouter.ts:107-129`); `errors.ts`'s shared `DEFAULT_RETRY.retryOn` list (`[429, 500, 502, 503, 529]`) is the one piece of provider-specific vocabulary (`529`) still living in nominally-shared code (GAP-07's remaining instance) — **Technical Design records this as the concrete Phase 6 fix**: `529` is removed from `errors.ts`'s shared default and instead passed as a provider-supplied `retryOn` override from `openrouter.ts` when it calls `fetchWithRetry`, so the shared retry helper's default list contains only genuinely cross-provider statuses (`429, 500, 502, 503`).

### 17.4 Recovery

Existing fallback patterns unchanged: Context Pipeline falls back to `trimToFit` on summarize failure (§6.3); Memory Ranking falls back to keyword-overlap scoring for un-embedded rows during backfill (§7.3, dual-path, not a failure fallback but a migration-window fallback).

### 17.5 Observability

Every `BrainRequestError` (including the new `PROVIDER_UNAVAILABLE`) is captured by `logBrainRequest` (§9.2) with its `correlationId`, satisfying ADR-0011's requirement that Gateway-boundary failures are traceable to their Application-Layer cause.

---

## 18. Migration Strategy

Every phase below is additive-first and independently revertible (§13's guarantee: no existing signature is narrowed or removed until its last caller is migrated, and even then the old shape is deleted, not replaced with an incompatible one). Sequenced from lowest-risk/lowest-infrastructure-cost to highest, consistent with each ADR's own accepted-trade-off framing:

| Step | Content                                                                                                | Risk                                                                 | Rollback                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 6.1  | Provider Registry + Capabilities Descriptor (wraps the existing single provider; zero behavior change) | Low                                                                  | Revert PR — no data touched                                                  |
| 6.2  | Adapter Layer refinement (`529` relocation, §17.3)                                                     | Low                                                                  | Revert PR                                                                    |
| 6.3  | Operational Instrumentation (Sentry spans + `correlationId`, purely additive)                          | Low                                                                  | Revert PR; Sentry dependency already present                                 |
| 6.4  | Configuration conditional boot validation                                                              | Low                                                                  | Revert PR                                                                    |
| 6.5  | Extension lint rules (CI-time only, no runtime effect)                                                 | Low                                                                  | Revert PR                                                                    |
| 6.6  | Context Pipeline (supersedes `context-manager.ts` internals + `route.ts`'s cap)                        | Medium — both call sites change together                             | Revert PR; no schema change                                                  |
| 6.7  | Prompt Pipeline Phase 1 (internal `personas.ts` split, byte-identical output, snapshot-verified)       | Low                                                                  | Revert PR                                                                    |
| 6.8  | Prompt Pipeline Phase 2 (5 channel adapters, migrated one at a time per §8.3's order)                  | Medium, per-adapter                                                  | Revert one adapter's PR independently of the others                          |
| 6.9  | Memory Ranking Infrastructure (schema migration + dual-path + backfill)                                | High — new infra dependency, sized/sequenced by Phase 5 per ADR-0009 | Additive column stays unused if reverted; RPC drop is safe (no other reader) |
| 6.10 | Governance artifact authored (`docs/brain-gateway-extension-model.md`)                                 | None (docs only)                                                     | N/A                                                                          |

Routing Layer 2 activation has no dedicated step — it activates whenever a second provider is registered (§5.3), which may land in the same PR as that provider's Adapter Layer or later; it is not itself a migration risk because it is inert until then.

### 18.1 Compatibility

Zero breaking changes to any existing external consumer: `getRelevantMemoriesForUser()`'s signature is preserved (ADR-0009); `buildSystemPrompt()`/`buildSystemPromptBlocks()`'s signatures and output are preserved through Phase 1 (§8.2) and unaffected in shape through Phase 2; `BrainChatRequest`/`BrainEmbedRequest` gain only optional fields.

---

## 19. Testing Architecture / Strategy

### 19.1 Unit testing

- `registry.test.ts` (new): register/get/getConfigured/duplicate-name-rejection/descriptor-validation.
- `routing.test.ts` (new): Layer 1 passthrough (`resolvedBy: "task"`, identical to today's single-provider selection), Layer 2 no-match returns `null`, Layer 2 match with two fake registered providers.
- `context-pipeline.test.ts` (new, largely ported from `context-manager.test.ts`'s existing budget/trim/summarize cases): asserts `route.ts`'s server path and the client hook produce identical `managed` output for the same input, closing GAP-09's "two owners could disagree" risk with an actual regression test.
- Prompt fragment composition: a snapshot-equality test asserting `composePrompt(CHAT_STABLE_FRAGMENTS ∪ CHAT_DYNAMIC_FRAGMENTS, ctx)` output equals today's `buildSystemPromptBlocks(ctx)` output for a fixed set of representative contexts, run **before** Phase 1 (§8.2) is considered complete.
- Memory ranking: mock the Supabase RPC call; assert dual-path merge-and-sort behavior for a mixed embedded/un-embedded row set.
- Boot validation: extend `env-validation.test.ts`'s existing matrix with the new `no_provider_configured` case (present, absent, placeholder).
- Correlation-ID threading: assert a caller-supplied `correlationId` reaches the Sentry span attributes; assert a fallback UUID is synthesized when omitted.

### 19.2 Integration testing

`route.ts`'s full streaming path re-run end-to-end after the Registry wrap (6.1) and after the Context Pipeline swap (6.6) — using the existing `tests/unit/brain-gateway.test.ts` and `openrouter.test.ts` harness pattern (mocked `fetch`), extended, not replaced.

### 19.3 Contract / provider-conformance testing

**New:** `runProviderConformanceSuite(provider: BrainProvider, capabilities: CapabilitiesDescriptor)` — a shared test factory any `BrainProvider` implementation must pass (chat/chatStream/embed/isConfigured against a mocked transport, exercising every `BrainChatResult`/`BrainStreamResult`/`BrainEmbedResult` shape). This is the mechanism that finally lets ADR-0006's "n=1, proven only by inspection" risk be closed **by construction** rather than left permanently accepted: a fake second provider (used only in tests, never shipped) can be written purely to exercise this suite and Routing Layer 2, without needing a real second backend to exist. `openrouter.ts`'s existing behavior is re-verified by running it through this same suite.

### 19.4 Regression testing

Every existing test in `tests/unit/` (63 files, §1.6) must remain green through every migration step in §18 — this is the explicit regression gate. `context-manager.test.ts`, `memory-relevance.test.ts`, `personas-custom-routines.test.ts`, `brain-gateway.test.ts`, `openrouter.test.ts`, and `env-validation.test.ts` are the specific files most load-bearing against this design and are called out for extra scrutiny at each relevant migration step.

---

## 20. Technical Traceability Matrix

Gap → Freeze → ADR → Technical Design section → Future Implementation (Phase 6 step).

| Gap              | ADR                               | Technical Design                              | Phase 6 step                                |
| ---------------- | --------------------------------- | --------------------------------------------- | ------------------------------------------- |
| GAP-01           | ADR-0006                          | §3 Provider Registry, §19.3 Conformance suite | 6.1                                         |
| GAP-02           | ADR-0007                          | §5 Routing Engine                             | 6.1 (Layer 1 present); Layer 2 whenever n≥2 |
| GAP-03           | ADR-0012                          | §10 Configuration                             | 6.4                                         |
| GAP-04           | ADR-0011                          | §9 Operational Instrumentation                | 6.3                                         |
| GAP-05 (Context) | ADR-0008                          | §6 Context Pipeline                           | 6.6                                         |
| GAP-05 (Prompt)  | ADR-0010                          | §8 Prompt Composition                         | 6.7, 6.8                                    |
| GAP-06           | ADR-0006                          | §3–4 Provider Registry/Descriptor             | 6.1                                         |
| GAP-07           | ADR-0006, ADR-0007                | §17.3 Error Handling (529 relocation)         | 6.2                                         |
| GAP-08           | ADR-0009                          | §7 Memory Ranking                             | 6.9                                         |
| GAP-09           | ADR-0008                          | §6 Context Pipeline                           | 6.6                                         |
| GAP-10           | ADR-0013                          | §11.1 Boundary enforcement                    | 6.5                                         |
| GAP-11           | ADR-0013, ADR-0014                | §11.1–11.2 DI enforcement, §12 Governance     | 6.5, 6.10                                   |
| GAP-12           | ADR-0014                          | §12 Governance artifact                       | 6.10                                        |
| GAP-13           | ADR-0012                          | §10.3 Deferred configuration                  | Not scheduled — activation-contingent       |
| GAP-14           | (governance, closed in Phase 3.2) | N/A                                           | Already executed                            |
| GAP-15           | ADR-0013                          | §11.2 Workflow concept (no new design)        | N/A — no new component                      |

**Coverage verdict:** every one of the nine ADRs has at least one Technical Design section; every section traces to at least one ADR and, through it, to at least one Phase 2 gap; no Technical Design section introduces a mechanism without a governing ADR (§21 confirms this explicitly per section).

---

## 21. Technical Design Consistency Review

- **No architecture changes:** every decision above resolves a question an ADR _explicitly_ named as deferred to Technical Design (verified against each ADR's own "Deferred considerations" subsection while writing §3–§12); no ADR's Decision, Alternatives Considered, or Consequences text is contradicted or narrowed.
- **No conflicting interfaces:** `BrainChatRequest`/`BrainEmbedRequest` gain the same additive shape (`correlationId?`) rather than two different mechanisms for the same concern; `no-restricted-imports` is used once, as a template, for both Extension's boundary and DI selections (§11), rather than two different tools for the same enforcement philosophy — directly satisfying ADR-0013's own "should not enforce boundaries with tooling while enforcing DI with a document alone" consistency requirement.
- **No duplicated responsibility:** Context Pipeline and Prompt Pipeline each have exactly one owner module (§14.3); the Provider Registry is the only provider-selection mechanism (Routing queries it, nothing bypasses it).
- **No undocumented dependency:** every cross-domain dependency named in the ADRs is preserved and made concrete here — Routing Layer 2 depends on the Registry (§5.3 explicitly built on §3); Configuration's boot check depends on "which provider(s) are configured" being derivable, satisfied by §10.2's explicit (non-circular) re-derivation rather than a hidden import of the Registry.

**No architectural drift was introduced.**

---

## 22. Technical Design Readiness Report

**Recommendation: Ready for Implementation Planning (Phase 5).**

Every one of the nine ADRs has a corresponding Technical Design specification (§3–§12); every specification traces to its governing ADR(s) and, transitively, to a Phase 2 gap (§20); interfaces are fully specified for every new/changed contract (§13); a migration strategy exists with per-step risk and rollback (§18); a testing strategy exists covering unit, integration, contract/conformance, and regression testing (§19); implementation (Phase 6) can begin without further architectural decisions — the three questions the Freeze itself deferred to this phase (Capabilities Descriptor schema, Context Pipeline reconciliation semantics, correlation-ID propagation contract) are each resolved concretely in §4.1, §6.1, and §9.1 respectively, and every ADR's own "Deferred considerations" item is likewise resolved in its corresponding section above.

No open technical question blocks Phase 6. The two items intentionally left unresolved (Routing Layer 3's design; Configuration's Runtime Store/Feature-Flag interfaces) are correctly unresolved — both are activation-contingent per their governing ADRs, not omissions of this phase.

---

## 23. Explicit Non-Goals Confirmation

Per the Phase 4 spec, this document does not modify any ADR, does not modify the Phase 3.1 Architecture Freeze, does not introduce new architecture, does not create new ADRs, does not write production code, does not refactor production code, does not modify runtime behavior, and does not estimate implementation effort or select a different architectural pattern than what was frozen. Every interface signature, schema fragment, and rule snippet in this document is illustrative specification prose — none of it has been written to any file under `src/`, `supabase/`, or `eslint.config.mjs`; those files are unmodified by this phase (confirmed: only `docs/phase4-brain-gateway-technical-design.md` is added by this branch). Where this document makes a concrete choice among options an ADR left open (e.g., `no-restricted-imports` over a new plugin; explicit parameter over `AsyncLocalStorage`; boolean-per-capability over a negotiation protocol), each choice is justified by evidence already in the repository (§1) or by the specific deferred question the governing ADR named — no choice introduces a capability, component, or boundary the ADRs did not already authorize.

## 24. Success Criteria Checklist

- [x] Every ADR has a corresponding technical specification (§3–§12)
- [x] Every technical specification traces back to at least one ADR (§20)
- [x] No architectural drift exists (§21)
- [x] Interfaces are fully specified (§13)
- [x] Migration strategy is complete (§18)
- [x] Testing strategy is complete (§19)
- [x] Implementation can begin without additional architectural decisions (§22)
