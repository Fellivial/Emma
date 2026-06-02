# Memory Extraction & Quality Research

**Date:** 2026-05-31  
**Scope:** How to reliably extract structured memories from conversations, deduplicate them, handle contradictions, and decide when to retrieve vs. inject the full set.  
**Status:** Research only — no implementation changes.

---

## Context: Emma's Current Implementation

Emma's current extraction pipeline (`src/app/api/emma/memory/route.ts` + `src/core/memory-shared.ts`):

- Calls OpenRouter with `MEMORY_EXTRACTION_PROMPT` after each brain response
- Uses JSON schema structured output to get `{category, key, value, confidence}`
- Filters out entries with `confidence < 0.5` before storing
- Upserts on `(user_id, category, key)` — exact-match dedup only
- Categories currently: `preference | routine | personal | episodic | environment`
- No contradiction detection, no staleness pruning, no semantic dedup

The gaps: prompt quality for reliable structured output, semantic deduplication, contradiction/temporal override, and retrieval strategy as memory count grows.

---

## 1. Memory Extraction Prompt Design

### 1.1 What the Field Does

**Mem0 (production reference)** uses three prompts in its v3 pipeline:

1. `USER_MEMORY_EXTRACTION_PROMPT` — extracts facts from user messages only. Produces a flat list of atomic facts. Emphasis: "generate facts solely based on the user's messages, do not include information from assistant or system messages."
2. `UPDATE_MEMORY_PROMPT` — receives the new candidate facts alongside the top-10 semantically similar existing memories and decides ADD / UPDATE / DELETE / NONE.
3. `MEMORY_DEDUCTION_PROMPT` (v1 legacy, simpler) — "Deduce the facts, preferences, and memories from the provided text. Just return the facts in bullet points." Key stylistic constraint: avoid subject-focused phrasing — "Likes pizza" not "The person likes pizza."

The v3 single-pass ADD-only model (April 2026) drops the update-decision call entirely at write time, deferring contradiction resolution to retrieval. This cuts write-time LLM calls by 60–70% without meaningfully degrading memory quality. The tradeoff: occasional redundant entries in the store until the next retrieval pass merges them.

**MemMachine (2026, arxiv:2604.04853)** emphasizes ground-truth preservation — anchoring extracted memories to verifiable source text from the conversation rather than inferring or paraphrasing. This reduces hallucinated memories.

**Memori (2026, arxiv:2603.19935)** uses semantic triples (`subject–predicate–object`) as the memory atom rather than key/value pairs. Triples are linked to conversation summaries for provenance. The subject-predicate-object structure makes deduplication and contradiction detection more tractable because the predicate encodes the relationship explicitly.

### 1.2 Recommended Prompt Structure for Emma

The current `MEMORY_EXTRACTION_PROMPT` is functional but lacks few-shot examples and clear skip rules. Based on research, an improved prompt should:

1. **State the role explicitly**: "Personal Information Organizer. Extract persistent facts about the user."
2. **Define skip rules explicitly**: do not extract transient states ("I'm hungry," "I'll be right back"), questions the user asks, filler affirmations ("ok," "sure," "thanks"), assistant statements, or one-time context ("I'm in a meeting right now").
3. **Anchor confidence to explicitness**: direct statement = 0.85–1.0; clearly implied = 0.65–0.75; reasonable inference = 0.45–0.6; weak/speculative = 0.2–0.4.
4. **Normalize keys at prompt level**: instruct the model to produce snake_case keys without articles or stop words ("favorite_color" not "the_users_favorite_color").
5. **Include 3–4 few-shot examples** showing what to extract and what to skip.

**Sample prompt with few-shot examples:**

```
You are a Personal Information Organizer for a companion AI. Your job is to
extract persistent facts worth remembering about the user from the conversation
turn provided.

Return a JSON array of memory objects with fields:
  category: one of preference | habit | personal | goal | relationship | context | constraint
  key:       snake_case identifier, <=5 words, no articles (e.g. favorite_music_genre)
  value:     the fact as a concise statement
  confidence: 0.0–1.0 per the scale below

Confidence scale:
  0.85–1.0  Direct, explicit statement ("I love jazz")
  0.65–0.75 Clearly implied but not stated outright
  0.45–0.60 Reasonable inference from context
  0.20–0.40 Weak inference or speculation
  < 0.40    Do not extract

Do NOT extract:
  - Transient states: "I'm tired," "I'm hungry right now," "I'm in a rush"
  - Questions the user asks Emma
  - Filler: "ok," "cool," "thanks," "sure," "yes"
  - One-time event context: "I have a call in 5 minutes"
  - Statements Emma made (assistant messages)
  - Anything the user said about Emma herself

<examples>
User: "I usually wake up at 6am and hit the gym before work."
Extract:
  { category: "habit", key: "wake_up_time", value: "6am", confidence: 0.9 }
  { category: "habit", key: "morning_routine", value: "gym before work", confidence: 0.85 }

User: "Do you know any good Italian restaurants?"
Extract: []   <- question, not a fact about the user

User: "I have a presentation tomorrow, I'm really stressed."
Extract:
  { category: "context", key: "presentation_stress", value: "stressed about upcoming presentation", confidence: 0.5 }
  <- borderline; Emma may skip at threshold 0.55

User: "I'm vegetarian and my partner Alex is vegan."
Extract:
  { category: "constraint", key: "dietary_restriction", value: "vegetarian", confidence: 0.95 }
  { category: "relationship", key: "partner_name", value: "Alex", confidence: 0.95 }
  { category: "relationship", key: "partner_diet", value: "Alex is vegan", confidence: 0.9 }

User: "ok thanks!"
Extract: []   <- filler
</examples>

Now extract from the following conversation turn. Return only the JSON array.
```

### 1.3 Extraction Trigger Strategy

Three options with their tradeoffs:

| Strategy                                             | Cost                              | Latency        | Memory freshness | Recommendation                            |
| ---------------------------------------------------- | --------------------------------- | -------------- | ---------------- | ----------------------------------------- |
| After every brain response                           | ~$0.0004/call (GPT-5-nano equiv.) | +~300ms async  | Immediate        | Default for Emma                          |
| After every N turns (batch)                          | Lower                             | None (batched) | Delayed          | Use for cost optimization if usage climbs |
| Signal-triggered (detect keywords or emotion shifts) | Lowest                            | Negligible     | Inconsistent     | Too complex, skip                         |

**Recommendation:** Run extraction **async after every brain response** (fire-and-forget, does not block SSE stream). This is Emma's current approach and is correct. The write cost at ~$0.0004 per call is negligible compared to the brain call. The research-backed cost model: write phase is a one-time upfront cost; subsequent queries amortize it over all future context injections. At Emma's scale, per-turn async extraction is economically sound until brain call volume exceeds ~500k/month.

For batching as a future optimization: the arxiv:2603.04814 study used `batch_size=10` segments with max 8,000 characters per segment. This is a reasonable batch configuration if Emma moves to async background processing.

### 1.4 False Positive Prevention

The Mem0 `MEMORY_DEDUCTION_PROMPT` includes the constraint: "avoid extracting information that relates to the assistant." The MemX system (arxiv:2603.16171) applies a **low-confidence rejection rule** that suppresses spurious recalls entirely.

Key thresholds from research:

- `< 0.40`: reject at extraction (too speculative)
- `0.40–0.50`: borderline — only store if it's a named entity or explicit behavioral constraint
- `>= 0.50`: store (Emma's current threshold, aligns with research)
- `>= 0.70`: reliable enough to surface in system prompt without caveat

Emma's current `confidence >= 0.5` filter is defensible. Raising it to `0.55` would reduce noise with minimal signal loss. The research does not suggest a universal optimal threshold — it depends on how much noise is tolerable vs. how much signal is lost.

---

## 2. Category Taxonomy

### 2.1 What the Field Uses

**CoALA (Princeton, 2023)** — the field's canonical cognitive-science-based taxonomy:

- Episodic (what happened)
- Semantic (what is known / facts)
- Procedural (how things should be done)
- Working (immediate context, not persisted)

**Mem0 v3 (production)** does not enforce categories; memories are typed at the scope level (user / agent / session). Their `FACT_RETRIEVAL_PROMPT` organizes facts into: personal preferences, important details, plans, health preferences, professional information.

**MemX (arxiv:2603.16171)** taxonomy:

- User Profile (demographics, preferences, behavioral patterns)
- Conversation Context (topic history)
- Relationships (people and entities)
- Tasks & Goals (objectives, ongoing projects)
- Preferences & Rules (explicit guidelines)

**Mem0 state-of-memory 2026 report** uses episodic / semantic / procedural as the high-level split.

### 2.2 Recommended Taxonomy for Emma

Emma's current categories (`preference | routine | personal | episodic | environment`) are reasonable but incomplete. Based on the research, the following 7-category taxonomy better covers the space of a personal companion's memory:

| Category       | What it captures                              | Examples                                                     |
| -------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `preference`   | Likes, dislikes, aesthetic choices            | favorite genre, hated food, preferred communication style    |
| `habit`        | Recurring behaviors and routines              | wake-up time, gym schedule, weekly calls with family         |
| `personal`     | Identity facts: demographics, life context    | name, age, job title, city, relationship status              |
| `goal`         | Things the user is working toward             | wants to learn piano, saving for a trip, career change       |
| `relationship` | Named people and their attributes             | partner name/diet, friend's job, parent's health             |
| `context`      | Situational facts that may be semi-persistent | current project, recent move, ongoing stress source          |
| `constraint`   | Hard rules Emma should always respect         | dietary restrictions, accessibility needs, "never mention X" |

**Dropped categories vs. current:**

- `routine` renamed `habit` (clearer intent)
- `environment` dropped (device graph is deprecated per CLAUDE.md; no physical env control)
- Added: `goal`, `relationship`, `constraint`

The key distinction between `context` (semi-persistent, may expire) and `constraint` (persistent rule) is important: constraints should almost never be pruned, while context entries should age faster.

---

## 3. Deduplication

### 3.1 What the Field Does

**Exact deduplication:** Emma already handles this via the Supabase upsert on `(user_id, category, key)`. For textually identical keys, this is solved.

**Key normalization (pre-insert):** Mem0's BM25 pipeline uses spaCy to lemmatize keywords before indexing. Applied to keys before insert, this catches a large class of near-duplicates at low cost:

- Lowercase
- Strip articles and stop words
- Lemmatize ("prefers" -> "prefer", "drinking" -> "drink")
- Convert to snake_case

Example: "prefers_tea", "preference_for_tea", "likes_tea", "drinks_tea" all normalize toward "tea_preference" or "prefer_tea". This is a purely algorithmic step — no LLM call required.

**Hash-based dedup (Mem0 v3):** After extraction, MD5-hash each `(category, normalized_key, value)` tuple before insert. Reject exact hashes. This is O(1) and catches cases where the same fact was re-extracted from a subsequent conversation.

**Semantic deduplication (embedding-based):** Mem0 v1/v2 retrieved the top-10 similar existing memories before deciding ADD/UPDATE/DELETE. The v3 architecture dropped this from the write path, citing 60–70% cost reduction.

The NVIDIA NeMo SemDeDup framework uses cosine similarity above a threshold (default ~0.9) to identify semantic duplicates. For memory keys (short phrases), a threshold of 0.92 is commonly cited as the boundary between "same concept, different words" and "related but distinct."

**Cost of per-insert semantic dedup at Emma's scale:**

- Embedding one new key: negligible token cost
- Vector search against existing memories: ~1–5ms per query with pgvector
- At 100 memories/user average: trivial

The cost concern only matters if running semantic dedup against thousands of users simultaneously at high frequency. For Emma's current user base, per-insert semantic dedup is affordable.

### 3.2 Practical Recommendation

A three-layer deduplication strategy in order of increasing cost:

1. **Key normalization** (zero cost): lowercase + lemmatize + snake_case before upsert. Solves "prefers tea" vs "likes tea" at the key level.
2. **MD5 hash** (near-zero cost): hash `(category, normalized_key, value)`, reject if seen. Prevents re-extraction of identical facts.
3. **Semantic similarity check** (low cost, conditional): embed the new key, query pgvector for top-3 neighbors. If any existing key has cosine similarity > 0.92, treat as duplicate — update value if value differs (temporal override), skip if value matches.

Skip semantic dedup for entries with `confidence < 0.55` — low-confidence entries don't warrant the embedding cost, and if they're borderline noise, exact/hash dedup is sufficient.

---

## 4. Contradiction Handling

### 4.1 Temporal Override (Primary Strategy)

The Mem0 `UPDATE_MEMORY_PROMPT` states: "If a memory is directly contradicted by new information, critically evaluate both pieces of information and choose the most recent or accurate version."

The state-of-memory 2026 research confirms: temporal priority is the dominant strategy — newer information wins when it directly contradicts older information on the same key.

The Graphiti framework (cited in governance research) implements **validity windows**: facts carry `valid_from` and `valid_until` timestamps. When a new fact supersedes an old one, the old entry's `valid_until` is set to the current timestamp rather than being deleted.

### 4.2 Soft Delete (Recommended Over Hard Delete)

The research consistently recommends soft deletion over hard deletion for several reasons:

- Supports "Emma remembers when you changed your mind" UX
- Enables audit trails (EU AI Act compliance context)
- Allows recovery if the new information was incorrectly extracted

Schema pattern from the TDS article on memory decay:

```
status: active | archived | superseded | expired
contradicted_by: <id of the memory that replaced this one>
```

When a new memory on the same key has a different value, the pipeline should:

1. Insert the new memory as `status: active`
2. Update the old memory to `status: superseded`, set `contradicted_by: <new_id>`
3. Optionally log to a `memory_events` table for audit

### 4.3 LLM-Based Contradiction Detection (Expensive, Reserve for High-Stakes)

Asking the LLM "does this new fact contradict any existing memories?" requires loading a significant portion of the memory store. Mem0 v1/v2 did this by retrieving the top-10 similar memories before the update decision — a 2-LLM-call pipeline. Mem0 v3 dropped it because the cost wasn't justified at scale.

For Emma, LLM-based contradiction detection is too expensive for every insert. The upsert-on-key approach handles most cases. A lightweight heuristic covers the rest: when inserting a new memory for a `(user_id, category, key)` that already has a different value, that is by definition a contradiction — handle it with temporal override without needing LLM judgment.

### 4.4 Practical Contradiction Handling for Emma

The current upsert (`onConflict: "user_id,category,key"`) already handles the simplest case — same key, different value overwrites. The gaps are:

1. No soft-delete / superseded tracking
2. No history preservation
3. Semantic contradictions (different keys, same concept) go undetected

For (1) and (2): add `status` and `superseded_by` columns to the `memories` table. On upsert conflict with a changed value, write the old row to a `memory_history` table before overwriting.

For (3): the semantic dedup step (layer 3 above) catches these — if the new memory's key is semantically similar (>0.92) to an existing key with a different value, treat it as a temporal override of the existing entry rather than a new insert.

---

## 5. Memory Retrieval and Context Injection

### 5.1 Full Dump vs. Selective Retrieval

**The threshold finding from arxiv:2603.04814:**

- Average compressed memory footprint per user: ~2,909 tokens (from 101k-token conversation history, 35:1 compression)
- k=20 retrieval: ~1,046 tokens per query
- Full-context approach: 26,000 tokens per query
- Break-even point: if the same 100k context is queried more than ~2–3 times, extraction + selective retrieval is cheaper than full re-injection

**State-of-memory 2026 benchmark:** 6,956 tokens per retrieval call (mem0) vs. ~26,000 for full-context. Selective retrieval is 3.7x more efficient.

**Practical threshold for Emma:** At ~50 memories x ~20 tokens each = ~1,000 tokens for full injection. This is well within the budget for a 128k context window. The cost concern is not context length at 50 memories — it is semantic quality: a flat dump of 200 memories becomes noisy and degrades response quality.

**Recommended switchover point:** full injection up to ~100 memories total. Beyond 100, switch to semantic retrieval (embed the current user message, retrieve top-k most relevant memories). The k=20 setting from the research is a reasonable starting point.

### 5.2 Token Budget

At Emma's current structure:

- 50 memories x ~20 tokens = ~1,000 tokens (manageable)
- 100 memories x ~20 tokens = ~2,000 tokens (still fine)
- 200 memories x ~20 tokens = ~4,000 tokens (approaching noise territory)
- 500 memories x ~20 tokens = ~10,000 tokens (switch to retrieval)

The serialization in `serializeMemories()` currently outputs one line per memory. Consider grouping by category and dropping the `[CATEGORY]` header overhead to reduce token count. The current format is already efficient.

### 5.3 Staleness Pruning Policy

From the research synthesis:

**Decay formula (TDS article):** `decay_score = e^(-ln2 * t / half_life)` where `t` = days since last access. Recommended `half_life = 30` days (score halves monthly). Memories with `decay_score < 0.1` are archived.

**Practical policy for Emma:**

| Condition                                        | Action                                       |
| ------------------------------------------------ | -------------------------------------------- |
| Not accessed in 90 days AND `confidence < 0.5`   | Archive (`status: archived`)                 |
| Not accessed in 180 days AND `confidence < 0.7`  | Archive                                      |
| Explicitly superseded by a newer memory          | Soft-delete (`status: superseded`)           |
| `category = context` AND not accessed in 30 days | Archive (context entries are more transient) |
| `category = constraint`                          | Never prune automatically                    |
| `category = goal` AND user marks complete        | Archive                                      |

**The open problem (from state-of-memory 2026):** High-confidence, high-relevance memories that become factually wrong (e.g., "employer: Acme Corp" when the user changes jobs) are not caught by decay — they're still accessed frequently. This is an unsolved problem in the field. The only reliable solution is either (a) user-initiated correction, or (b) periodic re-extraction and contradiction check, which is expensive. For Emma, recommend surfacing a low-friction correction UX ("Is this still accurate?") for high-confidence memories that haven't been confirmed in 6+ months, rather than attempting automated invalidation.

---

## 6. Reference Implementations Summary

### Mem0 (mem0.ai / github.com/mem0ai/mem0)

**Architecture:** Three-tier pipeline — extract, dedup, retrieve.  
**Extraction:** Single LLM call (v3, ADD-only), extracting atomic facts as flat strings. No internal category taxonomy enforced by default; custom categories are configurable.  
**Dedup:** MD5 hash for exact dupes post-extraction; semantic dedup was in v1/v2 (retrieve top-10 similar, decide ADD/UPDATE/DELETE/NONE via LLM), dropped from write path in v3 for cost.  
**Contradiction:** v1/v2 explicit (LLM-driven); v3 deferred to retrieval time.  
**Retrieval:** Hybrid — semantic (vector) + BM25 (lemmatized keywords) + entity matching, fused into a single normalized score.  
**Confidence:** No per-memory confidence scores in production; quality managed via extraction prompt discipline and retrieval ranking.  
**Benchmark:** 91.6 on LoCoMo (2026 v3).  
**Key insight:** The simplification from 2-call to 1-call extraction with deferred contradiction resolution is the most important practical finding. At Emma's scale, the older 2-call approach (extract + decide) is justified if contradiction handling quality matters more than cost.

### MemGPT / Letta (letta.com)

**Architecture:** Context as RAM metaphor — core memory (in-context), recall memory (conversation history), archival memory (external indexed store).  
**Extraction:** Agent-driven; the agent itself calls tools to update its own memory blocks. No separate extraction LLM call.  
**Dedup/Contradiction:** Agent-managed via recursive summarization and eviction. No formal dedup pipeline.  
**Retrieval:** Archival memory uses vector search; core memory is always injected.  
**Key insight:** The core/recall/archival split maps roughly to Emma's: constraint memories (never evict) = core; conversation history = recall; extracted user facts = archival.

### Graphiti (temporal knowledge graph pattern)

**Architecture:** Facts carry `valid_from` / `valid_until` windows, indexed via interval trees.  
**Contradiction:** Old facts are invalidated (not deleted) when superseded. Enables historical queries ("what did Emma know at time T?").  
**Key insight:** The validity-window pattern is the cleanest model for temporal contradiction handling and maps directly to the soft-delete approach recommended for Emma.

---

## 7. Synthesis: Specific Recommendations for Emma

### Gaps in Priority Order

1. **Prompt quality** — the current `MEMORY_EXTRACTION_PROMPT` has no few-shot examples and no explicit skip rules. This is the highest-leverage improvement; bad extraction contaminates everything downstream.

2. **Key normalization before upsert** — add lowercase + lemmatize + snake_case normalization in `addMemoryForUser()`. This is a pure code change, no LLM call, and eliminates a large class of semantic duplicates without embedding cost.

3. **Soft delete / superseded tracking** — add `status` and `superseded_by` to the memories schema, and a `memory_history` table. The upsert currently silently overwrites with no audit trail.

4. **Category taxonomy** — extend from 5 to 7 categories: add `goal`, `relationship`, `constraint`; rename `routine` to `habit`; drop `environment`. Update the JSON schema enum in the extraction route.

5. **Confidence threshold calibration** — current 0.5 cutoff is reasonable. Research supports 0.55 as a slightly tighter filter with minimal signal loss. The confidence scale should be anchored to explicitness level in the prompt (currently it is not).

6. **Staleness pruning** — no pruning currently exists. Add a scheduled cron job (Vercel cron, already used in Emma) that archives memories matching the conditions in section 5.3. This prevents unbounded growth.

7. **Retrieval switchover** — implement semantic retrieval for users with more than 100 memories. Below 100, full injection is fine.

8. **Semantic deduplication** — lower priority than items 1–6 at Emma's current scale. Key normalization (item 2) solves most cases cheaply. Semantic embedding dedup can be added later if duplicate noise becomes a real user-facing problem.

### What Not to Do

- **LLM-based contradiction detection on every insert**: too expensive. Temporal override via upsert + soft-delete handles the practical cases.
- **Full semantic dedup with embedding on every low-confidence insert**: the cost is not justified for borderline memories.
- **Per-session extraction only**: the field has moved away from session-batched extraction toward per-turn async. Emma's current per-response extraction is the right approach.
- **Automatic pruning of `constraint` category**: constraints like dietary restrictions should never be auto-pruned; only user-initiated deletion.

---

## Sources

- Mem0 arxiv paper: [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/html/2504.19413v1)
- Mem0 v3 migration docs: [Open Source: Migrating to the New Memory Algorithm](https://docs.mem0.ai/migration/oss-v2-to-v3)
- Mem0 prompts source: [mem0/configs/prompts.py on GitHub](https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py)
- How mem0's three prompts work: [Mem0: How Three Prompts Created a Viral AI Memory Layer](https://blog.lqhl.me/mem0-how-three-prompts-created-a-viral-ai-memory-layer)
- Cost analysis (fact-based vs. long-context): [Beyond the Context Window: A Cost-Performance Analysis](https://arxiv.org/html/2603.04814v1)
- Memori paper: [Memori: A Persistent Memory Layer for Efficient, Context-Aware LLM Agents](https://arxiv.org/html/2603.19935)
- MemX system: [MemX: A Local-First Long-Term Memory System for AI Assistants](https://arxiv.org/pdf/2603.16171)
- Letta agent memory: [Agent Memory: How to Build Agents that Learn and Remember](https://www.letta.com/blog/agent-memory)
- State of AI agent memory 2026: [State of AI Agent Memory 2026: Benchmarks, Architectures & Production Gaps](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- Memory decay / staleness: [Stop Treating AI Memory Like a Search Problem](https://towardsdatascience.com/stop-treating-ai-memory-like-a-search-problem/)
- Memory governance: [AI Agent Memory Governance: Access, Audit, and Best Practices](https://atlan.com/know/ai-agent-memory-governance/)
- NVIDIA SemDeDup: [Semantic Deduplication — NVIDIA NeMo Framework](https://docs.nvidia.com/nemo-framework/user-guide/25.07/datacuration/semdedup.html)
- Memory types taxonomy: [Types of AI Agent Memory: Episodic, Semantic, Procedural](https://atlan.com/know/types-of-ai-agent-memory/)
