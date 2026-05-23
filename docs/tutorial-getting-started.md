# Getting Started with Emma

You'll build a working Emma instance — full streaming chat with an animated avatar — and understand every moving part by the end. Two paths: minimal (one API key, running in two minutes) and full (auth, memory, billing, integrations).

## What you'll need

- Node.js 20+ (`node --version` to check)
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
- For the full setup: a Supabase project (free tier works)

---

## Step 1: Clone and install

```bash
git clone https://github.com/Fellivial/Emma.git
cd Emma
npm install
```

---

## Step 2: Set your API key

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

That's the only required variable. Everything else degrades gracefully.

---

## Step 3: Start the dev server

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). You'll see Emma's chat interface immediately.

**What you just got:**
- Streaming chat via Claude Sonnet 4.6
- Live2D avatar with 10 expressions reacting to every response
- Web search and web fetch (Anthropic-hosted, no extra key)
- In-persona greeting on first load

Auth is disabled (no Supabase URL set). Memory won't persist across reloads. That's expected.

---

## Step 4: Send your first message

Type anything in the input bar. Watch two things:

1. The response streams token-by-token to the chat panel.
2. The avatar's expression changes when the `[emotion: ...]` tag arrives at the end of the response.

Emma appends `[emotion: warm]` (or another expression) to every response. The client strips it before display and sends it to the avatar engine. You're seeing the full pipeline: brain → stream → parse → avatar.

---

## Step 5: Full setup (auth + memory + persistence)

For user accounts, persistent memory, and billing, you need Supabase.

### 5a. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a project, and collect:
- **Project URL** — looks like `https://xxxx.supabase.co`
- **Anon key** — from Settings → API → `anon` key
- **Service role key** — from Settings → API → `service_role` key (keep this secret)

### 5b. Copy and fill the env template

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the three Supabase variables plus your Anthropic key:

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

### 5c. Generate an encryption key

Emma uses AES-256-GCM to encrypt OAuth tokens and memories at rest. Generate the key:

```bash
echo "EMMA_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.local
```

### 5d. Run the database schema

Open the **Supabase SQL Editor** in your project dashboard, paste the contents of `supabase/schema.sql`, and run it. This creates all tables, row-level security policies, and triggers.

```
supabase/schema.sql → SQL Editor → Run
```

It's idempotent — safe to re-run.

For any additional migrations (feature additions since the base schema), run them in filename order:

```bash
# Via Supabase CLI
supabase db push

# Or paste each file in supabase/migrations/ into the SQL Editor in order
```

### 5e. Restart and log in

```bash
npm run dev
```

Visit `/login`. Create an account. Emma will now remember facts about you across sessions, track your usage, and persist chat history on reload.

---

## Step 6: Explore the settings

`/settings/profile` — set your name, timezone, and preferences (Emma uses these in conversation)  
`/settings/usage` — see your token usage across daily, weekly, and monthly windows  
`/settings/integrations` — connect Gmail, Google Calendar, Slack, Notion, or HubSpot  
`/settings/billing` — manage your subscription plan  
`/settings/mcp` — add custom MCP server tools  

---

## What you built

A running Emma instance with:
- Streaming AI chat powered by Claude Sonnet 4.6
- Live2D avatar with expression sync
- Persistent memory, user auth, and chat history (full setup only)
- Anthropic-hosted web search with no extra key

**Next steps:**
- [Connect integrations](howto-connect-integrations.md) to let Emma take real actions (send email, check calendar, post to Slack)
- [Set up billing](howto-add-billing.md) to gate features by plan
- [Deploy the SMB intake widget](howto-smb-intake.md) for lead capture
- [Architecture overview](explanation-architecture.md) to understand how the brain route works
