# Checklist: Production Readiness (H3 — Backup & Recovery)

**Audience:** Project owner, SRE, release engineer
**When to use:** Before the first production launch, and after any major infrastructure change.
**Pass bar:** Every item marked before traffic is sent to production.

---

## 1. Database Backups

- [ ] Supabase project is on **Pro plan or higher** (Free plan has no automated backups or PITR)
- [ ] Dashboard → Settings → Backups shows "Enabled" with a "Last backup" timestamp within the past 25 hours
- [ ] Point-in-Time Recovery (PITR) is enabled (Dashboard → Settings → Point in Time Recovery)
- [ ] PITR retention window confirmed (7 days Pro, 14 days Team)
- [ ] A restore drill has been completed successfully within the last 90 days — see [Runbook: Restore Drill](runbook-restore-drill.md)
- [ ] Restore drill log entry exists with date, engineer name, and PASS result

## 2. Encryption Key Escrow

- [ ] `EMMA_ENCRYPTION_KEY` is exactly 64 hexadecimal characters: `echo -n "$KEY" | wc -c` returns `64`
- [ ] `EMMA_ENCRYPTION_KEY` is stored in **at least two** approved escrow locations — see [Runbook: Encryption Key Escrow](runbook-encryption-key-escrow.md)
- [ ] At least **two people** can independently retrieve the key from escrow
- [ ] `EMMA_UNSUBSCRIBE_SECRET` is also in escrow (separate value from `EMMA_ENCRYPTION_KEY`)
- [ ] Staging uses a **different** key from production
- [ ] Annual escrow verification performed or scheduled within 30 days of first deploy
- [ ] Key rotation procedure read and understood by at least one team member

## 3. Environment Variables

All required env vars set in Vercel for the **Production** environment:

- [ ] `OPENROUTER_API_KEY`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — valid `https://` URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `EMMA_ENCRYPTION_KEY` — 64-hex chars
- [ ] `EMMA_UNSUBSCRIBE_SECRET` — 64-hex chars
- [ ] `CRON_SECRET`
- [ ] `NEXT_PUBLIC_APP_URL` — valid `https://` URL
- [ ] No env var appears in git history, CI logs, or error responses
- [ ] Staging env vars are **different** values from production (Supabase credentials, encryption keys)
- [ ] `ENABLE_MCP_TOOLS` is **not** set to `true` in production

## 4. Service Role Key Security

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set only in Vercel — not in `.env` files, CI logs, or any repository
- [ ] Confirmed absent from git history: `git grep "service_role" $(git rev-list --all)` returns no matches
- [ ] GitHub secret scanning enabled (Repository → Settings → Security → Secret scanning)
- [ ] Only server-side code (`getSupabaseAdmin()`) uses the service role key — never sent to the browser

## 5. Schema & Migrations

- [ ] `supabase/schema.sql` applied to production without `ERROR:` lines
- [ ] RLS enabled on all tables:
  ```sql
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false;
  -- Expected: 0 rows
  ```
- [ ] All expected tables exist (verify against schema.sql CREATE TABLE list)
- [ ] Schema also applied to staging (staging mirrors production schema)
- [ ] No invalid constraints: `SELECT conname FROM pg_constraint WHERE NOT convalidated;` returns 0 rows

## 6. Incident Response Readiness

- [ ] [Runbook: Incident Response](runbook-incident-response.md) read by at least one team member
- [ ] Supabase support contact bookmarked; account has support tier with access
- [ ] At least one team member has Supabase dashboard access to production
- [ ] At least one team member has Vercel dashboard access and can run `vercel promote`
- [ ] Escalation contacts documented (see incident response runbook)

## 7. Monitoring & Alerting

- [ ] Vercel log streaming configured, or Sentry connected
- [ ] Supabase Dashboard → Logs accessible for API, Auth, and Database logs
- [ ] Health check confirmed: `curl https://yourdomain.com/api/emma/settings` returns `401` (not `503`)
- [ ] Alerts configured for 5xx error rate spikes

## 8. Non-Destructive Validation

- [ ] `npx tsx scripts/validate-backup-health.ts` runs against staging and prints `PASS`
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm test` passes — all tests green
- [ ] `npm run build` completes without TypeScript errors

## 9. RTO / RPO Targets

Document targets before launch. These are not enforced automatically — they inform the backup plan tier.

| Metric                    | Target     | Notes                                                       |
| ------------------------- | ---------- | ----------------------------------------------------------- |
| Recovery Time Objective   | < 4 hours  | Time from incident declaration to full service restoration  |
| Recovery Point Objective  | < 24 hours | Daily backups on Pro meet this; tighten with PITR if needed |
| Key Recovery Time         | < 1 hour   | Time to retrieve encryption key from escrow and redeploy    |
| Service Role Key Rotation | < 15 min   | Time from detection to new key deployed                     |

If targets are tighter than above, upgrade to Supabase Team (14-day PITR).

---

## Sign-off

| Item                        | Engineer | Date | Result |
| --------------------------- | -------- | ---- | ------ |
| Backup enabled and verified |          |      |        |
| Restore drill completed     |          |      |        |
| Encryption key escrowed     |          |      |        |
| RLS verified on all tables  |          |      |        |
| Incident runbooks reviewed  |          |      |        |
| Validation script passed    |          |      |        |

---

## Related

- [Runbook: Restore Drill](runbook-restore-drill.md)
- [Runbook: Encryption Key Escrow](runbook-encryption-key-escrow.md)
- [Runbook: Incident Response](runbook-incident-response.md)
- [Explanation: Security](explanation-security.md)
- [Reference: Environment Variables](reference-env-vars.md)
- [DEPLOY.md](../DEPLOY.md)
