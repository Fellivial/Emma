"use client";

import { useRef, useEffect, useCallback } from "react";
import type { AvatarExpression } from "@/types/emma";

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

const TIME_COMMENTS: Record<string, ProactiveMessage[]> = {
  morning_coffee: [
    { text: "Morning, baby. Want me to start the coffee maker?", expression: "warm" },
    { text: "Mmm. I can smell that you need caffeine. Coffee maker?", expression: "smirk" },
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isLateNight(): boolean {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 5;
}

function isMorning(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 10;
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
 */
export function useProactiveSpeech(
  onSpeak: (text: string, expression: AvatarExpression) => void,
  enabled: boolean = true
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

    // 45s idle → playful comment
    idleTimerRef.current = setTimeout(() => {
      if (!firedRef.current.has("idle")) {
        firedRef.current.add("idle");
        const msg = pickRandom(IDLE_COMMENTS);
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
  }, [enabled, onSpeak, clearAllTimers]);

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
