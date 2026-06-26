import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Terms of Service | Emma",
  description: "Customer-facing beta terms for acceptable use, subscriptions, billing, and AI limits.",
};

const sections: PublicInfoSection[] = [
  {
    title: "Beta service",
    body:
      "Emma is a beta AI companion and workspace agent. Features can change, break, be limited by configuration, or be unavailable while the product is prepared for launch. The service should not be treated as a professional, medical, legal, financial, emergency, or safety-critical system.",
  },
  {
    title: "Acceptable use",
    body:
      "Do not use Emma to harm people or systems, violate law, bypass security, spam, infringe rights, extract secrets, generate illegal content, or automate high-risk actions without human review. Agent actions that contact others, change external systems, or use connected tools remain your responsibility.",
  },
  {
    title: "Subscriptions and billing",
    body:
      "Paid subscriptions are handled through LemonSqueezy. Starter and Pro checkout can be created when the corresponding Lemon variant IDs are configured. Plan updates are applied after Lemon webhooks confirm the subscription event.",
  },
  {
    title: "Cancellation",
    body:
      "When Lemon reports a subscription as cancelled, Emma stores that status and keeps the paid plan usable until the current period ends. When Lemon reports the subscription as expired, Emma downgrades the account to Free limits.",
  },
  {
    title: "Refunds",
    body:
      "Emma does not implement an automatic refund workflow in this codebase and does not promise refund eligibility. Refund requests must be handled manually through the billing/support process and LemonSqueezy where applicable.",
  },
  {
    title: "AI limitations",
    body:
      "Emma can be wrong, incomplete, delayed, or inconsistent. AI outputs may contain mistakes and should be reviewed before relying on them. Connected tools, memory, files, and integrations can affect outputs and may expose stale or partial context.",
  },
  {
    title: "Usage limits",
    body:
      "Plans include token, message, and autonomous-action limits. At 80% of a configured window Emma can warn you; at 100% she can block additional usage and offer an Extra Response Pack. Enterprise behavior is configuration-based and should not be treated as a public SLA.",
  },
  {
    title: "Liability disclaimer",
    body:
      "Emma is provided as a beta product without uptime, support response, accuracy, or business-outcome guarantees in the current implementation. To the maximum extent allowed by law, use of the service is at your own risk.",
  },
  {
    title: "Legal review",
    body:
      "These terms are launch-preparation copy and should be reviewed by qualified counsel before public launch. They are not a substitute for jurisdiction-specific legal advice.",
  },
];

export default function TermsPage() {
  return (
    <PublicInfoPage
      eyebrow="Terms of Service"
      title="Terms"
      intro="These beta terms summarize the behavior currently implemented in Emma and avoid unsupported refund, uptime, SLA, or compliance promises."
      sections={sections}
    />
  );
}
