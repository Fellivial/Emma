import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Billing FAQ | Emma",
  description: "Plans, trials, upgrades, cancellations, refunds, token packs, and payment failures.",
};

const sections: PublicInfoSection[] = [
  {
    title: "Plans",
    body:
      "Emma currently defines Free, Starter, Pro, and Enterprise plan configurations. Free includes chat and browser speech with limited messages. Starter adds persistent memory, vision, emotion detection, routines, scheduled tasks, webhooks, and limited autonomous actions. Pro adds higher limits, custom persona, API access, multi-user support, ElevenLabs TTS, and priority-support flags. Enterprise is contact/configuration based.",
  },
  {
    title: "Trials",
    body:
      "Emma can display LemonSqueezy trial status when Lemon sends on_trial billing metadata. The repository does not define a separate in-app trial checkout flow or public trial guarantee.",
  },
  {
    title: "Upgrades",
    body:
      "Starter and Pro upgrades use LemonSqueezy checkout when the relevant variant IDs are configured. Emma applies the new plan after Lemon sends a subscription_created, subscription_updated, or subscription_resumed webhook for an active or trialing subscription.",
  },
  {
    title: "Downgrades",
    body:
      "The app does not implement an in-app downgrade selector. Subscription changes are handled through Lemon's customer portal when a portal URL is available, or through manual support while the support channel is being configured.",
  },
  {
    title: "Cancellations",
    body:
      "When Lemon reports a subscription as cancelled, Emma keeps the current paid access until the subscription expires. When Lemon reports expired, Emma moves the account to Free limits.",
  },
  {
    title: "Refunds",
    body:
      "No automated refund feature or refund promise exists in the current implementation. Refund requests must be reviewed manually through billing/support and LemonSqueezy where applicable.",
  },
  {
    title: "Token packs",
    body:
      "The Extra Response Pack is a one-time $9 purchase that grants 500,000 extra tokens. Packs are stored with a 30-day validity window and are deducted by usage metering while available.",
  },
  {
    title: "Payment failures",
    body:
      "When Lemon reports payment_failed, past_due, or unpaid status, Emma marks payment recovery as needed. The webhook reduces the daily message limit to the Free limit until Lemon reports payment recovery, then restores the matching plan limits.",
  },
];

export default function BillingFaqPage() {
  return (
    <PublicInfoPage
      eyebrow="Billing FAQ"
      title="Billing FAQ"
      intro="Billing behavior is tied to LemonSqueezy checkout, webhook confirmation, plan limits, and Extra Response Pack accounting."
      sections={sections}
    />
  );
}
