#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
  "EMMA_ENCRYPTION_KEY",
  "EMMA_UNSUBSCRIBE_SECRET",
  "CRON_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "INNGEST_SIGNING_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMMA_ADMIN_EMAILS",
];

const BILLING_REQUIRED = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "NEXT_PUBLIC_LEMON_VARIANT_STARTER",
  "NEXT_PUBLIC_LEMON_VARIANT_PRO",
  "NEXT_PUBLIC_LEMON_VARIANT_EXTRA_PACK",
];

const MONITORING_REQUIRED = ["SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT"];
const INNGEST_RECOMMENDED = ["INNGEST_EVENT_KEY"];
const URL_VARS = new Set([
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "UPSTASH_REDIS_REST_URL",
  "SENTRY_DSN",
]);
const PLACEHOLDERS = [
  "changeme",
  "change-me",
  "your-secret",
  "your-key",
  "placeholder",
  "dummy",
  "test",
  "example",
  "xxx",
  "todo",
  ".invalid",
];

function parseEnvFile(filePath) {
  const env = {};
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("<") && normalized.endsWith(">")) return true;
  return PLACEHOLDERS.some((placeholder) => normalized.includes(placeholder));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validateVar(env, variable, severity) {
  const value = env[variable]?.trim();
  if (!value) return { variable, severity, reason: "missing" };
  if (isPlaceholder(value)) return { variable, severity, reason: "placeholder" };
  if (URL_VARS.has(variable) && !isHttpUrl(value)) {
    return { variable, severity, reason: "invalid_url" };
  }
  if (variable === "EMMA_ENCRYPTION_KEY" && !/^[0-9a-fA-F]{64}$/.test(value)) {
    return { variable, severity, reason: "invalid_format" };
  }
  return null;
}

function printGroup(title, results) {
  console.log(`\n${title}`);
  if (results.length === 0) {
    console.log("  PASS");
    return;
  }
  for (const result of results) {
    console.log(`  ${result.severity}: ${result.variable} (${result.reason})`);
  }
}

const envFileArg = process.argv[2];
const envFile = envFileArg ? resolve(envFileArg) : resolve(".env.staging");
const fileEnv = existsSync(envFile) ? parseEnvFile(envFile) : {};
const env = { ...process.env, ...fileEnv };

console.log("Emma staging env check");
console.log(`Source: ${existsSync(envFile) ? envFile : "process.env only"}`);
console.log("Values: redacted");
console.log("Network: not used");

const requiredResults = REQUIRED.map((name) => validateVar(env, name, "ERROR")).filter(Boolean);
const billingResults = BILLING_REQUIRED.map((name) => validateVar(env, name, "ERROR")).filter(Boolean);
const monitoringResults = MONITORING_REQUIRED.map((name) =>
  validateVar(env, name, "WARN")
).filter(Boolean);
const inngestResults = INNGEST_RECOMMENDED.map((name) =>
  validateVar(env, name, "WARN")
).filter(Boolean);

printGroup("Core staging requirements", requiredResults);
printGroup("Billing sandbox requirements", billingResults);
printGroup("Monitoring requirements", monitoringResults);
printGroup("Recommended background worker requirements", inngestResults);

const errors = [...requiredResults, ...billingResults].filter((result) => result.severity === "ERROR");

if (errors.length > 0) {
  console.log(`\nFAIL: staging env is incomplete (${errors.length} blocking issue(s)).`);
  process.exit(1);
}

const warnings = [...monitoringResults, ...inngestResults];
if (warnings.length > 0) {
  console.log(`\nPASS_WITH_WARNINGS: ${warnings.length} non-blocking monitoring/background issue(s).`);
  process.exit(0);
}

console.log("\nPASS: staging env has required variable names and plausible non-placeholder values.");
