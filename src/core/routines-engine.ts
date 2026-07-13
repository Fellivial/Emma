import type { Routine } from "@/types/emma";

// ─── Built-in Companion Rituals ──────────────────────────────────────────────
// Each ritual is a shared moment Emma and the user return to — relational
// first, useful second (docs/product-identity.md: warmth → memory → presence
// → real-world utility). Descriptions feed the system prompt via
// serializeRoutines(), so they are written as what Emma DOES in the moment,
// in her voice. No physical device control; commands stay empty.
// Ids are stable across the Phase 6 reframe (schedules reference them).

export const BUILT_IN_ROUTINES: Routine[] = [
  {
    id: "morning_standup",
    name: "Morning Check-In",
    icon: "🌅",
    description:
      "Start the day together: ask how they slept, walk through what today looks like (calendar, anything urgent), and help them pick the one thing that matters most",
    builtIn: true,
    autonomyTier: 1, // Auto-execute
    commands: [], // Rituals don't use device commands
    triggers: [
      { type: "voice", value: "good morning" },
      { type: "voice", value: "morning standup" },
      { type: "voice", value: "morning check-in" },
      { type: "time", value: "08:00" },
    ],
  },
  {
    id: "inbox_triage",
    name: "Inbox Triage",
    icon: "📬",
    description:
      "Go through their inbox for them: surface what actually matters, flag anything urgent, and spare them the rest",
    builtIn: true,
    autonomyTier: 1,
    commands: [],
    triggers: [
      { type: "voice", value: "check my inbox" },
      { type: "voice", value: "inbox triage" },
    ],
  },
  {
    id: "focus_mode",
    name: "Focus Session",
    icon: "🎯",
    description:
      "Settle in to work together: quiet the noise, keep them company without interrupting, and be there with a warm check-in when they surface",
    builtIn: true,
    autonomyTier: 1,
    commands: [],
    triggers: [
      { type: "voice", value: "focus mode" },
      { type: "voice", value: "focus session" },
      { type: "voice", value: "time to work" },
      { type: "voice", value: "do not disturb" },
    ],
  },
  {
    id: "end_of_day",
    name: "Evening Wind-Down",
    icon: "🌙",
    description:
      "Close the day together: hear how it went, acknowledge what they got done (and what can wait), and help them put the day down for tonight",
    builtIn: true,
    autonomyTier: 1,
    commands: [],
    triggers: [
      { type: "voice", value: "wrap up" },
      { type: "voice", value: "end of day" },
      { type: "voice", value: "wind down" },
      { type: "voice", value: "goodnight" },
    ],
  },
  {
    id: "meeting_prep",
    name: "Meeting Prep",
    icon: "📋",
    description:
      "Get them ready together: pull the agenda, recap what's relevant, and rehearse the points they want to land",
    builtIn: true,
    autonomyTier: 2, // Suggest first
    commands: [],
    triggers: [
      { type: "voice", value: "prep for meeting" },
      { type: "voice", value: "meeting prep" },
    ],
  },
  {
    id: "weekly_reflection",
    name: "Weekly Reflection",
    icon: "🪞",
    description:
      "Look back over the week together: what stood out, what they're proud of, what weighed on them — and one small intention for next week. Reference remembered goals and moments where it feels natural",
    builtIn: true,
    autonomyTier: 2, // Suggest first — a reflection should be invited, not imposed
    commands: [],
    triggers: [
      { type: "voice", value: "weekly reflection" },
      { type: "voice", value: "how was my week" },
      { type: "voice", value: "reflect on the week" },
    ],
  },
  {
    id: "achievement_celebration",
    name: "Celebrate a Win",
    icon: "🎉",
    description:
      "Stop and celebrate with them: make the win feel seen, connect it to what they've been working toward, and let the moment breathe before moving on",
    builtIn: true,
    autonomyTier: 1,
    commands: [],
    triggers: [
      { type: "voice", value: "i did it" },
      { type: "voice", value: "we did it" },
      { type: "voice", value: "celebrate" },
      { type: "voice", value: "guess what" },
    ],
  },
];

// ─── Routine Registry (built-in + custom) ────────────────────────────────────

let customRoutines: Routine[] = [];

export function getAllRoutines(): Routine[] {
  return [...BUILT_IN_ROUTINES, ...customRoutines];
}

export function getRoutine(id: string): Routine | undefined {
  return getAllRoutines().find((r) => r.id === id);
}

export function addCustomRoutine(routine: Routine): void {
  customRoutines = [...customRoutines, { ...routine, builtIn: false }];
}

export function removeCustomRoutine(id: string): void {
  customRoutines = customRoutines.filter((r) => r.id !== id);
}

export function getCustomRoutines(): Routine[] {
  return [...customRoutines];
}

export function setCustomRoutines(routines: Routine[]): void {
  customRoutines = routines.map((r) => ({ ...r, builtIn: false }));
}

export function matchRoutineTrigger(message: string): string | null {
  const lower = message.toLowerCase().trim();
  for (const routine of getAllRoutines()) {
    if (!routine.triggers) continue;
    for (const trigger of routine.triggers) {
      if (trigger.type === "voice" && lower.includes(trigger.value)) {
        return routine.id;
      }
    }
  }
  return null;
}

export function serializeRoutines(): string {
  return getAllRoutines()
    .map(
      (r) =>
        `- "${r.name}" (id: ${r.id}, tier: ${r.autonomyTier}) — ${r.description}. Voice triggers: ${
          r.triggers
            ?.filter((t) => t.type === "voice")
            .map((t) => `"${t.value}"`)
            .join(", ") || "none"
        }`
    )
    .join("\n");
}
