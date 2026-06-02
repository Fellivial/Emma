# Supabase Data API Access Changes — Research & Emma Audit

**Date:** 2026-05-31  
**Researcher:** Claude Code  
**Scope:** Supabase breaking-change analysis + full Emma codebase audit

---

## Part 1: What Changed on May 30, 2026

### The Announcement

Supabase published "Breaking Change: Tables not exposed to Data and GraphQL API automatically" on 2026-04-28 (changelog entry 45329). The May 30 date is a key milestone in its rollout.

**Source:** https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

### What Exactly Changed

**Before:** When a Supabase project was created, Postgres automatically granted `SELECT, INSERT, UPDATE, DELETE` on every table in the `public` schema to the `anon`, `authenticated`, and `service_role` roles. Any new table became immediately accessible via the Data API (PostgREST at `/rest/v1/`) on creation.

**After (from May 30 for all new projects):** No default grants are issued. New tables in `public` are invisible to the Data API until explicitly granted. PostgREST returns:

```json
{
  "code": "42501",
  "message": "permission denied for table your_table",
  "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.your_table TO anon;"
}
```

### What Does NOT Change

- **RLS behavior is unchanged.** Grants and RLS are separate layers. Grants control whether a role can access a table at all; RLS policies control which rows that role can see.
- Existing tables in existing projects keep their current grants and remain reachable **until October 30, 2026**.
- Tables in `auth`, `storage`, `realtime`, and custom schemas are unaffected.
- Direct Postgres connections (psql, ORM, connection string) are unaffected.

### Rollout Timeline

| Date           | Milestone                                                                          |
| -------------- | ---------------------------------------------------------------------------------- |
| 2026-04-28     | Changelog published; opt-in toggle available at project creation                   |
| 2026-05-18     | pg_graphql no longer enabled by default                                            |
| **2026-05-30** | **New behavior is the default for all new projects** (gradual rollout over weeks)  |
| 2026-10-30     | Enforced on ALL existing projects — new tables without grants stop being reachable |

### The Fix Pattern Required for New Tables

```sql
-- 1. Explicit grants (required for Data API access)
GRANT SELECT ON public.your_table TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO service_role;

-- 2. Enable RLS (unchanged from before)
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;

-- 3. Add policies (unchanged from before)
CREATE POLICY "users can read their own rows"
  ON public.your_table FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

### Related Prior Breaking Change (Feb 17, 2026)

"Removing access to OpenAPI spec via the anon key" (changelog 42949): The `/rest/v1/` root endpoint (OpenAPI schema) is no longer accessible via the anon key from April 8, 2026 onward. Only `service_role` or secret API keys can fetch the schema spec. Normal data queries to `/rest/v1/your_table` are unaffected.

---

## Part 2: Emma's Supabase Usage Patterns

### Key Files Audited

| File                               | Key Role                                            |
| ---------------------------------- | --------------------------------------------------- |
| `src/core/memory-db.ts`            | DB ops for memories, conversations, messages, usage |
| `src/core/client-config.ts`        | Reads `clients`, `client_members`, `usage` tables   |
| `src/core/usage-enforcer.ts`       | Reads/writes `usage_windows`, `extra_packs`         |
| `src/core/integrations/adapter.ts` | Reads/writes `client_integrations`                  |
| `src/core/security/audit.ts`       | Writes `audit_log`                                  |
| `src/lib/supabase/client.ts`       | Browser client (anon key)                           |
| `src/lib/supabase/server.ts`       | Server client (anon key + session cookie)           |
| `src/lib/supabase/admin.ts`        | Admin singleton (service_role key)                  |
| `src/proxy.ts`                     | Middleware auth check (anon key + session)          |
| `supabase/schema.sql`              | Full schema with RLS policies                       |

### Client Key Architecture

Emma uses **two distinct Supabase client patterns**:

**Pattern A — Service Role (bypasses RLS, server-side only):**

- `src/core/memory-db.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`
- `src/core/client-config.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`
- `src/core/usage-enforcer.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`
- `src/core/integrations/adapter.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`
- `src/lib/supabase/admin.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`
- All API routes under `src/app/api/` via the above modules

**Pattern B — Anon Key (browser-side, RLS-enforced):**

- `src/lib/supabase/client.ts` — `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `createBrowserClient`
- Used by: `src/app/settings/usage/page.tsx`, `src/app/settings/mcp/page.tsx`, `src/app/settings/provenance/page.tsx`, `src/app/settings/profile/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/login/page.tsx`

**Pattern C — Server SSR Client (anon key + cookie session):**

- `src/lib/supabase/server.ts` — `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `createServerClient`
- `src/proxy.ts` — same key, used purely for `auth.getUser()` session refresh (no table queries)

### No Direct REST Calls

No files in `src/` make direct HTTP calls to `/rest/v1/` or `${NEXT_PUBLIC_SUPABASE_URL}/rest/`. All Supabase interactions go through the JS SDK (`@supabase/supabase-js` or `@supabase/ssr`).

### RLS Status in schema.sql

All 24 application tables have `ENABLE ROW LEVEL SECURITY` statements. **Three tables lack RLS enablement in the current schema:**

| Table                 | RLS Enabled | Policy Exists |
| --------------------- | ----------- | ------------- |
| `waitlist`            | No          | No            |
| `waitlist_v2`         | No          | No            |
| `rate_limit_counters` | No          | No            |

Additionally, `email_sequences` has RLS enabled but **no policy defined** in the schema. This means with RLS on and no policy, no authenticated user (nor anon) can read/write it via the Data API — only service_role (which bypasses RLS) can.

---

## Part 3: Gap Analysis

### Gap 1 — New Tables Will Be Invisible to the Data API on New Projects

**Impact: HIGH (future-facing, breaks any project created after May 30)**

Emma's `supabase/schema.sql` contains no `GRANT` statements and no `ALTER DEFAULT PRIVILEGES` configuration. Under the old behavior (projects created before May 30), Postgres issued default grants automatically. On projects created after May 30, 2026, **every table defined in `schema.sql` will exist but be invisible to the Data API** — both for the service_role server-side client and the anon/authenticated browser client.

The `service_role` Postgres role has `BYPASSRLS` but still needs explicit grants at the table level on new projects. Without grants, PostgREST returns `permission denied for table` regardless of which key is used.

**Tables accessed client-side (authenticated anon key, browser) that need explicit grants:**

| Table                 | File                                   | Line         |
| --------------------- | -------------------------------------- | ------------ |
| `tasks`               | `src/app/settings/usage/page.tsx`      | 162–166      |
| `clients`             | `src/app/settings/mcp/page.tsx`        | 44–48        |
| `clients`             | `src/app/onboarding/page.tsx`          | 133–137      |
| `client_integrations` | `src/app/settings/mcp/page.tsx`        | 56–62, 76–78 |
| `provenance_chains`   | `src/app/settings/provenance/page.tsx` | 34–39        |
| `profiles`            | `src/app/onboarding/page.tsx`          | 111–117      |
| `memories`            | `src/app/onboarding/page.tsx`          | 120–128, 173 |

**Tables accessed server-side (service_role) — all tables in schema.sql** need `GRANT ... TO service_role` statements.

### Gap 2 — Three Tables Have No RLS at All

**Impact: MEDIUM (affects existing and new projects)**

`waitlist`, `waitlist_v2`, and `rate_limit_counters` have no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in the schema.

- **`waitlist` / `waitlist_v2`**: Contain user emails, sign-up status, industry info. Without RLS, any authenticated user with a grant can read all rows (not just their own).
- **`rate_limit_counters`**: Contains task/token counts per `client_id`. No row-level isolation.

These are currently only written via API routes using service_role, but the missing RLS is a security gap that the new grant-based model brings into sharper focus.

### Gap 3 — `email_sequences` Has RLS Enabled But No Policy

**Impact: LOW (data is blocked, but unintentionally)**

`email_sequences` has RLS enabled (`schema.sql` line 544) but no policy is defined. This means:

- The `service_role` client (bypasses RLS) can still read/write it — API routes work fine.
- Any query via authenticated or anon key silently returns 0 rows (implicit `USING (false)` when no policy exists).
- This is likely the correct behavior (cron-only access), but it should be made explicit with a deny policy.

### Gap 4 — `clients` Table Queried with Wrong Column in Browser Pages

**Impact: MEDIUM (functional bug, independent of May 30 change)**

`src/app/settings/mcp/page.tsx` line 47 and `src/app/onboarding/page.tsx` line 136 both query:

```ts
supabase.from("clients").select("id").eq("user_id", user.id);
```

The `clients` table schema (`supabase/schema.sql` line 44) has an `owner_id` column, not `user_id`. This query always returns null, causing both pages to silently fail their client lookups. The MCP page shows no servers; the onboarding vertical config update is silently skipped.

### Gap 5 — Anon Key OpenAPI Spec Access (Already Resolved)

**Impact: NONE for Emma**

The Feb 2026 breaking change (anon key access to `/rest/v1/` spec) does not affect Emma. Emma never fetches the OpenAPI spec from the browser. All table operations use typed SDK calls.

### Gap 6 — No `ALTER DEFAULT PRIVILEGES` to Opt Into New Behavior Early

**Impact: LOW (security hygiene — deadline is Oct 30)**

Emma's `schema.sql` does not include the `ALTER DEFAULT PRIVILEGES ... REVOKE` statements that would opt an existing project into the new secure defaults early. This means on existing projects, any future migration that adds a new table will still get old-style auto-grants (until October 30). It's worth running these proactively.

---

## Part 4: Recommended Fixes

### Fix 1 — Add Explicit GRANT Statements to schema.sql (CRITICAL)

Add after the existing RLS policies section in `supabase/schema.sql`, before the INDEXES section:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS (required for Data API access on projects created after 2026-05-30)
-- Without these, PostgREST returns "permission denied for table" on new projects.
-- ═══════════════════════════════════════════════════════════════════════════

-- anon: only tables reachable without authentication (waitlist signup, intake)
grant select, insert on public.waitlist to anon;
grant select, insert on public.waitlist_v2 to anon;

-- authenticated: all tables a signed-in user accesses via the browser client
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.memories to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select on public.usage to authenticated;
grant select on public.usage_windows to authenticated;
grant select on public.extra_packs to authenticated;
grant select on public.tasks to authenticated;
grant select on public.clients to authenticated;
grant select on public.client_members to authenticated;
grant select, insert, update, delete on public.client_integrations to authenticated;
grant select on public.provenance_chains to authenticated;

-- service_role: full access to all tables (server-side API routes)
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Ensure future tables created by the postgres role get service_role grants automatically
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
```

### Fix 2 — Enable RLS on Missing Tables

Add to `supabase/schema.sql` in the RLS section (after line 552):

```sql
alter table public.waitlist enable row level security;
alter table public.waitlist_v2 enable row level security;
alter table public.rate_limit_counters enable row level security;
```

And add policies in the POLICIES section:

```sql
-- Waitlist: anon insert only — no reads (privacy)
drop policy if exists "Anon can join waitlist" on public.waitlist;
create policy "Anon can join waitlist" on public.waitlist
  for insert with check (true);

drop policy if exists "Anon can join waitlist_v2" on public.waitlist_v2;
create policy "Anon can join waitlist_v2" on public.waitlist_v2
  for insert with check (true);

-- Rate limit counters: service_role only (deny all direct access)
drop policy if exists "Deny direct access to rate_limit_counters" on public.rate_limit_counters;
create policy "Deny direct access to rate_limit_counters"
  on public.rate_limit_counters for all using (false);
```

### Fix 3 — Fix Wrong Column Name in Browser Pages

**File:** `src/app/settings/mcp/page.tsx` — line 47  
**File:** `src/app/onboarding/page.tsx` — line 136

Change in both files:

```ts
// Wrong:
.eq("user_id", user.id)

// Correct:
.eq("owner_id", user.id)
```

Note: The `clients` RLS policy (`"Members read own client"`) requires the user be in `client_members`. If these pages are used before a `client_members` row exists for the user, the query will still return null even with the correct column. Consider routing these through an API route (service_role) if the client_members join isn't reliably populated at onboarding time.

### Fix 4 — Add Explicit Deny Policy for email_sequences

```sql
drop policy if exists "Deny direct access to email_sequences" on public.email_sequences;
create policy "Deny direct access to email_sequences"
  on public.email_sequences for all using (false);
```

### Fix 5 — Opt Existing Projects Into New Default Privileges Early (Optional)

Run in the Supabase SQL Editor on your existing project to adopt the new behavior before October 30:

```sql
-- Stop auto-granting on future tables to anon/authenticated
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
```

Existing tables keep their grants. Only new tables added after running this will need explicit grants.

---

## Part 5: Full Table Exposure Summary

| Table                  | Browser (anon key)?   | Needs Grant (new projects) | RLS Enabled | Policy Exists            |
| ---------------------- | --------------------- | -------------------------- | ----------- | ------------------------ |
| `profiles`             | Yes (onboarding)      | Yes — `authenticated`      | Yes         | Yes                      |
| `memories`             | Yes (onboarding)      | Yes — `authenticated`      | Yes         | Yes                      |
| `conversations`        | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `messages`             | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `usage`                | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `usage_windows`        | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `extra_packs`          | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `clients`              | Yes (mcp, onboarding) | Yes — `authenticated`      | Yes         | Yes (via client_members) |
| `client_members`       | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `client_integrations`  | Yes (mcp)             | Yes — `authenticated`      | Yes         | Yes                      |
| `tasks`                | Yes (usage page)      | Yes — `authenticated`      | Yes         | Yes                      |
| `provenance_chains`    | Yes (provenance page) | Yes — `authenticated`      | Yes         | Yes (select only)        |
| `audit_log`            | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `waitlist`             | Via API route         | Yes — `anon` (insert)      | **NO**      | **NO**                   |
| `waitlist_v2`          | Via API route         | Yes — `anon` (insert)      | **NO**      | **NO**                   |
| `rate_limit_counters`  | No (server only)      | Yes — `service_role`       | **NO**      | **NO**                   |
| `email_sequences`      | No (server only)      | Yes — `service_role`       | Yes         | **NO**                   |
| `global_config`        | No (server only)      | Yes — `service_role`       | Yes         | Yes (deny all)           |
| `trials`               | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `trial_events`         | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `oauth_states`         | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `action_log`           | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `approvals`            | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `scheduled_tasks`      | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `agent_task_summaries` | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `pattern_detections`   | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `referrals`            | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `affiliates`           | No (server only)      | Yes — `service_role`       | Yes         | Yes                      |
| `affiliate_referrals`  | No (server only)      | Yes — `service_role`       | Yes         | Yes (select only)        |

---

## Priority Summary

| Priority | Fix                                                                                           | Risk if Skipped                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Add explicit GRANT statements to `supabase/schema.sql`                                        | Any new Supabase project created post-May-30 will have 100% of API routes broken — PostgREST returns 403 on every table |
| **P1**   | Fix `clients` column bug (`user_id` → `owner_id`) in `mcp/page.tsx` and `onboarding/page.tsx` | MCP settings page always empty; onboarding vertical config silently skipped                                             |
| **P2**   | Enable RLS on `waitlist`, `waitlist_v2`, `rate_limit_counters`                                | Any authenticated user with grant can read all waitlist emails and rate limit counters                                  |
| **P3**   | Add deny policy to `email_sequences`                                                          | Correctness — currently blocks data via implicit RLS deny, but intent should be explicit                                |
| **P4**   | Run `ALTER DEFAULT PRIVILEGES ... REVOKE` on existing project                                 | Security hygiene — prevents accidental exposure of future tables before Oct-30 deadline                                 |

**Existing project status:** Emma's existing Supabase project (created before May 30) is **safe until October 30, 2026**. The existing default grants keep all current tables accessible. However, any new project set up (staging, demo tenants) created after May 30 will be broken until Fix 1 is applied to `schema.sql`.
