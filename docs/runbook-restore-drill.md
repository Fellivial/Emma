# Runbook: Restore Drill

**Audience:** On-call engineer, SRE  
**Cadence:** Quarterly, and after any schema migration that changes table structure  
**Purpose:** Verify that a production database backup can be restored to staging and that the application passes smoke tests against the restored data — before an incident forces you to do it blind.

---

## Prerequisites

- [ ] Supabase Pro plan (or higher) on the production project — required for daily backups and PITR
- [ ] A separate staging Supabase project (connected to the `dev` branch Vercel deployment)
- [ ] Access to the Supabase dashboard for both projects
- [ ] The staging `EMMA_ENCRYPTION_KEY` — must match whatever key was used on the backup's data; see [Key Escrow runbook](runbook-encryption-key-escrow.md) for how to retrieve it
- [ ] `SUPABASE_SERVICE_ROLE_KEY` for the **staging** project only
- [ ] Supabase CLI: `npm i -g supabase` or `brew install supabase/tap/supabase`

---

## Supabase Backup Capabilities

| Plan       | Daily Backups | Retention | PITR | PITR Retention |
| ---------- | ------------- | --------- | ---- | -------------- |
| Free       | No            | —         | No   | —              |
| Pro        | Yes           | 7 days    | Yes  | 7 days         |
| Team       | Yes           | 14 days   | Yes  | 14 days        |
| Enterprise | Yes           | Custom    | Yes  | Custom         |

**Verify backup status before the drill:**
Supabase Dashboard → Production project → Settings → Backups  
Confirm "Enabled" and a "Last backup" timestamp within the past 25 hours.

If the last backup is >25 hours old: stop and investigate before running the drill.

---

## Step 1: Identify the Restore Point

**Option A — Latest daily snapshot:**  
Dashboard → Production project → Settings → Backups → select most recent entry.

**Option B — PITR to a specific moment (Pro+):**  
Dashboard → Production project → Settings → Point in Time Recovery → enter target timestamp (UTC).

Record the chosen restore timestamp before proceeding. You will need it for the drill log.

---

## Step 2: Restore to Staging

> **Safety:** All commands below target the **staging** database. Verify the connection string host before running any restore command.

### Via dashboard download + `pg_restore`

```bash
# 1. Download the backup from the production project dashboard
#    Dashboard → Settings → Backups → Download
#    File: backup_<timestamp>.dump  (pg_dump custom format)

# 2. Get the staging connection string
#    Dashboard → Staging project → Settings → Database → Connection string (URI)
STAGING_DB_URL="postgresql://postgres:<staging-password>@<staging-host>:5432/postgres"

# 3. Restore (--clean drops existing objects before recreating)
pg_restore \
  --verbose \
  --clean \
  --no-acl \
  --no-owner \
  --schema=public \
  -d "$STAGING_DB_URL" \
  backup_<timestamp>.dump

# Expected: verbose output of restored tables, no ERROR lines
```

### Via Supabase CLI (Team/Enterprise)

```bash
supabase login
supabase db backup list --project-ref <PROD_PROJECT_REF>
supabase db restore --project-ref <STAGING_PROJECT_REF> --backup-id <backup-id>
```

---

## Step 3: Apply Schema Migrations

The schema is idempotent — all DDL uses `IF NOT EXISTS` / `IF EXISTS`. Apply it to catch any drift between the backup and the current codebase:

```bash
# Option A: Dashboard SQL editor
# Staging Dashboard → SQL Editor → paste full contents of supabase/schema.sql → Run

# Option B: CLI
supabase db push --project-ref <STAGING_PROJECT_REF>
```

**Expected:** All statements complete. Warnings about existing objects are normal.  
**Stop if:** Any `ERROR:` line appears that is not a known pre-existing condition.

---

## Step 4: Migration Verification (read-only queries)

Run in the staging Supabase SQL editor — read-only, no production access needed:

```sql
-- 1. Row counts — should be non-zero if production has data
SELECT
  'profiles'                    AS tbl, count(*) AS rows FROM profiles UNION ALL
  SELECT 'clients',             count(*) FROM clients UNION ALL
  SELECT 'memories',            count(*) FROM memories UNION ALL
  SELECT 'conversations',       count(*) FROM conversations UNION ALL
  SELECT 'messages',            count(*) FROM messages UNION ALL
  SELECT 'usage_windows',       count(*) FROM usage_windows UNION ALL
  SELECT 'client_integrations', count(*) FROM client_integrations
ORDER BY tbl;

-- 2. Encrypted field format check
--    Values should be base64-encoded ciphertext, not readable plaintext
SELECT id, length(access_token) AS token_len, left(access_token, 6) AS prefix
FROM client_integrations
WHERE access_token IS NOT NULL
LIMIT 5;
-- Pass: prefix looks like base64 (A-Z, a-z, 0-9, +, /)
-- Fail: prefix looks like "Bearer" or "ya29." (plaintext leaked)

-- 3. RLS enabled on all public tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected: 0 rows

-- 4. Migration ledger exists (created by schema.sql)
SELECT count(*) AS ledger_rows FROM legacy_chat_migration_ledger;

-- 5. Backup freshness
SELECT max(window_start) AS latest_usage_window FROM usage_windows;
-- Should be within 24h of the backup timestamp
```

### Verification pass criteria

| Check            | Pass                                                             |
| ---------------- | ---------------------------------------------------------------- |
| Row counts       | Core tables non-empty (or match expected zero for empty staging) |
| Encrypted prefix | Looks like base64, not plaintext credential                      |
| RLS check        | 0 rows returned                                                  |
| Ledger table     | Query executes without error                                     |
| Latest window    | Within 24 h of the backup timestamp                              |

---

## Step 5: Application Smoke Tests

Staging Vercel deployment should already point at the staging Supabase project. If you restored prod data to staging, also set `EMMA_ENCRYPTION_KEY` on staging to match the key used to encrypt that data.

```bash
STAGING_URL="https://staging-emma.vercel.app"

# 1. Server health — should not be 503
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/emma/settings")
echo "Health: $STATUS"
# Pass: 200 (authenticated) or 401 (unauthenticated)
# Fail: 503 (server config error) — check EMMA_ENCRYPTION_KEY and Supabase URL on staging

# 2. Memory endpoint reachable
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/emma/memory")
echo "Memory: $STATUS"
# Pass: 401 (auth required) — confirms DB connection works

# 3. Manual login check (browser)
# Open $STAGING_URL in a browser
# → Log in with a staging test account
# → Navigate to /app → confirm UI loads
# → Open Settings → confirm user settings render without error

# 4. Encryption round-trip (if integration tokens exist in the restored data)
# → Settings → Integrations → attempt to connect/disconnect an OAuth service
# → If decryption error appears: EMMA_ENCRYPTION_KEY on staging does not match
#   the key used to encrypt the backup's data
```

### Smoke test pass criteria

| Test            | Pass                                |
| --------------- | ----------------------------------- |
| Health check    | Returns 200 or 401, never 503       |
| Memory endpoint | Returns 401, never 500/503          |
| Login           | Completes, /app loads               |
| Encryption      | No decryption errors in settings UI |

---

## Step 6: Rollback Decision Points

Abort the drill and escalate when:

| Condition                          | Action                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Last backup >25 h old              | Investigate backup failure before drill                                                                                |
| `pg_restore` exits non-zero        | Check error output; try earlier backup                                                                                 |
| Schema migration produces `ERROR:` | Investigate schema drift; do not proceed                                                                               |
| RLS check returns >0 rows          | Data isolation broken; investigate before any smoke test                                                               |
| Health check returns 503           | Env var misconfiguration; fix `EMMA_ENCRYPTION_KEY` / Supabase URL on staging                                          |
| Decryption errors in UI            | Key mismatch — update staging env var; do NOT use the prod key in staging unless this is an intentional prod data test |
| Row count drop >20% vs expected    | Backup may be partial; restore from earlier backup                                                                     |

---

## Step 7: Drill Log

Record the outcome in your team's runbook or incident tracker:

```
Date:             YYYY-MM-DD
Engineer:         <name>
Backup timestamp: <UTC timestamp used>
Restore duration: <minutes>
Schema migration: PASS / FAIL / SKIP
Verification:     PASS / FAIL (note which query failed)
Smoke tests:      PASS / FAIL (note which test failed)
Issues found:     <none or description>
Follow-up items:  <none or ticket links>
```

---

## Related

- [Runbook: Encryption Key Escrow](runbook-encryption-key-escrow.md)
- [Runbook: Incident Response](runbook-incident-response.md)
- [Checklist: Production Readiness](checklist-production-readiness.md)
- [Explanation: Security](explanation-security.md) — field encryption details
- [DEPLOY.md](../DEPLOY.md) — Vercel rollback and environment setup
