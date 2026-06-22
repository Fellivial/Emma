export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type EnvironmentIssueReason = "missing" | "placeholder" | "invalid_url" | "invalid_format";

export interface EnvironmentValidationIssue {
  variable: string;
  reason: EnvironmentIssueReason;
}

export interface EnvironmentValidationResult {
  valid: boolean;
  issues: EnvironmentValidationIssue[];
}

export const PRODUCTION_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENROUTER_API_KEY",
  "EMMA_ENCRYPTION_KEY",
  "CRON_SECRET",
  "EMMA_UNSUBSCRIBE_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "INNGEST_SIGNING_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
] as const;

export const SUPABASE_AUTH_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const URL_ENV = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "UPSTASH_REDIS_REST_URL",
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
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isObviousPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDERS.some((placeholder) => {
    if (normalized === placeholder) return true;
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(placeholder)}([^a-z0-9]|$)`);
    return pattern.test(normalized);
  });
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validateEnvironment(
  env: EnvironmentSource,
  requiredVariables: readonly string[]
): EnvironmentValidationResult {
  const issues: EnvironmentValidationIssue[] = [];

  for (const variable of requiredVariables) {
    const value = env[variable]?.trim();
    if (!value) {
      issues.push({ variable, reason: "missing" });
      continue;
    }
    if (isObviousPlaceholder(value)) {
      issues.push({ variable, reason: "placeholder" });
      continue;
    }
    if (URL_ENV.has(variable) && !isValidHttpUrl(value)) {
      issues.push({ variable, reason: "invalid_url" });
      continue;
    }
    if (variable === "EMMA_ENCRYPTION_KEY" && !/^[0-9a-fA-F]{64}$/.test(value)) {
      issues.push({ variable, reason: "invalid_format" });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateProductionEnvironment(
  env: EnvironmentSource = process.env
): EnvironmentValidationResult {
  if (env.NODE_ENV !== "production") return { valid: true, issues: [] };
  return validateEnvironment(env, PRODUCTION_REQUIRED_ENV);
}

export function validateSupabaseAuthEnvironment(
  env: EnvironmentSource = process.env
): EnvironmentValidationResult {
  if (env.NODE_ENV !== "production") return { valid: true, issues: [] };
  return validateEnvironment(env, SUPABASE_AUTH_ENV);
}
