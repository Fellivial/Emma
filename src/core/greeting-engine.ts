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

// ─── Generate Greeting ───────────────────────────────────────────────────────

export function generateGreeting(personaId: PersonaId, memories: MemoryEntry[] = []): string {
  if (personaId !== "mommy") {
    return "Hey, I'm Emma. What can I do for you?";
  }

  const ctx = getSessionContext();

  // First ever visit
  if (ctx.isFirstVisit) {
    return MOMMY_GREETINGS.first_visit;
  }

  // Absence-based greeting
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

  // Personalize with memory if available
  const nameMemory = memories.find((m) => m.key === "name" || m.key === "user_name");
  if (nameMemory) {
    // Sometimes use their name instead of "baby"
    if (Math.random() > 0.6) {
      greeting = greeting.replace("baby", nameMemory.value);
    }
  }

  return greeting;
}

/**
 * Get the appropriate initial expression for the greeting.
 */
export function getGreetingExpression(personaId: PersonaId): string {
  if (personaId !== "mommy") return "neutral";

  const ctx = getSessionContext();

  if (ctx.isFirstVisit) return "flirty";
  if (ctx.hoursSince !== null && ctx.hoursSince > 72) return "skeptical";
  if (ctx.hoursSince !== null && ctx.hoursSince > 24) return "warm";
  if (ctx.hoursSince !== null && ctx.hoursSince < 1) return "smirk";
  if (ctx.timeOfDay === "late_night") return "concerned";
  if (ctx.timeOfDay === "morning") return "warm";

  return "smirk";
}
