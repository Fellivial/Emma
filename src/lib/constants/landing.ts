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
    tag: "AI Assistants",
    num: "003",
    title: "They know everything. Remember nothing.",
    body: "Every conversation is the first conversation. No continuity. No compounding.",
  },
  {
    tag: "Workflow Agents",
    num: "004",
    title: "They automate tasks. Not relationships.",
    body: "Triggers and scripts. No emotional context, no persistent identity, no presence.",
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
  { label: "Tools", value: "8", sub: "In the agent loop", numeric: 8 },
  { label: "Memory", value: "∞", sub: "Persistent, server-side" },
  { label: "Cost/Token", value: "$0", sub: "Free tier, always available" },
  { label: "Pillars", value: "6", sub: "Integrated into one system", numeric: 6 },
];

export const TERMINAL_LINES: TerminalLine[] = [
  { text: "> Loading Live2D model (10 expressions)...    OK" },
  { text: "> Initializing Web Speech TTS...              OK" },
  { text: "> Connecting webcam · Claude Vision...        OK" },
  { text: "> Loading persistent memory · 847 entries" },
  { text: "> Agent loop initialized · 8 tools registered" },
  { text: "> Emotion engine online · 3-signal fusion" },
  { text: "" },
  { text: "✓ Ready. Persona: Yours." },
  { text: "Network: ON · Telemetry: OFF · Memory: ENCRYPTED" },
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
    title: "Full stack. Nothing outsourced.",
    body: "Six pillars — avatar, voice, vision, memory, emotion, and autonomous agent — designed as a single system. Not assembled from point solutions. Built together.",
    panelKey: "coverage",
  },
  {
    label: "Step 02",
    title: "Responses that stream, not wait.",
    body: "Streaming SSE delivers the first token in under a second. Responses begin before Emma has finished generating. No loading screens. Just presence.",
    panelKey: "latency",
  },
  {
    label: "Step 03",
    title: "Memory that outlasts the session.",
    body: "Every exchange is stored server-side with AES-256 encryption. Context compounds across every conversation. Emma remembers your preferences, patterns, and history indefinitely.",
    panelKey: "memory",
  },
];

export const APPROACH_PANELS: Record<"coverage" | "latency" | "memory", PanelData> = {
  coverage: {
    title: "Pillar Coverage",
    description:
      "Emma integrates every capability into one coherent system. Competitors solve one layer — Emma solves all six.",
    bars: [
      { label: "Emma", pct: 100, isEmma: true, display: "6 / 6 pillars" },
      { label: "Avatar platforms", pct: 17, display: "~1 / 6 pillars" },
      { label: "Workflow agents", pct: 17, display: "~1 / 6 pillars" },
    ],
    note: "Pillars: avatar · voice · vision · memory · emotion · agent loop",
  },
  latency: {
    title: "Streaming Latency",
    description:
      "Emma starts responding before the full reply is ready. First-token delivery via SSE, not batch payload delivery.",
    bars: [
      { label: "Emma (streaming SSE)", pct: 20, isEmma: true, display: "~500ms first token" },
      { label: "Standard API", pct: 60, display: "2 – 4s full response" },
      { label: "Batch processing", pct: 100, display: "5 – 15s" },
    ],
    note: "Lower bar = faster first-token delivery",
  },
  memory: {
    title: "Memory Persistence",
    description:
      "Emma's memory is server-side and permanent. No session resets. No expiry windows. Context that compounds over months.",
    bars: [
      { label: "Emma", pct: 100, isEmma: true, display: "Persistent · encrypted" },
      { label: "Session-based AI", pct: 0, display: "Resets every session" },
      { label: "Cloud (120-day cap)", pct: 55, display: "Expires after 120 days" },
    ],
    note: "AES-256-GCM encrypted · stored in your Supabase instance",
  },
};

export const FEATURE_STRIP: FeatureStrip[] = [
  {
    tag: "Memory",
    title: "Every session remembered.",
    body: "Persistent cross-session memory. Emma builds on what she already knows about you.",
  },
  {
    tag: "Privacy",
    title: "Your conversations, yours alone.",
    body: "Nothing used to train models. Telemetry off by default. AES-256 encrypted memory.",
  },
  {
    tag: "Presence",
    title: "Always available.",
    body: "Cloud-native AI. Reach Emma from any device, any session, any time.",
  },
];
