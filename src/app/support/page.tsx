import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Support | Emma",
  description: "How to report bugs, billing issues, and account problems during Emma beta.",
};

const sections: PublicInfoSection[] = [
  {
    title: "Contact method",
    body:
      "No dedicated support email is configured yet in the application. Add a SUPPORT_EMAIL or NEXT_PUBLIC_SUPPORT_EMAIL configuration before public launch, then replace this placeholder with the approved contact address. Do not use EMAIL_FROM as a customer support inbox unless that mailbox is actively monitored.",
  },
  {
    title: "Bug reports",
    body: "Include enough detail for the team to reproduce the issue.",
    items: [
      "What you expected to happen and what happened instead.",
      "The route or feature you were using, such as chat, billing, memory, integrations, voice, vision, or tasks.",
      "Approximate time, browser, operating system, screenshots, and console errors if available.",
      "Whether the issue affects one message, one integration, or the whole account.",
    ],
  },
  {
    title: "Billing support",
    body:
      "For subscription issues, include the plan, Lemon checkout or customer-portal context, payment status shown in Settings > Billing, and whether the issue is upgrade, cancellation, payment recovery, or Extra Response Pack related.",
  },
  {
    title: "Account issues",
    body:
      "For login, waitlist, export, or deletion issues, include your account email and the exact action you attempted. Emma's current deletion endpoint removes directly user-owned app data but preserves the Supabase auth login until support or an admin completes full credential deletion.",
  },
  {
    title: "Response expectations",
    body:
      "No public response-time promise or priority-support SLA is implemented yet. Beta support should be treated as best-effort until an approved support policy and staffed inbox are configured.",
  },
];

export default function SupportPage() {
  return (
    <PublicInfoPage
      eyebrow="Support"
      title="Support"
      intro="Use this page as the current customer-facing support policy for the closed beta. It intentionally flags the missing support inbox instead of inventing an address."
      sections={sections}
    />
  );
}
