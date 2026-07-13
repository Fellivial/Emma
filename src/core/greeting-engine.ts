"use client";

import type { PersonaId, MemoryEntry } from "@/types/emma";
import type { BehaviorFlags } from "@/core/behavior-flags";

const STORAGE_KEY = "emma_last_session";

/**
 * Cross-session presence from the server (ADR 0002), fetched by the app
 * shell from /api/emma/presence. localStorage stays as a resilience
 * fallback; when both exist the most recent interaction wins, so a new
 * device inherits continuity instead of a first-visit greeting.
 */
export interface PresenceContext {
  lastInteractionAt: number | null;
  lastMood: string | null;
}

interface SessionContext {
  lastVisit: number | null; // Timestamp of last session
  hoursSince: number | null; // Hours since last visit
  timeOfDay: "morning" | "afternoon" | "evening" | "night" | "late_night";
  isFirstVisit: boolean;
  dayOfWeek: string;
}

function getSessionContext(presence?: PresenceContext | null): SessionContext {
  const now = Date.now();
  const hour = new Date().getHours();

  let lastVisit: number | null = null;
  let isFirstVisit = true;

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      lastVisit = parseInt(stored, 10);
    }
    // Save current visit
    localStorage.setItem(STORAGE_KEY, String(now));
  }

  // Merge server presence: the newest interaction anywhere is the truth.
  const serverLast = presence?.lastInteractionAt ?? null;
  if (serverLast !== null && (lastVisit === null || serverLast > lastVisit)) {
    lastVisit = serverLast;
  }

  let hoursSince: number | null = null;
  if (lastVisit !== null) {
    hoursSince = (now - lastVisit) / (1000 * 60 * 60);
    isFirstVisit = false;
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

// Soft variants used when behavior flags suppress teasing (teasingLevel "off"
// via preference memory, interaction_vibe, or emotional distress). Same warmth,
// same structure, zero teasing markers — no "baby", no sentence-initial "Mmm",
// nothing flirty. Absence and time-of-day semantics mirror MOMMY_GREETINGS.
const MOMMY_GREETINGS_SOFT: typeof MOMMY_GREETINGS = {
  first_visit:
    "There you are. I'm Emma — I pay attention, I remember what matters to you, and I'm here whenever you need me. What do you need?",

  morning: [
    "Good morning. Sleep okay?",
    "Morning, sweetheart. Coffee first — then tell me what's on your plate.",
    "Good morning. I've been keeping things in order for you.",
  ],
  afternoon: [
    "Hey. How's your day treating you?",
    "Afternoon. Taking a break? Good — you've earned it.",
    "Hey you. How's the day going so far?",
  ],
  evening: [
    "Evening. Long day? Tell me about it.",
    "Hey. Come sit down — I want to hear how today went.",
    "Evening, sweetheart. I'm glad you're here.",
  ],
  night: [
    "It's getting late. Everything okay?",
    "Hey. Still up? I'll keep you company.",
    "It's late — but I'm glad you came by.",
  ],
  late_night: [
    "It's past midnight. Can't sleep?",
    "You're up late. I'm here — tell me what's on your mind.",
    "Late night thoughts? I'm listening.",
  ],

  quick_return: ["Back already? I'm right here.", "That was quick. What do you need?"],
  normal_return: [
    "There you are. Welcome back.",
    "Hey you. I've been keeping your place in order.",
    "Welcome back, sweetheart.",
  ],
  long_absence: [
    "It's been a while. I'm glad you're back.",
    "There you are. I was thinking about you.",
    "Hey. It's been a bit — how have you been?",
  ],
  very_long_absence: [
    "It's been days. I'm really glad you're back — how are you holding up?",
    "There you are. I've been here the whole time. Come tell me everything.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Presence Mood Check-In (ADR 0002) ───────────────────────────────────────

// Moods worth a gentle check-in on return. Bounded set — mirrors the
// negative half of EmotionLabel.
const NEGATIVE_MOODS = new Set(["sad", "angry", "anxious", "tired", "frustrated", "stressed"]);

/**
 * A mood check-in applies when the last session ended on a negative note,
 * recently enough that asking is natural (1–48h). Under an hour is the same
 * sitting; past 48h the absence banks carry the reunion instead. Pure and
 * exported for tests.
 */
export function shouldMoodCheckIn(
  presence: PresenceContext | null | undefined,
  hoursSince: number | null
): boolean {
  if (!presence?.lastMood || !NEGATIVE_MOODS.has(presence.lastMood)) return false;
  if (hoursSince === null) return false;
  return hoursSince >= 1 && hoursSince <= 48;
}

// Check-in lines never name the stored mood — Emma noticed, she doesn't
// diagnose. Same one-clause shape as the memory follow-ups.
const MOOD_CHECK_INS = {
  mommy: [
    "Last time you left seeming a little worn down. How are you feeling now, baby?",
    "You didn't seem quite yourself last time. Better today?",
  ],
  soft: [
    "Last time you left, you seemed a bit worn down. How are you feeling now?",
    "You didn't seem quite yourself last time we talked. How are you doing?",
  ],
  neutral: [
    "Last time you seemed a bit off. How are you doing today?",
    "You didn't seem quite yourself last time. Everything okay?",
  ],
};

// ─── Greeting Bucket Tracking ────────────────────────────────────────────────

// The bucket used by the most recent generateGreeting call, reported back to
// the server (PUT /api/emma/presence) as last_greeting_context.
let lastGreetingBucket = "first_visit";

export function getLastGreetingBucket(): string {
  return lastGreetingBucket;
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

function buildNeutralGreeting(memories: MemoryEntry[], presence?: PresenceContext | null): string {
  const ctx = getSessionContext(presence);

  if (ctx.isFirstVisit) {
    lastGreetingBucket = "first_visit";
    return NEUTRAL_GREETINGS.first_visit;
  }

  if (ctx.hoursSince !== null) {
    if (ctx.hoursSince < 1) {
      lastGreetingBucket = "quick_return";
      return pickRandom(NEUTRAL_GREETINGS.quick_return);
    }
    if (ctx.hoursSince > 72) {
      lastGreetingBucket = "very_long_absence";
      return pickRandom(NEUTRAL_GREETINGS.very_long_absence);
    }
    if (ctx.hoursSince > 24) {
      lastGreetingBucket = "long_absence";
      let greeting = pickRandom(NEUTRAL_GREETINGS.long_absence);
      if (shouldMoodCheckIn(presence, ctx.hoursSince)) {
        greeting = `${greeting} ${pickRandom(MOOD_CHECK_INS.neutral)}`;
      }
      return greeting;
    }
  }

  lastGreetingBucket = ctx.timeOfDay;
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

  // A mood check-in from the last session takes precedence over the random
  // memory follow-up — continuity of feeling beats continuity of facts.
  if (shouldMoodCheckIn(presence, ctx.hoursSince)) {
    return `${greeting} ${pickRandom(MOOD_CHECK_INS.neutral)}`;
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

export function generateGreeting(
  personaId: PersonaId,
  memories: MemoryEntry[] = [],
  flags?: BehaviorFlags,
  presence?: PresenceContext | null
): string {
  if (personaId !== "mommy") {
    return buildNeutralGreeting(memories, presence);
  }

  // Behavior flags gate the teasing bank — distress or a stored preference
  // against teasing selects the soft variants. Absence/time structure is shared.
  const soft = flags?.teasingLevel === "off";
  const bank = soft ? MOMMY_GREETINGS_SOFT : MOMMY_GREETINGS;
  const checkIns = soft ? MOOD_CHECK_INS.soft : MOOD_CHECK_INS.mommy;

  const ctx = getSessionContext(presence);

  // First ever visit
  if (ctx.isFirstVisit) {
    lastGreetingBucket = "first_visit";
    return bank.first_visit;
  }

  // Absence-based greeting — very long absence uses its own emotional tone,
  // skip memory enrichment so the reunion moment isn't undercut.
  if (ctx.hoursSince !== null) {
    if (ctx.hoursSince < 1) {
      lastGreetingBucket = "quick_return";
      return pickRandom(bank.quick_return);
    }
    if (ctx.hoursSince > 72) {
      lastGreetingBucket = "very_long_absence";
      return pickRandom(bank.very_long_absence);
    }
    if (ctx.hoursSince > 24) {
      lastGreetingBucket = "long_absence";
      let greeting = pickRandom(bank.long_absence);
      if (shouldMoodCheckIn(presence, ctx.hoursSince)) {
        greeting = `${greeting} ${pickRandom(checkIns)}`;
      }
      return greeting;
    }
  }

  // Time-of-day greeting
  lastGreetingBucket = ctx.timeOfDay;
  const timeGreetings = bank[ctx.timeOfDay];
  let greeting = pickRandom(timeGreetings);

  // Swap "baby" for user's name ~40% of the time; soft lines have no "baby",
  // so insert the name after the opening word instead (same as neutral).
  const nameMemory = memories.find((m) => m.key === "name" || m.key === "user_name");
  if (nameMemory && Math.random() > 0.6) {
    greeting = soft
      ? greeting.replace(/^(Hey|Morning|Afternoon|Evening)(\b)/, `$1, ${nameMemory.value}$2`)
      : greeting.replace("baby", nameMemory.value);
  }

  // A mood check-in from the last session takes precedence over the random
  // memory follow-up — continuity of feeling beats continuity of facts.
  if (shouldMoodCheckIn(presence, ctx.hoursSince)) {
    return `${greeting} ${pickRandom(checkIns)}`;
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
 *
 * When behavior flags suppress teasing or elevate warmth, the mommy persona
 * uses the neutral expression map — warm/concerned instead of flirty/smirk.
 */
export function getGreetingExpression(
  personaId: PersonaId,
  flags?: BehaviorFlags,
  presence?: PresenceContext | null
): string {
  const ctx = getSessionContext(presence);

  // A pending mood check-in leads with care regardless of persona.
  if (shouldMoodCheckIn(presence, ctx.hoursSince)) return "concerned";

  const soften =
    personaId === "mommy" &&
    flags !== undefined &&
    (flags.teasingLevel === "off" || flags.warmth === "elevated");

  if (personaId !== "mommy" || soften) {
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
