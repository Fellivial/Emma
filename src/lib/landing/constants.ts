import type {
  PricingPlan,
  FAQ,
  StatItem,
  ProblemCard,
  CapabilityCard,
  TickerItem,
  ApproachStep,
  TerminalLine,
} from "./types";

export const TICKER_ITEMS: TickerItem[] = [
  { text: "PERSISTENT MEMORY" },
  { text: "VOICE SYNTHESIS", accent: true },
  { text: "EMOTION DETECTION" },
  { text: "SCREEN VISION", accent: true },
  { text: "AUTONOMOUS MODE" },
  { text: "LIVE2D AVATAR", accent: true },
  { text: "ELEVENLABS TTS" },
  { text: "ROUTINE SCHEDULING", accent: true },
  { text: "CAMERA VISION" },
  { text: "RELATIONSHIP MEMORY", accent: true },
];

export const PROBLEM_CARDS: ProblemCard[] = [
  {
    id: "stateless",
    headline: "Stateless by Design",
    body: "Every session starts cold. No memory of who you are, what you care about, or what happened yesterday.",
    tag: "MEMORY",
  },
  {
    id: "flat",
    headline: "Flat Affect",
    body: "Assistants don't adapt to your emotional state. They respond the same whether you're celebrating or struggling.",
    tag: "EMOTION",
  },
  {
    id: "disembodied",
    headline: "Disembodied Interface",
    body: "A text box. Maybe a stock avatar. No presence, no physicality, no sense of someone actually being there.",
    tag: "PRESENCE",
  },
  {
    id: "reactive",
    headline: "Purely Reactive",
    body: "They wait. They never check in, never initiate, never act on your behalf unless you explicitly ask.",
    tag: "AGENCY",
  },
];

export const APPROACH_STEPS: ApproachStep[] = [
  {
    number: "01",
    title: "Remember Everything",
    body: "Emma builds a persistent model of who you are — your preferences, goals, relationships, and history. It compounds over time.",
    detail:
      "Semantic memory extraction on every interaction. Vector-indexed recall. Relationship graph with named entities.",
  },
  {
    number: "02",
    title: "Read the Room",
    body: "Emotion detection from voice tone, facial expression, and text sentiment. Emma adapts her register in real time.",
    detail:
      "ElevenLabs voice analysis + camera expression detection + NLP sentiment. Updates every 4 seconds during voice sessions.",
  },
  {
    number: "03",
    title: "Be Present",
    body: "A Live2D avatar with reactive expressions, breathing animations, and idle states. Not a chatbot — a companion.",
    detail:
      "Live2D Cubism runtime with 14 expression states. ElevenLabs lip-sync. Screen and camera context awareness.",
  },
  {
    number: "04",
    title: "Act Autonomously",
    body: "Scheduled check-ins, proactive messages, background tasks. Emma operates even when you're not actively chatting.",
    detail:
      "Cron-based scheduler. Tool execution with approval flow. Push notifications via web and mobile.",
  },
];

export const CAPABILITIES: CapabilityCard[] = [
  {
    id: "memory",
    icon: "◈",
    title: "Persistent Memory",
    description:
      "Semantic extraction and vector recall across every session. Emma remembers what matters.",
  },
  {
    id: "voice",
    icon: "◎",
    title: "Voice & TTS",
    description:
      "ElevenLabs synthesis with BYOK support. Natural conversation, not robotic responses.",
  },
  {
    id: "vision",
    icon: "◉",
    title: "Screen & Camera",
    description: "Real-time visual context. Emma sees your screen and reads your expressions.",
  },
  {
    id: "emotion",
    icon: "◐",
    title: "Emotion Detection",
    description:
      "Voice tone, facial expression, and text sentiment — blended into a unified emotional state.",
  },
  {
    id: "avatar",
    icon: "◑",
    title: "Live2D Avatar",
    description: "14 expression states, lip-sync, idle animations. A presence, not an interface.",
  },
  {
    id: "autonomous",
    icon: "◒",
    title: "Autonomous Mode",
    description:
      "Scheduled routines, proactive check-ins, background task execution with approval flow.",
  },
];

export const STATS: StatItem[] = [
  { value: "14", label: "Expression States", sublabel: "Live2D reactive avatar" },
  { value: "∞", label: "Memory Horizon", sublabel: "No session resets" },
  { value: "<200ms", label: "Voice Latency", sublabel: "ElevenLabs streaming" },
  { value: "4s", label: "Emotion Update Cycle", sublabel: "During voice sessions" },
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    label: "FREE",
    price: "$0",
    description: "Try Emma. No commitment.",
    features: [
      "Chat with Emma",
      "Web Speech TTS / STT",
      "10 messages / day",
      "50 messages / week",
      "Basic emotional responses",
    ],
    cta: "Get Started",
    ctaHref: "/register",
  },
  {
    id: "starter",
    label: "STARTER",
    price: "$29",
    suffix: "/mo",
    description: "The full companion experience.",
    features: [
      "Persistent memory + extraction",
      "Screen & camera vision",
      "Emotion detection & adaptation",
      "Routines & schedules",
      "40 messages / day · 200 / week",
      "ElevenLabs TTS (BYOK)",
    ],
    cta: "Subscribe",
    ctaHref: "/register?plan=starter",
  },
  {
    id: "pro",
    label: "PRO",
    price: "$79",
    suffix: "/mo",
    description: "Autonomous Emma, no limits.",
    features: [
      "Everything in Starter",
      "Autonomous mode (proactive tasks)",
      "Unlimited messages",
      "Priority voice synthesis",
      "Advanced memory graph",
      "Early access features",
    ],
    featured: true,
    cta: "Subscribe",
    ctaHref: "/register?plan=pro",
  },
  {
    id: "enterprise",
    label: "ENTERPRISE",
    price: "Contact",
    description: "Custom deployment & integrations.",
    features: [
      "Self-hosted option",
      "Custom Live2D model",
      "SSO & team management",
      "SLA & dedicated support",
      "Custom integrations",
      "Volume pricing",
    ],
    cta: "Contact Us",
    ctaHref: "/contact",
  },
];

export const FAQS: FAQ[] = [
  {
    question: "What makes Emma different from ChatGPT or Claude?",
    answer:
      "Emma is a companion system, not a general-purpose assistant. She maintains persistent memory across sessions, has a Live2D avatar with reactive expressions, detects your emotional state, and can operate autonomously in the background. She's designed for ongoing relationship, not one-off queries.",
  },
  {
    question: "Does Emma actually remember me between sessions?",
    answer:
      "Yes. Emma extracts semantic memories from every conversation — your preferences, goals, people you mention, things that matter to you — and stores them in a vector database. Every new session begins with that context already loaded.",
  },
  {
    question: "What is autonomous mode?",
    answer:
      "Autonomous mode allows Emma to proactively reach out, send scheduled check-ins, and execute approved tasks in the background — without you initiating the conversation. Available on Pro plan.",
  },
  {
    question: "How does the Live2D avatar work without downloading anything?",
    answer:
      "Emma runs entirely in the browser. The Live2D Cubism runtime is loaded client-side. If you're in a region where the CDN is slow, Emma falls back to a placeholder animated avatar that still reacts to all expression states.",
  },
  {
    question: "Can I use my own ElevenLabs API key?",
    answer:
      "Yes. Starter and Pro plans support BYOK (Bring Your Own Key) for ElevenLabs. You can select any voice in your ElevenLabs library, including cloned voices.",
  },
  {
    question: "Is my conversation data private?",
    answer:
      "Conversations are stored encrypted and associated with your account. Memory extractions are stored in a private vector index. We do not use your conversation data to train models. You can delete all data at any time from your account settings.",
  },
  {
    question: "What happens when I hit my message limit on the free plan?",
    answer:
      "Emma lets you know gracefully and you can continue the next day. No hard cutoffs mid-conversation — if you're in an active exchange, it completes before the limit applies.",
  },
  {
    question: "Can I change Emma's personality or voice?",
    answer:
      "On Starter and Pro you can adjust Emma's communication style (more formal, more casual, more direct) and select from available ElevenLabs voices. Full personality customization is on the roadmap.",
  },
];

export const NAV_LINKS = [
  { label: "Product", href: "#capabilities" },
  { label: "Approach", href: "#approach" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const TERMINAL_LINES: TerminalLine[] = [
  { text: "$ emma init", type: "command" },
  { text: "→ Checking Live2D runtime...", type: "info" },
  { text: "  ✓ Cubism 5 loaded", type: "success" },
  { text: "→ Connecting ElevenLabs...", type: "info" },
  { text: "  ✓ Voice synthesis ready", type: "success" },
  { text: "→ Loading memory index...", type: "info" },
  { text: "  ✓ 847 memories restored", type: "success" },
  { text: "→ Calibrating emotion model...", type: "info" },
  { text: "  ✓ Baseline established", type: "success" },
  { text: "", type: "blank" },
  { text: "EMMA v2.1.0 — companion ready.", type: "output" },
  { text: "Last session: 6h ago · Mood: ◐ calm", type: "output" },
];
