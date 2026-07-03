import type { Metadata } from "next";
import PublicInfoPage, { type PublicInfoSection } from "@/components/landing/PublicInfoPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Emma",
  description:
    "What data Emma collects, which third-party processors handle it, how it is encrypted, and how to export or delete it.",
};

const sections: PublicInfoSection[] = [
  {
    title: "Scope",
    body: "This policy describes what data Emma collects, how it is used, which third-party services process it, and the controls you have. Emma is currently in closed beta. Last updated: July 3, 2026.",
  },
  {
    title: "Data we collect",
    body: "Emma stores the data needed to provide a persistent AI companion:",
    items: [
      "Account data: your email address and authentication records (managed by Supabase Auth), plus profile settings such as your name and preferences.",
      "Conversations: your messages and Emma's replies, including conversation titles and summaries.",
      "Memories: facts Emma extracts from your conversations to personalize future replies (for example preferences, goals, and habits).",
      "Uploaded documents and images: file content, extracted text, and search embeddings when you upload files for Emma to read.",
      "Screen-share analysis: when you enable screen sharing, screenshots are analyzed to produce a text description used as conversation context.",
      "Voice data: microphone audio is transcribed to text when you use voice input; message text is converted to audio when you enable voice output.",
      "Integration credentials: OAuth tokens or API keys for services you choose to connect (Gmail, Google Calendar, Google Drive, Slack, Notion, HubSpot, ElevenLabs, or a custom MCP server).",
      "Inbound messages: if your workspace configures email or WhatsApp ingestion, inbound email and WhatsApp message content is stored so Emma can read it when you ask.",
      "Usage and billing records: message and token counts per usage window, plan and subscription status, and purchase records.",
      "Operational records: action logs for agent tasks, approval decisions, audit log entries, and push-notification subscriptions.",
    ],
  },
  {
    title: "How we use data",
    body: "Data is used to provide the companion experience: generating replies, remembering you across sessions, executing tasks you approve, enforcing plan limits, processing payments, and sending the notifications and emails you have enabled. Emma does not sell your data and does not use your conversations to train models.",
  },
  {
    title: "AI processing",
    body: "Emma's intelligence runs on third-party language models accessed through OpenRouter. Your conversation content, extracted document excerpts, screen-share analyses, detected emotional context, and memory summaries are sent to OpenRouter and routed to model providers to generate responses. Voice input is transcribed by OpenAI's speech-to-text service. These providers process content to return results; their handling is governed by their own data policies.",
  },
  {
    title: "Third-party processors",
    body: "Emma relies on the following services. Each receives only the data needed for its function:",
    items: [
      "Supabase — authentication and database hosting (all stored data listed above).",
      "Vercel — application hosting and request handling.",
      "OpenRouter — LLM processing for chat, vision analysis, emotion detection, and memory extraction.",
      "OpenAI — speech-to-text transcription of voice input.",
      "ElevenLabs — voice synthesis, only if you connect your own ElevenLabs API key; message text is sent to generate audio.",
      "LemonSqueezy — payment processing, subscription management, and checkout (they receive billing details; Emma never sees your card number).",
      "Resend — transactional and lifecycle email delivery to your address.",
      "Upstash — rate-limiting counters keyed by hashed identifiers (no message content).",
      "Sentry — error monitoring; error reports may include request metadata.",
      "Meta (WhatsApp Cloud API) — only if WhatsApp ingestion is configured for your workspace.",
      "Google, Slack, Notion, HubSpot — only if you connect these integrations; Emma acts on your data in those services when you ask it to.",
      "Browser push services (e.g. your browser vendor) — deliver push notifications you have enabled.",
    ],
  },
  {
    title: "Encryption",
    body: "Sensitive fields are encrypted at rest with AES-256-GCM field-level encryption on top of database disk encryption: memory values, message content, conversation titles and summaries, integration access and refresh tokens, and custom persona fields. Encryption keys are held in server configuration, never in the database, and a documented key-rotation process preserves existing data.",
  },
  {
    title: "Retention",
    body: "Your data is retained while your account is active. Stale, low-confidence memories are automatically downgraded and pruned over time. You can delete individual memories, conversations, and connected integrations at any time from the app, or delete your data in bulk as described below.",
  },
  {
    title: "Export and deletion",
    body: "Signed-in users can export or delete directly user-owned Emma data from Settings, under Data & Privacy. Two honest limitations: deletion removes directly user-owned app data but preserves the Supabase auth login record until support or an admin completes full credential deletion, and connected-integration credentials are removed by disconnecting each integration in Settings → Integrations — do this before deleting your account data. You can also revoke Emma's access directly in the connected service (for example your Google account permissions).",
  },
  {
    title: "Your rights",
    body: "Depending on your jurisdiction (including GDPR and CCPA), you may have rights to access, correct, export, delete, or restrict processing of your personal data, and to object to processing. The export and deletion tools above implement the core of these rights; for anything they don't cover, contact the team via the Support page and we will handle the request manually.",
  },
  {
    title: "Children",
    body: "Emma is not intended for children and is not knowingly offered to anyone under the age of 16. If you believe a child has created an account, contact the team via the Support page.",
  },
  {
    title: "Changes",
    body: "We will update this policy as the product changes and revise the date at the top. Material changes will be communicated in the app or by email.",
  },
  {
    title: "Legal review status",
    body: "This policy is written and maintained by the Emma team to accurately describe the current implementation. It has not yet been reviewed by qualified counsel; that review is planned before public launch, as also noted on the Known Limitations page.",
  },
];

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="Emma is built around a simple rule: your conversations, memories, and connected accounts are yours. This page describes exactly what is stored, who processes it, and how to take it with you or erase it."
      sections={sections}
    />
  );
}
