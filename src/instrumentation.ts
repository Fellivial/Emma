/**
 * Next.js instrumentation hook — runs once at server startup.
 * Validates required production environment variables before any request is served.
 * Only enforced in production (NODE_ENV=production); no-op in dev and test.
 */
export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  const { validateProductionEnvironment } = await import("@/core/env-validation");
  const result = validateProductionEnvironment();

  if (!result.valid) {
    const missing = result.issues.map((i) => `${i.variable} (${i.reason})`).join(", ");
    throw new Error(
      `[Emma] Production startup failed — missing or invalid environment variables: ${missing}`
    );
  }
}
