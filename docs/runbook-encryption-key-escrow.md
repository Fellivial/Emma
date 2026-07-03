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

Rotation is implemented as a **dual-key window** plus a re-encryption script:

- `decrypt()` in [src/core/security/encryption.ts](../src/core/security/encryption.ts) first tries `EMMA_ENCRYPTION_KEY`, then falls back to `EMMA_ENCRYPTION_KEY_PREVIOUS`. Writes always use `EMMA_ENCRYPTION_KEY`.
- [scripts/rotate-encryption-key.ts](../scripts/rotate-encryption-key.ts) re-encrypts every stored ciphertext from the old key to the new key. It is idempotent (safe to re-run after a partial failure), dry-run by default, verifies each re-encrypted value round-trips before writing, and never destroys a value it cannot decrypt.

Because reads fall back to the previous key during the window, there is **no maintenance gap and no data loss** even before the migration script finishes.

Encrypted columns covered by the script: `client_integrations.access_token/refresh_token`, `memories.value`, `messages.content/display`, `chat_messages.content/display`, `conversations.title/summary`, `personas.voice_id/description`.

### Pre-rotation checklist

- [ ] Escrow copy of the **current** key is accessible and verified
- [ ] Production database backup taken within the last hour (restore point)
- [ ] Rotation rehearsed on staging first (dry run + execute + smoke test)
- [ ] Rollback plan confirmed: the old key remains in escrow and as `EMMA_ENCRYPTION_KEY_PREVIOUS` until migration is verified

### Rotation procedure

```bash
# Step 1: Generate and escrow the new key immediately
NEW_KEY=$(openssl rand -hex 32)
# → Store NEW_KEY in password manager NOW before any other step

# Step 2: Open the dual-key window (no downtime, no data loss)
#   In Vercel → Environment Variables:
#     EMMA_ENCRYPTION_KEY          = <NEW_KEY>
#     EMMA_ENCRYPTION_KEY_PREVIOUS = <old key>
#   Redeploy. New writes use the new key; old ciphertext still decrypts
#   via the previous-key fallback.

# Step 3: Dry-run the re-encryption script against staging, then production
NEXT_PUBLIC_SUPABASE_URL=<url> \
SUPABASE_SERVICE_ROLE_KEY=<service-role> \
EMMA_ENCRYPTION_KEY_OLD=<old key> \
EMMA_ENCRYPTION_KEY_NEW=<NEW_KEY> \
npx tsx scripts/rotate-encryption-key.ts
# Expected: "PASS (dry run)" with zero undecryptable values

# Step 4: Execute the migration
# (same env vars) npx tsx scripts/rotate-encryption-key.ts --execute
# Expected: "PASS: all encrypted values are now on the new key."
# The script is idempotent — re-run it if it was interrupted.

# Step 5: Close the dual-key window
#   a. Re-run the script without --execute: confirm alreadyNewKey covers all rows
#   b. Remove EMMA_ENCRYPTION_KEY_PREVIOUS from Vercel → redeploy
#   c. Smoke-test: send a chat message, open a memory, connect/disconnect an OAuth integration
#   d. Retire the old key entry in escrow; mark it with the rotation date

# Step 6: Verify
curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/emma/settings
# Expected: 200 or 401 (not 503)
```

### Rotation rollback

If anything fails during the window:

1. Old ciphertext is never modified destructively — the script only writes values it has verified decrypt correctly with the new key, and it skips (and reports) anything it cannot decrypt.
2. To abort: set `EMMA_ENCRYPTION_KEY` back to the old key and keep the new key as `EMMA_ENCRYPTION_KEY_PREVIOUS`, then redeploy — both generations of ciphertext remain readable while you investigate.
3. Re-running the script with old/new swapped migrates any already-converted values back.
4. The database backup from the pre-rotation checklist remains the last-resort restore point; it should not be needed because the migration never leaves a value in an unreadable state.

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
