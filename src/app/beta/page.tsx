import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Beta Welcome | Emma",
  description: "How to use Emma during the closed beta and what to expect.",
};

const sections: PublicInfoSection[] = [
  {
    title: "How Emma works",
    body:
      "Emma combines streaming chat, persona prompting, memory retrieval, Live2D presentation, speech features, vision analysis, usage metering, routines, and an approval-gated agent loop. Available features depend on your plan, browser permissions, and configured provider keys.",
  },
  {
    title: "Current limitations",
    body:
      "This beta is still being hardened. Memory, vision, voice, integrations, billing, and autonomous workflows can fail or be unavailable if provider keys, browser APIs, Supabase, LemonSqueezy, cron jobs, or third-party services are not configured.",
  },
  {
    title: "Known issues",
    body:
      "Known launch-prep risks include provider downtime, incomplete support operations, manual account-deletion steps for auth credentials, third-party payment recovery dependencies, and beta documentation that still needs final legal review.",
  },
  {
    title: "Expected downtime",
    body:
      "No public uptime promise is implemented. During beta, deployments, migrations, provider outages, and configuration changes may cause downtime or degraded features. Treat Emma as an active beta, not a guaranteed production service.",
  },
  {
    title: "Feedback process",
    body:
      "Use the in-app feedback endpoint where available or include the route, time, account email, browser, screenshots, and reproduction steps in a support request. For AI quality reports, include the prompt and the unexpected output when safe to share.",
  },
  {
    title: "Support channels",
    body:
      "No dedicated support email is configured yet. Until a support address is added, use the Support page's configuration note as the source of truth for beta contact handling.",
  },
];

export default function BetaPage() {
  return (
    <PublicInfoPage
      eyebrow="Closed Beta"
      title="Beta Welcome"
      intro="Emma is open for controlled beta use while launch operations, support paths, and final legal copy are being completed."
      sections={sections}
    />
  );
}
