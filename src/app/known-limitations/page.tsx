import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Known Limitations | Emma",
  description: "Current beta limitations and launch-readiness caveats.",
};

const sections: PublicInfoSection[] = [
  {
    title: "AI reliability",
    body:
      "Emma can hallucinate, misunderstand context, miss tool constraints, or produce incomplete answers. Human review is required before relying on outputs for important decisions or external actions.",
  },
  {
    title: "Provider dependencies",
    body:
      "Core AI, vision, speech transcription fallback, TTS, billing, auth, database, email, push, and integration features depend on configured third-party services. Missing keys or provider downtime can disable individual features.",
  },
  {
    title: "Voice, camera, and browser support",
    body:
      "Speech, microphone, camera, service worker, and push-notification features depend on browser support and user permissions. Unsupported browsers may have reduced voice or notification behavior.",
  },
  {
    title: "Memory and deletion",
    body:
      "Memory quality is imperfect and may include stale or partial facts. The GDPR deletion endpoint removes directly user-owned app data but does not delete the Supabase auth user record automatically.",
  },
  {
    title: "Integrations",
    body:
      "Connected tools can fail when tokens expire, scopes are missing, providers change APIs, or rate limits apply. Moderate and dangerous actions require approval, but the user remains responsible for external effects.",
  },
  {
    title: "Billing operations",
    body:
      "Plan updates rely on LemonSqueezy webhooks. Customer-portal and payment-recovery links are only available when Lemon sends safe URLs. Refunds and some account changes remain manual.",
  },
  {
    title: "Support readiness",
    body:
      "A dedicated public support inbox and public response-time policy are not configured yet. Final legal copy should be reviewed by qualified counsel before public launch.",
  },
];

export default function KnownLimitationsPage() {
  return (
    <PublicInfoPage
      eyebrow="Beta Limitations"
      title="Known Limitations"
      intro="This page records honest current beta limitations so customers do not infer unsupported uptime, support, billing, or compliance promises."
      sections={sections}
    />
  );
}
