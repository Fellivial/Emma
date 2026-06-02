import type { Routine, EmmaNotification } from "@/types/emma";
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
  _source: "scheduler" | "proactive"
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
 * Check if the current wall-clock time falls within the user's quiet hours.
 * quietStart / quietEnd are "HH:MM" strings (24-hour). tz is an IANA timezone.
 * Returns false if either bound is unset (quiet hours disabled).
 */
export function isQuietHours(
  quietStart?: string | null,
  quietEnd?: string | null,
  tz?: string | null
): boolean {
  if (!quietStart || !quietEnd) return false;
  try {
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    const [h, m] = localTime.split(":").map(Number);
    const current = h * 60 + m;
    const [sh, sm] = quietStart.split(":").map(Number);
    const [eh, em] = quietEnd.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    return startMin <= endMin
      ? current >= startMin && current < endMin
      : current >= startMin || current < endMin;
  } catch {
    return false;
  }
}

/**
 * Build a Tier 2 pattern suggestion notification (uses patternId as routineId
 * so the approve/dismiss action handlers can identify it).
 */
export function buildPatternNotification(patternId: string, suggestion: string): EmmaNotification {
  return {
    id: uid(),
    timestamp: Date.now(),
    type: "suggestion",
    tier: 2,
    title: "💡 I noticed something",
    message: suggestion,
    dismissed: false,
    actions: [
      { label: "Set it up", action: "approve" },
      { label: "Dismiss", action: "dismiss" },
    ],
    routineId: patternId,
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
