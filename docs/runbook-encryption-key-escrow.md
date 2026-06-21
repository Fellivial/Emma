# Runbook: Encryption Key Escrow

**Audience:** Project owner, SRE, security lead
**Cadence:** Perform initial escrow on first production deploy; verify annually
**Purpose:** Ensure `EMMA_ENCRYPTION_KEY` and `EMMA_UNSUBSCRIBE_SECRET` can be recovered in every failure scenario without ever exposing them in a log, file, or communication channel.

---

## What These Keys Protect

| Key                       | Protects                                                                                  | Loss impact                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EMMA_ENCRYPTION_KEY`     | OAuth access/refresh tokens, memory values, conversation content and titles (AES-256-GCM) | All encrypted records become permanently unreadable. OAuth integrations break for every user. Encrypted memories and conversation history are irrecoverable.       |
| `EMMA_UNSUBSCRIBE_SECRET` | HMAC tokens embedded in unsubscribe email links                                           | Previously sent links become invalid. Existing subscribers cannot use emailed unsubscribe links. New key fixes future emails; old links remain permanently broken. |

---

## Generating Keys

**Always generate in a terminal. Never in a browser, shared script, or any file that gets committed.**

```bash
# EMMA_ENCRYPTION_KEY — must be exactly 64 hexadecimal characters (32 bytes)
openssl rand -hex 32

# EMMA_UNSUBSCRIBE_SECRET — same format, generated independently
openssl rand -hex 32
```

**Validate format before storing:**

```bash
KEY="<paste-generated-key>"
echo -n "$KEY" | wc -c                                      # Must print 64
echo -n "$KEY" | grep -P '^[0-9a-f]{64}$' && echo VALID || echo INVALID
```

Generate staging keys separately from production. They must never be the same value.

---

## Storage Requirements

Keys must be stored such that:

1. **Two people can independently recover** each key (no single-person dependency)
2. **Never stored in plaintext** in email, Slack, git, CI logs, or any text file
3. **Access is audited** — you know who retrieved the key and when
4. **Decoupled from application credentials** — losing Vercel or Supabase access must not mean losing the encryption keys

### Approved storage methods

| Method                                            | How to use                                                                                                                          | Why acceptable                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Password manager** (1Password, Bitwarden)       | Secure note titled `EMMA Production Encryption Keys`. Include both keys and generation date. Share with ≥1 other admin.             | Encrypted at rest, access-controlled, audit log available          |
| **Cloud KMS / Secrets Manager** (AWS, GCP, Vault) | Store as a named secret. Grant access to the deploy role and ≥1 human operator.                                                     | Purpose-built for secrets, fine-grained IAM, full audit trail      |
| **GPG-encrypted file in a private repo**          | `gpg --symmetric --cipher-algo AES256 keys.txt && git add keys.txt.gpg`. The GPG passphrase must itself live in a password manager. | Encrypted at rest; acceptable as a secondary backup copy           |
| **Physical cold storage**                         | Printed, sealed in a numbered envelope, stored in a locked safe with a second copy off-site.                                        | Offline; survives all cloud failures. Use as a last-resort backup. |

### Rejected storage locations

- ❌ Slack DM, channel message, or shared channel
- ❌ Email body or attachment (even "encrypted" email)
- ❌ `.env` file committed to any git repository
- ❌ Vercel build log or CI environment variable echoed in a step
- ❌ Sticky note, whiteboard, or unencrypted text file on any machine
- ❌ Unencrypted Google Doc, Notion page, or shared spreadsheet

---

## Adding Keys to Vercel

```bash
# Via dashboard (safest — value is never in shell history)
# Project → Settings → Environment Variables
# Add EMMA_ENCRYPTION_KEY and EMMA_UNSUBSCRIBE_SECRET
# Target environments: Production (and Preview/staging with their own values)

# Via CLI — use interactive prompt, NOT inline argument
vercel env add EMMA_ENCRYPTION_KEY production
# Paste value when prompted. Do NOT: vercel env add EMMA_ENCRYPTION_KEY production abc123...
```

After adding, trigger a redeployment. Confirm the key is accepted:

```bash
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
# 401 = server started correctly (auth required)
# 503 = configuration rejected — key may be malformed
```

---

## Key-Loss Impact Analysis

### Scenario A: Key lost, escrow copy exists

Recovery time: minutes. Retrieve from escrow, set in Vercel, redeploy. Zero data loss.

### Scenario B: Key lost, no escrow copy

**Immediate effects:**

- All OAuth integration tokens unreadable → integrations break for all users
- All encrypted memories, conversation content, and titles unreadable
- The application continues to serve requests (it does not crash), but decryption errors surface in OAuth and memory flows
- New records written with a new key succeed; old ciphertext is permanently inaccessible

**Recovery steps:**

1. Generate a new key. Store it in escrow immediately.
2. Set the new key in Vercel and redeploy.
3. All users must reconnect OAuth integrations (old tokens are irrecoverable).
4. Encrypted memories from before the key loss are permanently lost. Inform affected users.
5. Conduct a post-mortem on how escrow failed and fix the process.

### Scenario C: EMMA_UNSUBSCRIBE_SECRET lost

Generate a new secret. Deploy. Future unsubscribe emails work. Previously sent links are permanently broken — provide a support contact for manual unsubscribes.

### Scenario D: Key suspected compromised (not lost)

See [Runbook: Incident Response → Compromised Encryption Key](runbook-incident-response.md#compromised-encryption-key).

---

## Key Rotation Plan

**Recommended frequency:** Annually, or immediately after any suspected compromise.

> **Critical:** Rotating `EMMA_ENCRYPTION_KEY` without first re-encrypting all stored ciphertext will make all existing encrypted records unreadable. The data migration must complete before the new key is deployed.

### Pre-rotation checklist

- [ ] Escrow copy of the **current** key is accessible and verified
- [ ] Production database backup taken within the last hour (restore point)
- [ ] Maintenance window scheduled (OAuth integrations will be interrupted during the gap)
- [ ] Re-encryption script written and tested on a staging copy first
- [ ] Rollback plan confirmed: if migration fails, old key is still in Vercel and data is intact from backup

### Rotation procedure

```bash
# Step 1: Generate and escrow the new key immediately
NEW_KEY=$(openssl rand -hex 32)
# → Store NEW_KEY in password manager NOW before any other step

# Step 2: Count affected records (staging SQL editor, read-only)
SELECT count(*) FROM client_integrations WHERE access_token  IS NOT NULL;
SELECT count(*) FROM client_integrations WHERE refresh_token IS NOT NULL;
SELECT count(*) FROM memories       WHERE value   IS NOT NULL;
SELECT count(*) FROM messages       WHERE content IS NOT NULL;
SELECT count(*) FROM conversations  WHERE title   IS NOT NULL OR summary IS NOT NULL;

# Step 3: Write and test re-encryption script
# The script must (per field):
#   a. Read the current ciphertext
#   b. Decrypt with OLD key
#   c. Re-encrypt with NEW key
#   d. Verify new ciphertext decrypts correctly before writing
#   e. Write back
# Test on a staging snapshot first.

# Step 4: Run on staging. Smoke-test. Confirm zero decryption errors.

# Step 5: Production rotation
#   a. Enable maintenance mode or shed non-critical traffic
#   b. Take a final backup
#   c. Run re-encryption script against production DB
#   d. Update EMMA_ENCRYPTION_KEY in Vercel → redeploy
#   e. Smoke-test: connect/disconnect an OAuth integration
#   f. Retire the old key entry in escrow; mark it with the rotation date

# Step 6: Verify
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
# Expected: 200 or 401 (not 503)
```

### Rotation rollback

If the re-encryption migration fails partway:

1. The old key is still active in Vercel — the application still works with old ciphertext
2. Restore the database from the pre-rotation backup taken in Step 5b
3. The old key remains valid — zero data loss
4. Investigate the failure, fix the migration script, and schedule a new window

---

## Annual Escrow Verification

Once per year, confirm the escrow copy is still readable and correct:

```bash
# 1. Retrieve key from escrow
ESCROWED_KEY="<retrieved-value>"

# 2. Validate format
echo -n "$ESCROWED_KEY" | grep -P '^[0-9a-f]{64}$' && echo VALID || echo INVALID

# 3. Verify it decrypts a known ciphertext from the staging DB
#    In a local environment with EMMA_ENCRYPTION_KEY set to the escrowed value:
EMMA_ENCRYPTION_KEY="$ESCROWED_KEY" npx tsx -e "
const { decrypt } = require('./src/core/security/encryption');
const known = '<paste-a-known-ciphertext-from-staging-db>';
console.log('Decrypted:', decrypt(known));
"
# Pass: prints the expected plaintext without error
# Fail: throws — key does not match, escrow copy is wrong
```

Log the result of the verification check with a date. If the check fails, treat it as a key-loss incident immediately.

---

## Related

- [Runbook: Restore Drill](runbook-restore-drill.md)
- [Runbook: Incident Response](runbook-incident-response.md)
- [Checklist: Production Readiness](checklist-production-readiness.md)
- [Explanation: Security](explanation-security.md) — AES-256-GCM field encryption implementation
- [Reference: Environment Variables](reference-env-vars.md) — key configuration reference
