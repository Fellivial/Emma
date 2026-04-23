import type { Routine, AutonomyTier } from "@/types/emma";

// ─── Built-in Workflow Routines ──────────────────────────────────────────────
// Each routine represents a sequence of actions Emma can trigger as a unit.
// No physical device control — these are digital workspace workflows.

export const BUILT_IN_ROUTINES: Routine[] = [
  {
    id: "morning_standup",
    name: "Morning Standup",
    icon: "🌅",
    description: "Summarize calendar, check unread messages, review today's priorities",
    builtIn: true,
    autonomyTier: 1, // Auto-execute
    commands: [], // Workflow routines don't use device commands
    triggers: [
      { type: "voice", value: "good morning" },
      { type: "voice", value: "morning standup" },
      { type: "time", value: "08:00" },
    ],
  },
  {
    id: "inbox_triage",
    name: "Inbox Triage",
    icon: "📬",
    description: "Scan inbox, summarize important emails, flag urgent items",
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
    name: "Focus Mode",
    icon: "🎯",
    description: "Silence notifications, set status to busy, start focus timer",
    builtIn: true,
    autonomyTier: 1,
    commands: [],
    triggers: [
      { type: "voice", value: "focus mode" },
      { type: "voice", value: "time to work" },
      { type: "voice", value: "do not disturb" },
    ],
  },
  {
    id: "end_of_day",
    name: "End of Day",
    icon: "🌙",
    description: "Summarize what was accomplished, log incomplete tasks, prepare tomorrow's agenda",
    builtIn: true,
    autonomyTier: 1,
    commands: [],
    triggers: [
      { type: "voice", value: "wrap up" },
      { type: "voice", value: "end of day" },
      { type: "voice", value: "goodnight" },
    ],
  },
  {
    id: "meeting_prep",
    name: "Meeting Prep",
    icon: "📋",
    description: "Pull agenda, summarize relevant docs, prepare talking points",
    builtIn: true,
    autonomyTier: 2, // Suggest first
    commands: [],
    triggers: [
      { type: "voice", value: "prep for meeting" },
      { type: "voice", value: "meeting prep" },
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
