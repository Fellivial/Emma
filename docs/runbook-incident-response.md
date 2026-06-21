# Runbook: Incident Response

**Audience:** On-call engineer, SRE, project owner
**Purpose:** Step-by-step response for the four highest-impact database and security incidents.

Each section follows: **Detect → Contain → Recover → Verify → Post-mortem**.

---

## Incident 1: Database Corruption

### Detect

Signals of corruption:

- Supabase dashboard: replication lag alerts, disk I/O errors, backup job failed
- API routes returning 500 with Postgres error codes (`XX001`, `22P02`, `invalid page in block`)
- Vercel logs: `relation does not exist`, `tuple is too large`, `invalid page header`
- Users report data present minutes ago is now missing
- Supabase Settings → Backups shows "Last backup" timestamp older than 25 hours

```sql
-- Confirm scope (read-only, run in Supabase SQL editor)
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check for invalid constraints
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE NOT convalidated
LIMIT 20;
```

### Contain

1. **Do not restart the database** — replaying a corrupt WAL segment worsens most corruption.
2. Enable maintenance mode to stop writes:
   ```bash
   # Add an env var your middleware checks, or promote a static error page deployment
   vercel env add MAINTENANCE_MODE true --target production
   vercel deploy --prod
   ```
3. **Do not run `VACUUM FULL` or `REINDEX`** without Supabase support guidance.
4. Open a Supabase support ticket immediately — they have DBA access and WAL visibility.

### Recover

**Option A — PITR (Point-in-Time Recovery, Pro+ plans):**

```
Supabase Dashboard → Production project → Settings → Point in Time Recovery
Enter a UTC timestamp 5–10 minutes before the first corruption signal.
```

PITR creates a new database at that moment. Promote it once verified.

**Option B — Restore from daily backup:**

Follow [Runbook: Restore Drill](runbook-restore-drill.md) — restore to staging first, verify, then repeat targeting production.

**Option C — Schema rebuild (last resort, data loss):**

Only if backups are unavailable and corruption is schema-level only. Run with Supabase support present.

### Verify

After restore, run the verification queries from the restore drill (Step 4) and the smoke tests (Step 5).

### Post-mortem checklist

- [ ] Timeline: first symptom → containment → full recovery
- [ ] Root cause (Supabase infrastructure, migration bug, application bug)
- [ ] Whether PITR or backup was used and how far back
- [ ] Data loss quantified (rows affected, time window)
- [ ] Actions to prevent recurrence

---

## Incident 2: Failed Migration

A `supabase/schema.sql` run produces an error or leaves the schema partially applied.

### Detect

- SQL editor returns `ERROR:` lines (not just warnings) during a migration run
- API routes returning 500 after a deploy: `column does not exist`, `relation does not exist`, constraint violation
- New code path crashes on first request while tests passed locally

```sql
-- Check what tables actually exist vs what schema.sql defines
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Look for invalid constraints left by a partial migration
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE NOT convalidated;

-- Look for invalid indexes
SELECT i.relname AS index_name, t.relname AS table_name
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
WHERE NOT idx.indisvalid;
```

### Contain

Roll back the application immediately — do not leave a new code version running against a partial schema:

```bash
vercel ls                              # List recent deployments
vercel promote <previous-deploy-url>   # Instant; no rebuild needed
```

### Recover

The schema is **idempotent** — all statements use `IF NOT EXISTS` / `IF EXISTS`. Run it in sections to isolate the failing statement, fix it, and continue:

```bash
# In Supabase SQL editor:
# 1. Paste and run schema.sql in logical blocks (one table group at a time)
# 2. Stop at the first ERROR
# 3. Diagnose: type mismatch, missing column, constraint violation
# 4. Fix the specific statement
# 5. Re-run that block and continue
```

If a destructive statement already ran and cannot be reversed forward, restore from the last backup and re-apply the corrected migration:

1. Take note of the exact error and the timestamp it occurred
2. Restore the pre-migration database (see [Runbook: Restore Drill](runbook-restore-drill.md))
3. Fix the migration script
4. Re-apply on the restored database
5. Re-deploy application

### Verify

```sql
-- All expected tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- RLS enabled on all tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected: 0 rows

-- No invalid constraints or indexes
SELECT conname FROM pg_constraint WHERE NOT convalidated;
SELECT relname FROM pg_class JOIN pg_index ON oid = indexrelid WHERE NOT indisvalid;
```

Promote the previous application version once the schema is clean.

### Post-mortem checklist

- [ ] Which statement failed and why
- [ ] Was the migration tested on staging before production?
- [ ] Add a migration smoke-test step to CI if missing

---

## Incident 3: Lost Encryption Key {#lost-encryption-key}

`EMMA_ENCRYPTION_KEY` is missing, corrupt, or the value is unknown.

### Detect

- Vercel / application logs: `EMMA_ENCRYPTION_KEY must be a 64-character hex string` or `[encryption] key missing or invalid`
- API routes returning 503 (production fails closed on a missing key)
- User reports: OAuth integrations show "Connection failed" or "Token error"
- Server logs showing `decrypt()` throwing

### Contain

**Do not redeploy with a new, different key yet.** Setting a new key without re-encrypting makes all existing ciphertext permanently unreadable.

Search every escrow location before concluding the key is truly lost:

- [ ] Password manager (1Password, Bitwarden, etc.) — check all vaults, including shared ones
- [ ] Cloud KMS / Secrets Manager audit log — key may still be retrievable even if deleted
- [ ] GPG-encrypted file in any private repository
- [ ] Physical cold storage copy
- [ ] Vercel's environment variable audit log (some plans retain deleted values)
- [ ] `.env.local` on the machine used for the original production deploy

### Recover

**Key found in escrow:**

```bash
vercel env add EMMA_ENCRYPTION_KEY production
# Paste the recovered value when prompted — do NOT pass it as a CLI argument
vercel deploy --prod

# Verify: should return 401, not 503
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
```

**Key permanently lost — accept data loss:**

```bash
# 1. Generate and escrow a new key FIRST
NEW_KEY=$(openssl rand -hex 32)
# → Store in password manager immediately

# 2. Set in Vercel and redeploy
vercel env add EMMA_ENCRYPTION_KEY production
vercel deploy --prod

# 3. Clear irrecoverable ciphertext to prevent repeated decryption errors
--   Run in Supabase SQL editor (service-role required):
UPDATE client_integrations
SET access_token = NULL, refresh_token = NULL
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL;
--   Users will need to reconnect all OAuth integrations

# 4. Notify affected users:
#    - All OAuth integrations must be reconnected
#    - Encrypted memories are irrecoverable
#    - Encrypted conversation history is irrecoverable
```

### Compromised Encryption Key {#compromised-encryption-key}

If the key may have been exposed:

1. **Rotate immediately** — follow the [Key Rotation Plan](runbook-encryption-key-escrow.md#key-rotation-plan)
2. **Audit Supabase logs** for unusual SELECT patterns on `client_integrations`, `memories`, `messages`
3. **Assess data exposure**: OAuth token ciphertext was readable to anyone with both the DB access and the key; determine the exposure window
4. **Notify users** if OAuth tokens or personal data may have been exfiltrated
5. After rotation: have users revoke and reconnect OAuth integrations in each connected service

### Verify

```bash
# Application running and accepting the new key
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
# Expected: 401

# New encryption round-trip works
# → App: connect a test OAuth integration → confirm success
```

### Post-mortem checklist

- [ ] Why was the key not in escrow / not findable?
- [ ] Was any encrypted data exfiltrated?
- [ ] Fix escrow process and add escrow verification to production readiness checklist

---

## Incident 4: Compromised Service Role Key

`SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security. Exposure means an attacker could read or write any row in any table.

### Detect

- Key appears in a git commit, CI log, error response body, Slack message, or any non-Vercel location
- Supabase API audit log shows queries from unexpected IPs or at unexpected times
- Vercel logs show the key echoed in an error response
- Security researcher disclosure

```bash
# Scan git history locally (do not push the output)
git log --all --full-history -p -- .env* | grep -i "service.role\|SERVICE_ROLE"
git grep "service_role" $(git rev-list --all) 2>/dev/null | head -20
```

### Contain

**Regenerate the key immediately. This invalidates the old key at the moment you click confirm.**

```
Supabase Dashboard → Production project → Settings → API → Service Role Secret
Click "Regenerate" → confirm
Copy the new value
```

The application will return 500/503 until you deploy with the new key. Accept this brief downtime — it is preferable to leaving a compromised key active.

Update Vercel immediately:

```bash
vercel env rm SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Paste new key when prompted
vercel deploy --prod
```

### Recover

1. Confirm the application is healthy after rotation:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
   # Expected: 401
   ```

2. **Audit what was accessible:** With the old key, an attacker could read:
   - All rows in all tables (bypasses RLS)
   - OAuth token ciphertext — if `EMMA_ENCRYPTION_KEY` was **not** also compromised, token plaintext was protected
   - If **both** keys were compromised: all OAuth tokens must be treated as stolen → rotate integrations

3. **Audit Supabase API logs:**

   ```
   Dashboard → Logs → API
   Filter by the exposure window
   Look for: bulk SELECT on client_integrations / memories / messages, unusual IPs, high volume
   ```

4. **Remove from any public location:**

   ```bash
   # If committed to git — rewrite history and force-push
   # Coordinate with all contributors before force-pushing
   pip install git-filter-repo
   git filter-repo --path .env --invert-paths
   git push --force --all
   ```

5. **Notify affected users** if audit logs show evidence of data access during the exposure window.

6. **Add secret scanning to CI** to prevent recurrence:
   - GitHub: Settings → Security → Secret scanning → Enable
   - Or add `truffleHog` / `gitleaks` as a CI step

### Verify

```bash
# Old key rejected
curl -s \
  -H "apikey: <OLD_KEY>" \
  -H "Authorization: Bearer <OLD_KEY>" \
  "https://<project-ref>.supabase.co/rest/v1/profiles?select=id&limit=1"
# Expected: 401

# Application healthy with new key
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
# Expected: 401
```

### Post-mortem checklist

- [ ] How was the key exposed? Where exactly was it found?
- [ ] Was `EMMA_ENCRYPTION_KEY` also exposed? If so, initiate rotation.
- [ ] What data was accessible, for how long?
- [ ] Secret scanning added to CI?
- [ ] Vercel env vars confirmed not echoed in build logs?

---

## Escalation Contacts

| Situation                     | Contact                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| Supabase infrastructure issue | Supabase support dashboard + status.supabase.com           |
| Confirmed data breach         | Project owner + legal counsel + affected-user notification |
| OAuth token exposure — Google | myaccount.google.com/permissions — revoke Emma             |
| OAuth token exposure — Slack  | api.slack.com/apps — revoke Emma                           |
| OAuth token exposure — Notion | notion.so/my-integrations — revoke Emma                    |
| Vercel deployment issue       | vercel.com/support + vercel-status.com                     |

---

## Related

- [Runbook: Restore Drill](runbook-restore-drill.md)
- [Runbook: Encryption Key Escrow](runbook-encryption-key-escrow.md)
- [Checklist: Production Readiness](checklist-production-readiness.md)
- [Explanation: Security](explanation-security.md)
- [DEPLOY.md](../DEPLOY.md)
