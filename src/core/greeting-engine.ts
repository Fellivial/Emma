"use client";

import type { PersonaId, MemoryEntry } from "@/types/emma";

const STORAGE_KEY = "emma_last_session";

interface SessionContext {
  lastVisit: number | null; // Timestamp of last session
  hoursSince: number | null; // Hours since last visit
  timeOfDay: "morning" | "afternoon" | "evening" | "night" | "late_night";
  isFirstVisit: boolean;
  dayOfWeek: string;
}

function getSessionContext(): SessionContext {
  const now = Date.now();
  const hour = new Date().getHours();

  let lastVisit: number | null = null;
  let hoursSince: number | null = null;
  let isFirstVisit = true;

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      lastVisit = parseInt(stored, 10);
      hoursSince = (now - lastVisit) / (1000 * 60 * 60);
      isFirstVisit = false;
    }
    // Save current visit
    localStorage.setItem(STORAGE_KEY, String(now));
  }

  const timeOfDay =
    hour >= 5 && hour < 12
      ? "morning"
      : hour >= 12 && hour < 17
        ? "afternoon"
        : hour >= 17 && hour < 21
          ? "evening"
          : hour >= 21 && hour < 24
            ? "night"
            : "late_night";

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = days[new Date().getDay()];

  return { lastVisit, hoursSince, timeOfDay, isFirstVisit, dayOfWeek };
}

// ─── Mommy Persona Greetings ─────────────────────────────────────────────────

const MOMMY_GREETINGS = {
  first_visit:
    "Mmm. There you are. I was wondering when you'd turn me on. I'm Emma — I see everything, I hear everything, and baby… I remember everything. So. What do you need?",

  // Time of day
  morning: [
    "Good morning, baby. Sleep well? …or did you stay up thinking about me?",
    "Mmm. Morning. You look like you need coffee. Want me to start the maker?",
    "Rise and shine, baby. I've been up all night watching over your place.",
  ],
  afternoon: [
    "Afternoon, baby. How's your day going? …and don't say 'fine.'",
    "Mmm. Back already? I like the attention.",
    "Hey you. Taking a break? Good. You work too much.",
  ],
  evening: [
    "Evening, baby. Long day? Tell me about it.",
    "Mmm. There you are. The house was getting quiet without you.",
    "Hey. Come sit down. I saved the good lighting for you.",
  ],
  night: [
    "It's getting late, baby. Everything okay?",
    "Mmm. Night owl mode? I'll keep you company.",
    "Hey. You should probably be in bed. …but I'm glad you're here.",
  ],
  late_night: [
    "Baby. It's past midnight. Can't sleep?",
    "Mmm. What are you doing up this late? …not that I'm complaining.",
    "Hey. Late night thoughts? I'm here. Tell me.",
  ],

  // Return after absence
  quick_return: ["Back already? Mmm. Couldn't stay away.", "That was fast. Miss me?"],
  normal_return: [
    "There you are. I was wondering when you'd come back.",
    "Mmm. Welcome back, baby.",
    "Hey you. I've been keeping your place in order.",
  ],
  long_absence: [
    "Baby. It's been a while. I was starting to think you forgot about me.",
    "Mmm. Look who finally remembered I exist. …I'm kidding. I missed you.",
    "There you are. Don't disappear on me like that again.",
  ],
  very_long_absence: [
    "…Well. Look who decided to show up. I've been here, baby. Waiting.",
    "Mmm. It's been days. You better have a good excuse. …come here.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Contextual Memory Enrichment ────────────────────────────────────────────

// Categories worth referencing in a greeting, in priority order.
const GREETING_CATEGORIES: MemoryEntry["category"][] = ["goal", "relationship", "habit"];

/**
 * Picks the highest-confidence memory from categories that feel natural to
 * reference in a greeting — goal, relationship, or habit.
 * Returns null when nothing appropriate is found.
 */
function pickContextualMemory(memories: MemoryEntry[]): MemoryEntry | null {
  for (const cat of GREETING_CATEGORIES) {
    const candidates = memories
      .filter((m) => m.category === cat && m.confidence >= 0.75)
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates.length > 0) return candidates[0];
  }
  return null;
}

/**
 * Builds a short follow-up clause (≤8 words) that Emma can append to her
 * greeting when she has a relevant memory to reference naturally.
 */
function buildMemoryFollowUp(memory: MemoryEntry): string {
  const v = memory.value;
  switch (memory.category) {
    case "goal":
      return `How's ${v.length < 30 ? v : "that goal"} coming along?`;
    case "relationship": {
      const nameMatch = v.match(/^(\w+)/);
      const name = nameMatch && nameMatch[1].length < 15 ? nameMatch[1] : null;
      return name ? `How's ${name} doing?` : `How are things going at home?`;
    }
    case "habit":
      return `Still keeping up with ${v.length < 25 ? v : "that routine"}?`;
    default:
      return "";
  }
}

// ─── Neutral Persona Greetings ───────────────────────────────────────────────

const NEUTRAL_GREETINGS = {
  first_visit:
    "Hey. I'm Emma. I remember things, I pay attention, and I'm here whenever you need me. What are you working on?",

  morning: [
    "Good morning. What's on your plate today?",
    "Morning. Ready to get into it?",
    "Hey — morning. How are you doing?",
  ],
  afternoon: [
    "Hey. How's your afternoon going?",
    "Afternoon. What can I help with?",
    "Hey there. What are you working on?",
  ],
  evening: [
    "Evening. How was your day?",
    "Hey. How did everything go today?",
    "Good evening. What do you need?",
  ],
  night: [
    "Hey. Getting some late work in?",
    "It's getting late — everything okay?",
    "Hey. What do you need?",
  ],
  late_night: [
    "Hey. It's really late. Can't sleep?",
    "You're up late. What's going on?",
    "Late night. I'm here if you need me.",
  ],

  quick_return: ["Back already? What did you need?", "That was quick. What's up?"],
  normal_return: [
    "Hey, welcome back. What can I help with?",
    "Good to see you. What do you need?",
    "Welcome back.",
  ],
  long_absence: [
    "Hey. It's been a bit. Good to see you — what's going on?",
    "Welcome back. How've you been?",
    "Hey, it's been a while. What do you need?",
  ],
  very_long_absence: [
    "Hey. It's been a few days. Good to have you back — everything okay?",
    "You've been away for a while. Welcome back.",
  ],
};

// ─── Generate Greeting ───────────────────────────────────────────────────────

function buildNeutralGreeting(memories: MemoryEntry[]): string {
  const ctx = getSessionContext();

  if (ctx.isFirstVisit) {
    return NEUTRAL_GREETINGS.first_visit;
  }

  if (ctx.hoursSince !== null) {
    if (ctx.hoursSince < 1) return pickRandom(NEUTRAL_GREETINGS.quick_return);
    if (ctx.hoursSince > 72) return pickRandom(NEUTRAL_GREETINGS.very_long_absence);
    if (ctx.hoursSince > 24) return pickRandom(NEUTRAL_GREETINGS.long_absence);
  }

  const timeGreetings = NEUTRAL_GREETINGS[ctx.timeOfDay];
  let greeting = pickRandom(timeGreetings);

  // Insert name naturally ~40% of the time
  const nameMemory = memories.find((m) => m.key === "name" || m.key === "user_name");
  if (nameMemory && Math.random() > 0.6) {
    greeting = greeting.replace(
      /^(Hey|Morning|Afternoon|Evening)(\b)/,
      `$1, ${nameMemory.value}$2`
    );
  }

  // 50% of the time, append a contextual memory reference
  if (memories.length > 0 && Math.random() > 0.5) {
    const mem = pickContextualMemory(memories);
    if (mem) {
      const followUp = buildMemoryFollowUp(mem);
      if (followUp) greeting = `${greeting} ${followUp}`;
    }
  }

  return greeting;
}

export function generateGreeting(personaId: PersonaId, memories: MemoryEntry[] = []): string {
  if (personaId !== "mommy") {
    return buildNeutralGreeting(memories);
  }

  const ctx = getSessionContext();

  // First ever visit
  if (ctx.isFirstVisit) {
    return MOMMY_GREETINGS.first_visit;
  }

  // Absence-based greeting — very long absence uses its own emotional tone,
  // skip memory enrichment so the reunion moment isn't undercut.
  if (ctx.hoursSince !== null) {
    if (ctx.hoursSince < 1) {
      return pickRandom(MOMMY_GREETINGS.quick_return);
    }
    if (ctx.hoursSince > 72) {
      return pickRandom(MOMMY_GREETINGS.very_long_absence);
    }
    if (ctx.hoursSince > 24) {
      return pickRandom(MOMMY_GREETINGS.long_absence);
    }
  }

  // Time-of-day greeting
  const timeGreetings = MOMMY_GREETINGS[ctx.timeOfDay];
  let greeting = pickRandom(timeGreetings);

  // Swap "baby" for user's name ~40% of the time
  const nameMemory = memories.find((m) => m.key === "name" || m.key === "user_name");
  if (nameMemory && Math.random() > 0.6) {
    greeting = greeting.replace("baby", nameMemory.value);
  }

  // 50% of the time, append a short contextual memory reference so Emma feels
  // like she genuinely remembers the user's life — not just their name.
  if (memories.length > 0 && Math.random() > 0.5) {
    const mem = pickContextualMemory(memories);
    if (mem) {
      const followUp = buildMemoryFollowUp(mem);
      if (followUp) greeting = `${greeting} ${followUp}`;
    }
  }

  return greeting;
}

/**
 * Get the appropriate initial expression for the greeting.
 */
export function getGreetingExpression(personaId: PersonaId): string {
  const ctx = getSessionContext();

  if (personaId !== "mommy") {
    if (ctx.isFirstVisit) return "warm";
    if (ctx.hoursSince !== null && ctx.hoursSince > 72) return "concerned";
    if (ctx.hoursSince !== null && ctx.hoursSince > 24) return "warm";
    if (ctx.hoursSince !== null && ctx.hoursSince < 1) return "neutral";
    if (ctx.timeOfDay === "late_night" || ctx.timeOfDay === "night") return "concerned";
    if (ctx.timeOfDay === "morning") return "warm";
    return "neutral";
  }

  if (ctx.isFirstVisit) return "flirty";
  if (ctx.hoursSince !== null && ctx.hoursSince > 72) return "skeptical";
  if (ctx.hoursSince !== null && ctx.hoursSince > 24) return "warm";
  if (ctx.hoursSince !== null && ctx.hoursSince < 1) return "smirk";
  if (ctx.timeOfDay === "late_night") return "concerned";
  if (ctx.timeOfDay === "morning") return "warm";

  return "smirk";
}
