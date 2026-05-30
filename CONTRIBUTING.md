# Contributing to Emma

## Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in OPENROUTER_API_KEY + three SUPABASE_* vars
npx supabase db push   # or paste supabase/schema.sql into the SQL Editor
npm run dev
```

## Before submitting a PR

```bash
npm run lint      # 0 warnings required
npx tsc --noEmit  # 0 TypeScript errors required
npm test          # all tests must pass
```

## Branch naming

`feat/<name>`, `fix/<name>`, `chore/<name>`. Target `main`.

## Commit style

Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `chore: ...`, `docs: ...`.

## Architecture constraints

**Do not add `src/middleware.ts`.** Next.js 16.2.4 treats `src/proxy.ts` as a first-class routing construct. Having both causes a crash loop at startup. All middleware logic belongs in `src/proxy.ts`.

**Dynamic route params** must use the Next.js 16 async form: `params: Promise<{ id: string }>` with `const { id } = await params` inside the handler.

## Adding tools

Register new autonomous tools in `src/core/tool-registry.ts`. Set `riskLevel` honestly:

- `safe` — read-only, no external side effects
- `moderate` — writes to internal state, logged but auto-approved
- `dangerous` — external side effects (email, booking, deletion) — always pauses for human approval

Add `outputVar?: string` to your handler's `ToolResult` if the output should be stored in the task context scratchpad.

## Environment variables

Add new server-side vars to `.env.local.example` with a comment explaining where to get the value. Add them to the Environment Variables table in `README.md` and `CLAUDE.md`.

## Tests

Unit tests go in `tests/unit/`. Integration tests (requiring external APIs) go in `tests/integration/` and must use `describe.skipIf(!process.env.YOUR_KEY)` so they skip safely in CI without credentials.
