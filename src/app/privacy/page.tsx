import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Emma",
  description: "How Emma handles account, conversation, memory, billing, and integration data.",
};

const sections: PublicInfoSection[] = [
  {
    title: "Data we collect",
    body:
      "Emma collects the information needed to create and operate your account, including profile details, authentication identifiers, plan and usage state, messages you send, Emma responses, token/message counts, feedback, tasks, approvals, files you upload, and settings you configure.",
  },
  {
    title: "AI usage",
    body:
      "Messages, memory context, files, images, voice transcripts, and tool context may be sent to configured AI providers when needed to answer, summarize, analyze vision input, transcribe speech, detect emotion, or run the agent loop. Emma does not claim that those providers train or do not train on your data beyond the configured provider terms.",
  },
  {
    title: "Memory",
    body:
      "Paid plans can persist memories, conversations, summaries, and related metadata in Supabase. Some memory and conversation fields are encrypted at rest by Emma before storage when encryption is configured. Free accounts do not unlock persistent memory in the current plan configuration.",
  },
  {
    title: "Billing",
    body:
      "Billing uses LemonSqueezy checkout and webhooks. Emma stores plan identifiers, subscription status, renewal or end dates, payment recovery links, card brand, card last four, and extra response pack balances when Lemon sends those details. Emma does not store full card numbers.",
  },
  {
    title: "Cookies and local browser data",
    body:
      "Emma uses Supabase authentication cookies/session storage and ordinary browser capabilities needed to keep you signed in and run the app. Push notifications, speech, camera, microphone, and service-worker features may use browser permissions. No advertising-cookie behavior is implemented in this repository.",
  },
  {
    title: "Integrations",
    body:
      "If you connect integrations, Emma stores the tokens and configuration needed to use that service. Current integration surfaces include Google services, Slack, Notion, HubSpot, MCP servers, ElevenLabs, WhatsApp ingestion, inbound email ingestion, and document ingestion where configured and enabled by plan.",
  },
  {
    title: "Data retention",
    body:
      "Account, usage, billing, memory, task, integration, and document data remains stored until it is deleted through product flows, pruning jobs, account cleanup, or a data-deletion request. Extra response packs are valid for 30 days. Some operational logs and shared records may be retained where direct user ownership is not implemented.",
  },
  {
    title: "Export and delete",
    body:
      "Authenticated users can request export or deletion through Emma's GDPR endpoint. Export returns directly user-owned Emma records as JSON. Delete removes directly user-owned Emma data but preserves the Supabase auth login; full login deletion currently requires support or an admin action.",
  },
  {
    title: "Contact and legal review",
    body:
      "No dedicated support email is configured yet in the application. Use the Support page for the current placeholder/contact configuration note. This policy is launch-preparation copy and should be reviewed by qualified counsel before public launch.",
  },
];

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Privacy Policy"
      title="Privacy"
      intro="This page describes the data Emma is built to collect and process today. It avoids promises that are not represented in the current implementation."
      sections={sections}
    />
  );
}
