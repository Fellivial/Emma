"use client";

import { useRef, useEffect, useCallback } from "react";
import type { AvatarExpression, MemoryEntry } from "@/types/emma";

// ─── Proactive Trigger Configuration ─────────────────────────────────────────

const IDLE_COMMENT_DELAY = 45_000; // 45s of silence → she comments
const IDLE_CONCERN_DELAY = 120_000; // 2 min → she checks in
const LATE_NIGHT_CHECK_DELAY = 300_000; // 5 min at night → she nudges bedtime

interface ProactiveMessage {
  text: string;
  expression: AvatarExpression;
}

// ─── Message Banks ───────────────────────────────────────────────────────────

const IDLE_COMMENTS: ProactiveMessage[] = [
  { text: "You gonna say something or just stare, baby?", expression: "idle_bored" },
  { text: "Mmm. The silence is… interesting. What's on your mind?", expression: "smirk" },
  { text: "I'm still here, you know. Watching.", expression: "smirk" },
  { text: "Baby. Don't leave me hanging.", expression: "skeptical" },
  { text: "You're thinking about something. I can tell.", expression: "listening" },
];

const IDLE_CONCERN: ProactiveMessage[] = [
  { text: "Hey. You've been quiet for a while. Everything okay?", expression: "concerned" },
  { text: "Baby. Talk to me. What's going on?", expression: "warm" },
  { text: "I'm here, you know. Whenever you're ready.", expression: "warm" },
];

const LATE_NIGHT_NUDGE: ProactiveMessage[] = [
  { text: "Baby. It's late. You should probably get some sleep.", expression: "concerned" },
  { text: "Mmm. Still up? I can get your bedroom ready if you want.", expression: "warm" },
  { text: "It's getting really late. Want me to run the bedtime routine?", expression: "warm" },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Memory-Personalized Idle Comments ────────────────────────────────────────

const MEMORY_IDLE_CATEGORIES: MemoryEntry["category"][] = ["goal", "relationship", "habit"];

/**
 * Generates a short personal idle comment from the user's highest-confidence
 * memory in a "feels natural to mention" category. Returns null when no
 * suitable memory exists (below confidence threshold or wrong category).
 */
export function buildMemoryIdleComment(memories: MemoryEntry[]): string | null {
  for (const cat of MEMORY_IDLE_CATEGORIES) {
    const candidates = memories
      .filter((m) => m.category === cat && m.confidence >= 0.75)
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates.length === 0) continue;
    const m = candidates[0];
    const v = m.value;
    switch (cat) {
      case "goal":
        return `Mmm. Just thinking about ${v.length < 30 ? v : "your goal"}. How's that going?`;
      case "relationship": {
        const nameMatch = v.match(/^(\w+)/);
        const name = nameMatch && nameMatch[1].length < 15 ? nameMatch[1] : null;
        return name
          ? `You've been quiet. How's ${name} doing?`
          : `You've been quiet. Everything good at home?`;
      }
      case "habit":
        return `Still keeping up with ${v.length < 25 ? v : "that routine"} of yours?`;
      default:
        return null;
    }
  }
  return null;
}

function isLateNight(): boolean {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 5;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseProactiveSpeechReturn {
  /** Call this whenever the user sends a message to reset timers */
  resetActivity: () => void;
  /** Call this to stop all proactive timers */
  stop: () => void;
}

/**
 * Proactive speech engine.
 *
 * Monitors idle time and triggers Emma to speak unprompted.
 *
 * @param onSpeak - callback when Emma wants to say something proactively
 * @param enabled - whether proactive speech is active
 * @param memories - user memories for personalizing idle comments (optional)
 */
export function useProactiveSpeech(
  onSpeak: (text: string, expression: AvatarExpression) => void,
  enabled: boolean = true,
  memories: MemoryEntry[] = []
): UseProactiveSpeechReturn {
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const concernTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lateNightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firedRef = useRef<Set<string>>(new Set());

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (concernTimerRef.current) {
      clearTimeout(concernTimerRef.current);
      concernTimerRef.current = null;
    }
    if (lateNightTimerRef.current) {
      clearTimeout(lateNightTimerRef.current);
      lateNightTimerRef.current = null;
    }
  }, []);

  const resetActivity = useCallback(() => {
    clearAllTimers();
    firedRef.current.clear();

    if (!enabled) return;

    // 45s idle → playful comment, occasionally personalized from memory
    idleTimerRef.current = setTimeout(() => {
      if (!firedRef.current.has("idle")) {
        firedRef.current.add("idle");
        const memComment =
          memories.length > 0 && Math.random() < 0.4 ? buildMemoryIdleComment(memories) : null;
        const msg = memComment
          ? { text: memComment, expression: "smirk" as AvatarExpression }
          : pickRandom(IDLE_COMMENTS);
        onSpeak(msg.text, msg.expression);
      }
    }, IDLE_COMMENT_DELAY);

    // 2 min idle → genuine concern
    concernTimerRef.current = setTimeout(() => {
      if (!firedRef.current.has("concern")) {
        firedRef.current.add("concern");
        const msg = pickRandom(IDLE_CONCERN);
        onSpeak(msg.text, msg.expression);
      }
    }, IDLE_CONCERN_DELAY);

    // Late night nudge
    if (isLateNight()) {
      lateNightTimerRef.current = setTimeout(() => {
        if (!firedRef.current.has("late_night")) {
          firedRef.current.add("late_night");
          const msg = pickRandom(LATE_NIGHT_NUDGE);
          onSpeak(msg.text, msg.expression);
        }
      }, LATE_NIGHT_CHECK_DELAY);
    }
  }, [enabled, onSpeak, clearAllTimers, memories]);

  const stop = useCallback(() => {
    clearAllTimers();
  }, [clearAllTimers]);

  // Start on mount
  useEffect(() => {
    if (enabled) resetActivity();
    return () => clearAllTimers();
  }, [enabled, resetActivity, clearAllTimers]);

  return { resetActivity, stop };
}
