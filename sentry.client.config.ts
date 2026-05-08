import * as Sentry from "@sentry/nextjs";

// SENTRY_DSN is a server-only variable (no NEXT_PUBLIC_ prefix), so this will
// never initialize in the browser — intentional: Emma uses server-side Sentry only.
// To enable client-side error capture, rename the env var to NEXT_PUBLIC_SENTRY_DSN.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}
