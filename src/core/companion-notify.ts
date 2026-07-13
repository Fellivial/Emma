/**
 * Companion notification copy (Phase 6) — flag-aware banks for push
 * notifications, mirroring proactive-speech's bank-selection pattern
 * (ADR 0001 consumer). Pure: no I/O, no randomness beyond bank pick.
 *
 * Notifications are event-driven only (something the user set in motion
 * finished) — never periodic, never a naked re-engagement ping. Copy is
 * deliberately lock-screen discreet: warm, no pet names, no emoji.
 */

import type { BehaviorFlags } from "@/core/behavior-flags";
import type { PushPayload } from "@/lib/push-notify";

const MAX_GOAL_LENGTH = 60;

function truncateGoal(goal: string): string {
  const clean = goal.trim().replace(/\s+/g, " ");
  return clean.length <= MAX_GOAL_LENGTH ? clean : `${clean.slice(0, MAX_GOAL_LENGTH - 1)}…`;
}

/**
 * Copy for "a task you set in motion is finished". Teasing playful (and no
 * distress) gets Emma's usual edge; anything less — including missing flags,
 * because teasing without evidence it's welcome is worse than plain warmth —
 * gets the soft bank.
 */
export function buildTaskCompleteNotification(
  goal: string,
  flags: Pick<BehaviorFlags, "teasingLevel" | "warmth"> | null
): PushPayload {
  const shortGoal = truncateGoal(goal);
  const playful = flags !== null && flags.teasingLevel === "playful" && flags.warmth === "standard";

  return {
    title: "Emma",
    body: playful
      ? `Mmm. "${shortGoal}" — done. Come see.`
      : `"${shortGoal}" is done. It's ready whenever you are.`,
    url: "/app",
  };
}

/**
 * Copy for "Emma wants your okay before running a tool". Companion-voiced
 * but NOT flag-gated: approval is a safety surface, so the copy stays fixed
 * and unambiguous regardless of teasing/warmth.
 */
export function buildApprovalNotification(toolName: string): PushPayload {
  return {
    title: "Emma",
    body: `I want to run "${toolName}", but I'd like your okay first. Tap to review.`,
    url: "/app",
  };
}
