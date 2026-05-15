"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { EmmaNotification } from "@/types/emma";

interface UseNotificationsReturn {
  notifications: EmmaNotification[];
  push: (notification: EmmaNotification) => void;
  dismiss: (id: string) => void;
  handleAction: (notificationId: string, action: string, value?: string) => void;
  clearAll: () => void;
}

/**
 * Manages a notification queue with auto-expiry timers.
 *
 * @param onApprove - called when user approves a Tier 2/3 notification
 * @param onSnooze  - called when user snoozes (returns minutes)
 */
export function useNotifications(
  onApprove: (routineId: string) => void,
  onSnooze?: (routineId: string, minutes: number) => void
): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<EmmaNotification[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Auto-expire notifications
  useEffect(() => {
    for (const notif of notifications) {
      if (notif.autoExpire && !notif.dismissed && !timersRef.current.has(notif.id)) {
        const timer = setTimeout(() => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === notif.id ? { ...n, dismissed: true } : n))
          );
          timersRef.current.delete(notif.id);
        }, notif.autoExpire);

        timersRef.current.set(notif.id, timer);
      }
    }

    // Cleanup dismissed from view after fade-out
    const cleanup = setTimeout(() => {
      setNotifications((prev) => {
        const now = Date.now();
        return prev.filter((n) => !n.dismissed || now - n.timestamp < 30_000);
      });
    }, 5000);

    return () => clearTimeout(cleanup);
  }, [notifications]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const push = useCallback((notification: EmmaNotification) => {
    setNotifications((prev) => [notification, ...prev]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, dismissed: true } : n)));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const handleAction = useCallback(
    (notificationId: string, action: string, value?: string) => {
      const notif = notifications.find((n) => n.id === notificationId);
      if (!notif) return;

      switch (action) {
        case "approve":
          if (notif.routineId) {
            onApprove(notif.routineId);
          }
          dismiss(notificationId);
          break;

        case "dismiss":
          dismiss(notificationId);
          break;

        case "snooze":
          if (notif.routineId && onSnooze && value) {
            onSnooze(notif.routineId, parseInt(value, 10));
          }
          dismiss(notificationId);
          break;

        default:
          dismiss(notificationId);
      }
    },
    [notifications, onApprove, onSnooze, dismiss]
  );

  const clearAll = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    setNotifications([]);
  }, []);

  return { notifications, push, dismiss, handleAction, clearAll };
}
