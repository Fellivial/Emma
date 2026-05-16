import type {
  NavLink,
  ProblemCard,
  Capability,
  StatItem,
  TerminalLine,
  PricingPlan,
  FAQ,
  ApproachStep,
  PanelData,
  FeatureStrip,
} from "@/lib/types/landing";

export const NAV_LINKS: NavLink[] = [
  { label: "Capabilities", href: "#capabilities" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const TICKER_ITEMS: string[] = [
  "Live2D Avatar",
  "Voice Communication",
  "Visual Perception",
  "Persistent Memory",
  "Autonomous Agent Loop",
  "Proactive Intelligence",
  "Emotion Detection",
  "Multi-user Profiles",
  "Web Speech TTS",
  "ElevenLabs BYOK",
];

export const PROBLEM_CARDS: ProblemCard[] = [
  {
    tag: "Avatar Systems",
    num: "001",
    title: "They give you a face. Not a presence.",
    body: "Static visuals with no emotional range. They look alive. They aren't.",
  },
  {
    tag: "Voice Agents",
    num: "002",
    title: "They respond. They don't initiate.",
    body: "Reactive by design. They answer when spoken to and vanish when you don't.",
  },
  {
    tag: "Smart Home AI",
    num: "003",
    title: "They automate. They don't understand.",
    body: "Rules and triggers. No memory of your patterns, moods, or context.",
  },
  {
    tag: "Cloud Assistants",
    num: "004",
    title: "They reset every session. You don't.",
    body: "Every conversation is the first conversation. Your history evaporates.",
  },
];

export const CAPABILITIES: Capability[] = [
  {
    num: "01",
    title: "Sees your world",
    body: "Webcam via Claude Vision. Reads space, expression, mood.",
  },
  {
    num: "02",
    title: "Remembers everything",
    body: "Server-side JSON, context summarization, sliding window.",
  },
  {
    num: "03",
    title: "Feels before responding",
    body: "Three-signal emotion fusion: voice, vision, text.",
  },
  {
    num: "04",
    title: "Acts without being asked",
    body: "ReAct-style agent loop. Reasons through multi-step tasks, executes registered tools, pauses for approval on dangerous actions.",
  },
  {
    num: "05",
    title: "Moves first",
    body: "Scheduler-driven autonomy tiers. Proactive, not reactive.",
  },
  {
    num: "06",
    title: "Speaks with character",
    body: "ElevenLabs BYOK on any plan. Live2D lip sync. 10 expressions.",
  },
];

export const STATS: StatItem[] = [
  { label: "Latency", value: "<200ms", sub: "Local inference, no round-trip" },
  { label: "Memory", value: "∞", sub: "Persistent, server-side" },
  { label: "Cost/Token", value: "$0", sub: "Free tier, always available" },
  { label: "Pillars", value: "5", sub: "Integrated into one system", numeric: 5 },
];

export const TERMINAL_LINES: TerminalLine[] = [
  { text: "> Loading Live2D model (10 expressions)...    OK" },
  { text: "> Initializing Web Speech TTS...              OK" },
  { text: "> Connecting webcam · Claude Vision...        OK" },
  { text: "> Loading persistent memory · 847 entries" },
  { text: "> Agent loop initialized · 8 tools registered" },
  { text: "> Emotion engine online · 3-signal fusion" },
  { text: "" },
  { text: "✓ Ready. Persona: Flirty Teasing Mommy" },
  { text: "Network: ON · Telemetry: OFF · Memory: LOCAL" },
];

export const TERMINAL_FOOTER = "EMOTION ENGINE · PLAYFUL · L5 CORE · 91 FILES LOADED";

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    period: "300K tokens/mo · Forever",
    features: ["Chat interface", "Web Speech TTS", "Basic Live2D avatar"],
    cta: "Get Started",
    ctaHref: "/register",
  },
  {
    name: "Starter",
    price: "$29/mo",
    period: "1M tokens/month",
    features: [
      "Chat + Persistent Memory",
      "Vision + Emotion Detection",
      "Routines & Schedules",
      "Autonomous agent (3 actions/hr)",
      "Webhook triggers",
      "Web Speech TTS",
    ],
    cta: "Subscribe",
    ctaHref: "/register?plan=starter",
  },
  {
    name: "Pro",
    price: "$79/mo",
    period: "2M tokens/month",
    features: [
      "Everything in Starter",
      "Autonomous agent (50 actions/hr)",
      "API access + custom integrations",
      "Custom persona configuration",
      "Multi-user profiles (up to 5)",
      "BYOK ElevenLabs TTS (any plan)",
    ],
    cta: "Subscribe",
    ctaHref: "/register?plan=pro",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Contact",
    period: "Unlimited · SLA",
    features: [
      "Everything in Pro",
      "Unlimited autonomous actions",
      "White-label deployment",
      "99.9% SLA + dedicated support",
    ],
    cta: "Contact Us",
    ctaHref: "/contact",
  },
];

export const FAQS: FAQ[] = [
  {
    n: "01",
    question: "What is Emma?",
    answer:
      "Emma is a vertically-integrated AI companion system. Unlike point solutions that do one thing — avatar, voice, assistant — Emma integrates Live2D presence, ElevenLabs voice, Claude Vision, persistent memory, emotion detection, and an autonomous agent loop into a single coherent system.",
  },
  {
    n: "02",
    question: "What AI models does Emma use?",
    answer:
      "Emma uses Anthropic's Claude models for reasoning, conversation, and vision tasks. Voice synthesis is handled by ElevenLabs (BYOK) or Web Speech API. Emotion detection blends three signal sources: voice tone, facial expression via Claude Vision, and text sentiment.",
  },
  {
    n: "03",
    question: "Does Emma require cloud services?",
    answer:
      "Emma's core runs without a persistent cloud connection. Memory is stored server-side in your deployment. For Claude Vision and ElevenLabs features, those respective APIs are called when needed. The system is designed to degrade gracefully — not go dark — when connectivity is limited.",
  },
  {
    n: "04",
    question: "Can Emma integrate with external tools?",
    answer:
      "Emma has a built-in agent loop with 8 registered tools including web search, email (Gmail BYOK), calendar (Google Calendar BYOK), and Google Drive file access. Dangerous actions require explicit approval.",
  },
  {
    n: "05",
    question: "Is Emma customizable per deployment?",
    answer:
      "Yes. Persona, communication style, autonomy tier, voice, and memory context are all configurable. Pro plan enables full persona configuration and multi-user profiles. Enterprise supports white-label deployment with custom Live2D models.",
  },
  {
    n: "06",
    question: "When is the SaaS tier launching?",
    answer:
      "Full SaaS is live now. Starter and Pro are available immediately. Enterprise is contact-based for custom deployment requirements.",
  },
  {
    n: "07",
    question: "Will Emma collect my data?",
    answer:
      "Emma's memory is stored in your deployment environment. Conversations are not used to train models. Telemetry is off by default. You control what persists and what's deleted.",
  },
  {
    n: "08",
    question: "How is Emma priced long-term?",
    answer:
      "The Free tier is permanent — not a trial. Paid plans scale with token usage and autonomy limits. There are no per-seat fees on Starter. Pro introduces multi-user support. Enterprise pricing is based on deployment scope.",
  },
];

export const APPROACH_STEPS: ApproachStep[] = [
  {
    label: "Step 01",
    title: "A brain trained for presence, not just response.",
    panelKey: "coverage",
  },
  {
    label: "Step 02",
    title: "Full perception — vision, voice, and environment.",
    panelKey: "latency",
  },
  {
    label: "Step 03",
    title: "Memory that compounds. Context that survives sessions.",
    panelKey: "memory",
  },
];

export const APPROACH_PANELS: Record<"coverage" | "latency" | "memory", PanelData> = {
  coverage: {
    title: "Pillar Coverage",
    bars: [
      { label: "Emma", pct: 100, isEmma: true, display: "5 / 5 pillars" },
      { label: "D-ID / HeyGen", pct: 20, display: "~1 / 5 pillars" },
      { label: "Lindy", pct: 25, display: "~1 / 5 pillars" },
    ],
  },
  latency: {
    title: "Response Latency",
    bars: [
      { label: "Emma", pct: 17, isEmma: true, display: "<200ms" },
      { label: "Cloud APIs", pct: 100, display: "400 – 1200ms" },
    ],
  },
  memory: {
    title: "Memory Persistence",
    bars: [
      { label: "Emma", pct: 100, isEmma: true, display: "Persistent · 847 entries" },
      { label: "Session-based", pct: 0, display: "Resets to 0" },
      { label: "Cloud (120-day)", pct: 55, display: "Expires after 120 days" },
    ],
  },
};

export const FEATURE_STRIP: FeatureStrip[] = [
  {
    tag: "Offline-capable",
    title: "Work uninterrupted.",
    body: "Core runs without a live connection.",
  },
  {
    tag: "Privacy",
    title: "Sever the cloud.",
    body: "Voice, face, and data stay on your machine.",
  },
  {
    tag: "Latency",
    title: "Stop waiting.",
    body: "Local inference, millisecond response.",
  },
];
