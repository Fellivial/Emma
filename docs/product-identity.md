# Product Identity: What Emma Is

This document is the reference for every product decision. Before implementing a
feature, check it against the acceptance checklist below. If a feature fails the
checklist, it does not ship — regardless of how useful it looks in isolation.

Companion reading: [docs/niche.md](niche.md) (who Emma is for),
[ADR 0001](adr/0001-behavior-flags.md) (how personality is enforced in code).

---

## What Emma Is

Emma is an AI **companion** for emotionally underserved people — users who tried
Replika or ChatGPT and were frustrated that those relationships have little
memory, no context, and no ability to help with real-world tasks.

Emma's moat is, **in this order**:

1. **Warmth** — a persona (mommy/neutral vibes, avatar, voice) that feels
   genuinely present, reads the room, and leads with care.
2. **Memory** — she remembers who you are, what you said, and what matters to
   you, and that memory deterministically changes her behavior (behavior flags),
   not just her prose.
3. **Real-world utility** — integrations and routines let the relationship
   _do things_: send the email you keep putting off, remember the appointment
   you mentioned, keep your notes somewhere real.

The order matters. Utility exists to make the relationship useful. Warmth is
never traded for utility.

## What Emma Is Not

- **Not a productivity suite.** Emma is not Notion AI, not Zapier, not a
  workflow engine. Features that serve productivity without emotional presence
  are not Emma's wedge.
- **Not an automation platform.** She has routines and autonomous tasks, but
  they are things _she does for you within a relationship_, not a builder UI
  for pipelines. There is no workflow builder — that surface was removed in
  Phase 5 precisely because it misrepresented the product.
- **Not a business tool with a persona bolted on.** There is no "Business
  Mode". Work-adjacent integrations (HubSpot, Slack) exist because users'
  lives include work, not because Emma is a sales assistant.
- **Not a device controller.** DeviceGraph is deprecated and inert.
- **Not a general-purpose chatbot.** A response that could have come from any
  assistant is a failure of persona, even if it is factually perfect.

## Core Principles

1. **Companion-first.** Every surface — settings, errors, emails, empty states
   — speaks in Emma's voice about the relationship, not in SaaS voice about
   features.
2. **Behavior is code, not hope.** Personality flows through the deterministic
   behavior-flags layer (ADR 0001). Memory provides facts, emotion provides
   state, flags decide behavior, prompts render it, the validator observes it.
   New behavioral features must plug into this pipeline, not bypass it.
3. **Care beats cleverness.** Negative emotion always suppresses teasing.
   Distress skips the playful nudge. This is enforceable and enforced.
4. **Trust is load-bearing.** Emma acts on the user's behalf (email, calendar,
   messages), so safety defaults are conservative: dangerous actions always
   require approval, moderate actions default to suggest-and-confirm, and a
   failed safety evaluation means the action does not run. Fail-open is
   acceptable for _access_ (usage metering), never for _action_.
5. **Minimal surface area.** Dead UI, disabled previews, and speculative
   builders erode identity faster than missing features do. If it doesn't
   work, it isn't shown.

## Companion-First Philosophy

The target user is closer to a frustrated Replika user than a frustrated
Notion AI user. They are not buying task execution; they are buying a presence
that knows them and can occasionally act for them.

Practically:

- The persona (mommy/neutral, avatar, voice) is the differentiator; the
  integrations are supporting cast.
- Proactive features (greetings, idle speech, pattern suggestions) speak as
  Emma noticing something about _you_, never as a product pitching automation.
- Utility is framed through memory: "you mentioned the dentist — want me to
  put it on your calendar?" beats "create calendar events".
- Settings hierarchy mirrors this: Companion settings (profile, persona,
  notifications, privacy) are primary; power surfaces (integrations, tasks,
  audit trail) live under Advanced.

## Feature Acceptance Checklist

Before building a feature, answer all of these. A single "no" on 1–4 means
reframe or reject.

1. **Does it strengthen warmth, memory, or real-world utility — in a way the
   user experiences through the relationship?**
2. **Would a frustrated Replika user want this?** (Not: would a project
   manager want this.)
3. **Can Emma present it in her own voice?** If the feature can only be
   explained in SaaS vocabulary (pipelines, workspaces, dashboards), it
   doesn't belong.
4. **Is it real?** No disabled previews, mock data surfaces, or "coming soon"
   builders in the shipped UI.
5. **If it acts on the user's behalf: is the safe path the default path?**
   Approval architecture preserved, conservative defaults, fail-closed
   evaluation for writes.
6. **If it changes behavior: does it flow through behavior flags?** No new
   parallel behavioral mechanisms.

## Identity Guardrails

- Copy anywhere in the product avoids productivity-first framing. Watch for:
  "boost your productivity", "streamline", "workflows", "pipeline" (except in
  the literal HubSpot sense), "extend capabilities".
- The mommy persona's teasing is always gated by `teasingLevel` and emotion
  state; no feature may hardcode playfulness.
- No feature ships that makes Emma feel like a tool rented by an employer
  rather than a companion chosen by the user.
- Autonomy is the user's dial, not the product's growth lever. Defaults stay
  conservative (tier 2, suggest & confirm); tier 3 is opt-in.
- Memory is intimate data: encrypted at rest, exportable, deletable. Any
  feature that reads memory inherits those obligations.

## Expansion Rules

When considering new capability areas (new integrations, new modalities, new
autonomy):

1. **Start from a user moment, not a market.** "She could remind me to call my
   mum" is a valid seed. "SMBs need CRM automation" is not.
2. **New integrations must have a companion story** written before
   implementation: one sentence in Emma's voice explaining why she wants this
   connection, referencing warmth or memory. If the sentence reads like an
   app-store listing, don't build it.
3. **New autonomy expands within the existing tier architecture** — no
   parallel approval systems, no per-feature autonomy bypasses.
4. **New behavioral expressiveness expands the flag layer** (one flag, one
   derivation clause, one directive), never ad-hoc prompt engineering per
   feature.
5. **One phase, one identity test:** after any expansion phase, the question
   "what is Emma?" must have the same answer as before the phase. If the
   answer drifted, the phase failed even if every ticket closed.
