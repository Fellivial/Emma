# ADR 0001: Behavior Flags — a deterministic behavioral layer between state and prompt

- **Status:** Accepted
- **Date:** 2026-07-04
- **Phase:** 3 — "Become Emma"
- **Implementation:** `src/core/behavior-flags.ts`, `src/core/response-validator.ts`

---

## Problem Statement

Emma's personality today is almost entirely **prompt-hoped, not code-enforced**. The Phase 3 Readiness Audit found exactly one place where stored user state structurally changes behavior: the `interaction_vibe` preference memory flips the persona from `mommy` to `neutral` (`src/app/app/page.tsx`). Every other signal — extracted preference memories, the fused `EmotionState`, time of day — is serialized into prose inside the system prompt ("Adapt your tone accordingly", "weave them in naturally") and the LLM is trusted to comply on every turn.

This is insufficient for a behaviorally consistent companion because:

1. **No determinism.** Whether "user dislikes emojis" actually suppresses emojis depends on model attention on that turn. Model swaps (OpenRouter `BRAIN_MODELS` is a fallback list) change compliance rates silently.
2. **No testability.** There is no unit under test between "memory says X" and "response does X" — you can test prompt assembly, but not the behavioral decision, because no decision exists as code.
3. **No observability.** When Emma teases a distressed user, nothing in the system can even detect that the behavior contradicted the emotion state.
4. **Duplication pressure.** Each engine (personas, greeting, proactive speech) re-derives behavioral judgments from raw memories independently — e.g. `greeting-engine.ts` and `proactive-speech.ts` both re-implement "which memory is safe to mention" with copy-pasted category/confidence filters.

## Goals

- **Deterministic** — same inputs (memories, emotion, persona, time) always produce the same flags. Pure function, no I/O, no randomness.
- **Model-independent** — flags are derived before any LLM call and validated after it; nothing about them assumes a specific model.
- **Testable** — the derivation is a pure function; the validator is a pure function; both are unit-testable without network or DB.
- **Reusable across systems** — one derivation, many consumers (prompt builder now; voice/avatar/proactive speech later).
- **Extensible** — adding a flag is one field + one derivation clause + one directive line; no restructuring.
- **Lightweight** — no rule engine, no config DSL, no persistence. Flags are recomputed per request from state that already exists.

## Architecture

The complete pipeline (items in brackets already exist and are consumed, not redesigned):

```
[Memory (preference entries, getRelevantMemoriesForUser)]
[EmotionState (emotion-engine.ts fusion, sent per-request)]
[CustomPersona (user-configured verbosity/tone, Pro/Enterprise)]
[Persona baseline (mommy | neutral)]
[Time (user-timezone hour)]
        │
        ▼
deriveBehaviorFlags()            ← src/core/behavior-flags.ts (pure, deterministic)
        │
        ▼
BehaviorFlags                    ← single source of truth for behavioral decisions
        │
        ├──► Prompt Builder      ← personas.ts renders compact directives (dynamic block)
        │
        ├──► Response Validation ← response-validator.ts confirms the reply honored flags
        │                          (log-only; never rewrites)
        │
        └──► Future consumers    ← voice delivery, avatar, proactive speech,
                                   greeting engine, Live2D (later phases)
```

Behavioral adaptation must flow **through** flags. Memory, Emotion, and the Prompt Builder must not independently implement behavioral logic: memory provides facts, emotion provides state, the prompt builder renders whatever the flags decided.

## Initial Behavior Flags

| Flag           | Purpose                           | Values                                | Primary sources                                                                                              | Consumers (Phase 3)          |
| -------------- | --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `verbosity`    | Response length policy            | `concise` \| `normal` \| `verbose`    | preference memories, CustomPersona.verbosity                                                                 | prompt directives, validator |
| `emojiUsage`   | Emoji policy                      | `none` \| `minimal` \| `normal`       | preference memories                                                                                          | prompt directives, validator |
| `teasingLevel` | Teasing/playful-edge intensity    | `off` \| `light` \| `playful`         | persona baseline, `interaction_vibe` + preference memories, EmotionState (downward only on negative valence) | prompt directives, validator |
| `warmth`       | Empathy/affection lean            | `standard` \| `elevated`              | EmotionState (negative valence ⇒ elevated), preference memories                                              | prompt directives            |
| `initiative`   | Follow-up questions / suggestions | `reactive` \| `balanced` \| `forward` | persona baseline, EmotionState arousal, late-night hour                                                      | prompt directives            |

Value ranges are small closed enums on purpose: every value must map to a concrete, testable directive and (where checkable) a validator rule. Numeric 0–1 scales were rejected — they invite untestable pseudo-precision.

## Data Sources

- **Memory** — `preference`-category entries with confidence ≥ 0.6. Two mechanisms:
  - _Recognized keys_ (exact match on the normalized snake_case key the extractor produces): `interaction_vibe`, `verbosity`/`response_length`/`response_style`, `emoji_preference`/`emoji_usage`, `teasing_preference`/`teasing`.
  - _Value keyword scan_ over all preference values (e.g. "no emojis", "short answers", "don't tease me", "loves teasing") as a fallback, because the extractor chooses keys freely.
- **Emotion** — the existing `EmotionState` (valence/arousal/confidence) from `emotion-engine.ts`, applied only when `confidence > 0.3` (same gate the prompt already uses). Emotion is **per-turn modulation**, not a durable preference.
- **Time** — the user-timezone hour (already computed for `timeContext`); late night (23:00–05:00) lowers `initiative`.
- **Conversation** — not consumed in v1. The conversation summary stays prompt-only context; deriving flags from summaries would be nondeterministic (LLM-written text). Revisit if a structured conversation-stats object appears.
- **Persona** — `mommy` baseline: `teasingLevel: playful`, `initiative: forward`. `neutral` baseline: `teasingLevel: off`, `initiative: balanced`.
- **User preferences** — `CustomPersona.verbosity` (an explicit user setting) seeds `verbosity` between persona baseline and memory.

**Precedence (lowest → highest):** persona baseline → CustomPersona settings → memory preferences → emotion/time modulation. Two deliberate rules:

1. Durable explicit preferences beat per-turn emotion for _style_ flags (`verbosity`, `emojiUsage`) — a sad user who hates emojis still hates emojis.
2. Negative emotion **always** suppresses teasing, even if the user generally likes teasing — "read the room; if the user seems distressed, lead with care first" is already a core persona rule; the flag layer makes it enforceable. Emotion can only lower teasing, never raise it above what persona + memory allow.

## Consumers

Evaluated for Phase 3:

- **Prompt Builder** (`personas.ts`) — **wired now.** Renders flags as a compact `## Behavior Directives` block in the dynamic prompt section (flags change per turn with emotion). The behavioral prose in the emotion block ("Adapt your tone accordingly…") moves here, so net prompt size stays roughly constant.
- **Response Validation** (`response-validator.ts`) — **wired now.** After the full response is parsed in the brain route, checks emoji count, sentence count, and teasing markers against the flags. Violations are logged (`console.warn`) and surfaced in the SSE `done` event as `behaviorViolations` for observability. It never rewrites the response.
- **Voice (TTS)** — **not wired.** Delivery style (rate/stability by warmth) is a natural consumer, but TTS work is explicitly out of Phase 3 scope. The flag object is client-visible in the future via the done event if needed.
- **Avatar** — **not wired.** Expression is already driven by the `[emotion:]` tag grounded in the actual response text, which is better evidence than a pre-response flag. No change.
- **Proactive Speech / Greeting Engine** — **not wired in v1.** Both are client-side with hand-authored message banks; consuming `teasingLevel` there (e.g. skip smirk-bank lines when teasing is off) is the first Phase 3.x follow-up, and the module is client-safe ("no fs, no server imports") specifically to allow it.
- **Future Live2D** — out of scope; noted as a possible consumer of `warmth`/`initiative` for idle-motion selection.

## Design Constraints

- **Model-independent:** flags derive from stored/derived state only; validation uses plain text heuristics, no LLM judging.
- **No business-logic duplication:** the derivation is the _only_ place that maps state → behavior. `personas.ts` renders, never decides. The existing `interaction_vibe → setPersona` client flip remains (it selects which persona baseline feeds the derivation) — it is the reference architecture, not a parallel mechanism.
- **Deterministic where practical:** `deriveBehaviorFlags` is fully deterministic. The only nondeterminism in the system remains the LLM itself — which is exactly what the validator observes.
- **Future expansion:** new flags are additive; consumers ignore unknown fields.
- **No prompt bloat:** directives are one line per non-default flag; a fully-default flag set renders only the persona's standing directives. Measured budget: ≤ 8 short lines.

## Alternatives Considered

- **Prompt-only behavior (status quo).** Rejected: unverifiable, model-dependent, and the audit's central finding — memory becomes prose, not behavior.
- **A larger, more detailed personality prompt.** Rejected: increases token cost and instruction-conflict surface without adding determinism or testability; still zero observability.
- **Fine-tuned personality models.** Rejected: Emma routes through OpenRouter with a fallback model list; fine-tunes would pin us to one provider/model, are expensive to iterate on per-user preferences, and can't react per-turn to emotion.
- **A rule engine (config-driven conditions/actions).** Rejected as over-engineering: five enum flags with fixed precedence do not need a DSL; a pure TypeScript function is simpler, typed, and easier to test. If flag count grows past ~a dozen with user-configurable rules, revisit.

## Migration Strategy

Incremental adoption; no rewrites:

1. **Phase 3 (this ADR):** add the layer + wire the two server-side consumers (prompt builder, validator). Existing systems keep working untouched; the emotion block in the prompt loses its behavioral sentences (now flag directives) but keeps its factual state.
2. **Phase 3.x:** proactive speech and greeting engine consume `teasingLevel`/`warmth` to filter message banks — replacing their private category/confidence heuristics gradually.
3. **Later phases:** voice delivery and Live2D idle behavior read flags when those systems are redesigned. If validation data shows persistent violations, escalate specific checks from log-only to response-shaping — a deliberate, separate decision.

Rollback is trivial at every step: omit `behaviorFlags` from the prompt context and the prompt renders exactly as before.
