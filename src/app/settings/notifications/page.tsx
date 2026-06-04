"use client";

import { useState, useEffect } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Status = "loading" | "unsupported" | "denied" | "enabled" | "disabled";

export default function NotificationsPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !VAPID_PUBLIC_KEY) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    fetch("/api/emma/push/subscribe")
      .then((r) => r.json())
      .then((d) => setStatus(d.subscribed ? "enabled" : "disabled"))
      .catch(() => setStatus("disabled"));
  }, []);

  async function enable() {
    setError(null);
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });

      const res = await fetch("/api/emma/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (!res.ok) throw new Error("Failed to save subscription");
      setStatus("enabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    setError(null);
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint ?? null;

      if (sub) await sub.unsubscribe();

      await fetch("/api/emma/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });

      setStatus("disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-base font-semibold text-emma-200/90 mb-1">Notifications</h1>
      <p className="text-sm text-emma-200/40 mb-8">
        Receive a push notification when Emma needs your approval for an autonomous action — even
        when the tab is closed.
      </p>

      <div className="rounded-2xl border border-surface-border bg-emma-950/60 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-emma-200/80">Approval notifications</p>
            <p className="text-xs text-emma-200/35 mt-0.5">
              {status === "unsupported"
                ? "Push notifications are not supported in this browser."
                : status === "denied"
                  ? "Notifications are blocked. Allow them in your browser settings to continue."
                  : status === "enabled"
                    ? "You will be notified when Emma requests approval."
                    : "Emma will notify you when an autonomous task needs your sign-off."}
            </p>
          </div>

          {status === "loading" && (
            <span className="text-xs text-emma-200/30 shrink-0 mt-0.5">Checking…</span>
          )}

          {(status === "disabled" || status === "enabled") && (
            <button
              onClick={status === "enabled" ? disable : enable}
              disabled={working}
              className={`shrink-0 px-4 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                status === "enabled"
                  ? "border border-surface-border text-emma-200/50 hover:text-emma-200/70"
                  : "bg-emma-300/15 border border-emma-300/20 text-emma-300 hover:bg-emma-300/20"
              }`}
            >
              {working ? "…" : status === "enabled" ? "Disable" : "Enable"}
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-400/80">{error}</p>}

        {status === "enabled" && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emma-300/70 animate-pulse" />
            <span className="text-xs text-emma-200/40">Active on this device</span>
          </div>
        )}
      </div>

      {!VAPID_PUBLIC_KEY && (
        <p className="mt-6 text-xs text-yellow-400/60">
          <strong>Dev note:</strong> Set{" "}
          <code className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and{" "}
          <code className="font-mono">VAPID_PRIVATE_KEY</code> to enable push notifications.
        </p>
      )}
    </div>
  );
}
