# EMMA Deployment Guide

## Branch Strategy

```
main       → production (auto-deploy via CI)
dev        → staging (auto-deploy via CI)
feature/*  → PR → dev → main
hotfix/*   → PR → main (emergency)
```

## Environments

| Environment | Branch | URL | Database |
|---|---|---|---|
| Production | `main` | emma.yourdomain.com | Supabase production project |
| Staging | `dev` | staging-emma.vercel.app | Supabase staging project |
| Local | any | localhost:3000 | No Supabase (dev mode) |

## First-Time Setup

### 1. Supabase (two projects — prod + staging)

```bash
# Create two Supabase projects at supabase.com
# For each, run the schema:
# Supabase Dashboard → SQL Editor → paste supabase/schema.sql → Run

# Enable OAuth providers:
# Authentication → Providers → Google / GitHub → Enable + add credentials
```

### 2. Vercel

```bash
npm i -g vercel
vercel login
vercel link  # Link to your project

# Set environment variables in Vercel dashboard:
# Settings → Environment Variables
# Add for BOTH Production and Preview:
#   ANTHROPIC_API_KEY
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   EMMA_ENCRYPTION_KEY          (openssl rand -hex 32)
#
# Production only:
#   LEMONSQUEEZY_API_KEY
#   LEMONSQUEEZY_STORE_ID
#   LEMONSQUEEZY_WEBHOOK_SECRET
#
# Optional:
#   ELEVENLABS_API_KEY
#
# IMPORTANT: Use DIFFERENT Supabase credentials for Preview vs Production.
# This gives you a separate staging database.
```

### 3. GitHub Secrets (for CI)

```
Repository → Settings → Secrets → Actions:
  VERCEL_TOKEN        (Vercel → Settings → Tokens → Create)
  VERCEL_ORG_ID       (from .vercel/project.json after `vercel link`)
  VERCEL_PROJECT_ID   (from .vercel/project.json after `vercel link`)
```

### 4. LemonSqueezy Webhooks

```bash
# In LemonSqueezy Dashboard → Settings → Webhooks → Add endpoint:
# URL: https://emma.yourdomain.com/api/lemon/webhook
# Secret: generate a strong secret string
# Events:
#   ✓ subscription_created
#   ✓ subscription_updated
#   ✓ subscription_cancelled
#   ✓ subscription_expired
#   ✓ subscription_payment_failed
#   ✓ subscription_resumed
```

## Daily Workflow

### Ship a Feature

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# ... make changes ...

npm test              # Run tests locally
npm run build         # Verify build

git add -A
git commit -m "feat: my feature"
git push -u origin feature/my-feature

# Open PR: feature/my-feature → dev
# CI runs: test → lint → type check → build
# Merge PR → auto-deploys to staging
# Test on staging URL
# Open PR: dev → main
# Merge → auto-deploys to production
```

### Emergency Hotfix

```bash
git checkout main
git pull origin main
git checkout -b hotfix/fix-critical-bug

# ... fix ...

npm test
git commit -m "fix: critical bug"
git push -u origin hotfix/fix-critical-bug

# Open PR: hotfix/fix-critical-bug → main
# Merge → auto-deploys to production
# Then merge main → dev to keep branches in sync
```

## Manual Deploy

```bash
# Deploy to staging (preview)
vercel

# Deploy to production
vercel --prod

# View deployments
vercel ls

# View logs
vercel logs emma.yourdomain.com
```

## Rollback

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-url>

# Example:
vercel promote emma-abc123.vercel.app
```

Vercel keeps all deployments alive. Rollback is instant — it just re-points the production alias to a previous deployment. No rebuild needed.

## Monitoring

### Health Check

```bash
# Quick check — does the API respond?
curl https://emma.yourdomain.com/api/emma/settings -I
# Should return 401 (unauthorized = server is up)
```

### Error Tracking (Sentry — optional)

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
# Follow prompts, add SENTRY_DSN to Vercel env vars
```

### Logs

```bash
# Vercel runtime logs
vercel logs emma.yourdomain.com --follow

# Supabase logs
# Dashboard → Logs → API / Auth / Database
```

## Environment Variable Reference

| Variable | Required | Where |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Brain, vision, memory, emotion, summarize |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Auth, DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side DB operations |
| `EMMA_ENCRYPTION_KEY` | Yes (prod) | AES-256 field encryption |
| `RESEND_API_KEY` | For email | Intake lead notifications + invite emails |
| `EMAIL_FROM` | For email | Sender address for Resend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For integrations | Gmail + Google Calendar OAuth |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | For integrations | Notion OAuth |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | For integrations | Slack OAuth v2 |
| `GOOGLE_SHEETS_SA_KEY` | For SMB | GCP service account JSON for Sheets lead appending |
| `HUBSPOT_API_KEY` | For SMB | HubSpot private app token |
| `LEMONSQUEEZY_API_KEY` | For billing | Checkout, subscription management |
| `LEMONSQUEEZY_STORE_ID` | For billing | Checkout session creation |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | For billing | Webhook signature verification |
| `NEXT_PUBLIC_LEMON_VARIANT_STARTER` | For billing | Starter plan variant ID |
| `NEXT_PUBLIC_LEMON_VARIANT_PRO` | For billing | Pro plan variant ID |
| `NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK` | For billing | Extra Response Pack variant ID |
| `NEXT_PUBLIC_SMB_DOMAIN` | For SMB | Subdomain routing base domain |
| `EMMA_ADMIN_EMAILS` | For admin | Comma-separated emails allowed into `/admin` |
| `CRON_SECRET` | For cron | Authenticates Vercel cron calls |
| `ELEVENLABS_API_KEY` | Optional | Premium TTS (BYOK — users set their own key) |
| `EMMA_FF_*` | Optional | Feature flag overrides (see `src/core/feature-flags.ts`) |
