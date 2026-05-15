import type { AutonomyTier, Routine, EmmaNotification, NotificationAction } from "@/types/emma";
import { uid } from "@/lib/utils";

/**
 * Autonomy Tier System
 *
 * Tier 1 — Full Auto: low-risk, routine actions. Execute silently or with brief notification.
 *          Examples: adjust lights, play usual playlist, lock doors at bedtime.
 *
 * Tier 2 — Suggest & Confirm: moderate actions. Propose and wait for approval.
 *          Examples: reorder groceries, change thermostat significantly, run a complex routine.
 *
 * Tier 3 — Inform & Wait: high-impact or irreversible. Full context, explicit go-ahead.
 *          Examples: purchases, contacting someone, security protocol changes.
 */

// ─── Tier Resolution ─────────────────────────────────────────────────────────

/**
 * Given a routine, return the notification that should be shown based on its tier.
 *
 * Tier 1 → auto_action notification (brief, auto-dismiss)
 * Tier 2 → suggestion notification (approve/dismiss buttons)
 * Tier 3 → alert notification (approve/dismiss, no auto-dismiss)
 */
export function buildTierNotification(
  routine: Routine,
  source: "scheduler" | "proactive"
): EmmaNotification {
  const tier = routine.autonomyTier;
  const base = {
    id: uid(),
    timestamp: Date.now(),
    routineId: routine.id,
    dismissed: false,
  };

  switch (tier) {
    case 1:
      return {
        ...base,
        type: "auto_action",
        tier: 1,
        title: `${routine.icon} ${routine.name}`,
        message: `Running automatically — ${routine.description}`,
        autoExpire: 4000,
      };

    case 2:
      return {
        ...base,
        type: "suggestion",
        tier: 2,
        title: `${routine.icon} ${routine.name}?`,
        message: `Should I run "${routine.name}"? ${routine.description}`,
        actions: [
          { label: "Approve", action: "approve" },
          { label: "Dismiss", action: "dismiss" },
          { label: "Snooze 15m", action: "snooze", value: "15" },
        ],
      };

    case 3:
      return {
        ...base,
        type: "alert",
        tier: 3,
        title: `⚠️ ${routine.icon} ${routine.name}`,
        message: `This will: ${routine.description}. ${routine.commands.length} device changes. Approve to proceed.`,
        actions: [
          { label: "Approve", action: "approve" },
          { label: "Dismiss", action: "dismiss" },
        ],
      };
  }
}

/**
 * Should this routine auto-execute (Tier 1), or does it need approval?
 */
export function shouldAutoExecute(routine: Routine): boolean {
  return routine.autonomyTier === 1;
}

/**
 * Build a simple system notification (not tied to a routine).
 */
export function buildSystemNotification(
  title: string,
  message: string,
  autoExpire?: number
): EmmaNotification {
  return {
    id: uid(),
    timestamp: Date.now(),
    type: "system",
    tier: 1,
    title,
    message,
    dismissed: false,
    autoExpire: autoExpire ?? 5000,
  };
}

/**
 * Build an anomaly notification from vision.
 */
export function buildAnomalyNotification(anomaly: string): EmmaNotification {
  return {
    id: uid(),
    timestamp: Date.now(),
    type: "anomaly",
    tier: 2,
    title: "👁️ Anomaly Detected",
    message: anomaly,
    dismissed: false,
    actions: [{ label: "Noted", action: "dismiss" }],
    autoExpire: 10000,
  };
}
