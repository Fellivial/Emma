"use client";

import { useState, useEffect } from "react";

interface ApprovalBubbleProps {
  approvalId: string;
  tool: string;
  inputs: Record<string, string>;
  reason: string;
  expiresAt: number;
  onConfirm: (approvalId: string) => Promise<void>;
  onCancel: (approvalId: string) => Promise<void>;
}

function formatTimeLeft(expiresAt: number): string {
  const ms = Math.max(0, expiresAt - Date.now());
  if (ms < 5 * 60 * 1000) return "Expires soon";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

function InputValue({ tool, k, v }: { tool: string; k: string; v: string }) {
  if (tool === "send_email") {
    if (k === "to") return (
      <span style={{ background: "rgba(232,160,191,0.06)", border: "1px solid rgba(232,160,191,0.1)", borderRadius: 9999, padding: "2px 8px", fontSize: 10, fontFamily: "monospace", color: "rgba(232,160,191,0.6)" }}>
        {v}
      </span>
    );
    if (k === "subject") return <span style={{ fontStyle: "italic", color: "rgba(244,193,221,0.5)", fontSize: 11 }}>{v}</span>;
    if (k === "body") return <span style={{ fontFamily: "monospace", color: "rgba(200,180,210,0.4)", fontSize: 10, lineHeight: 1.5 }}>{v.length > 120 ? v.slice(0, 120) + "…" : v}</span>;
  }
  return <span style={{ color: "rgba(244,193,221,0.5)", fontSize: 11 }}>{v}</span>;
}

export function ApprovalBubble({ approvalId, tool, inputs, reason, expiresAt, onConfirm, onCancel }: ApprovalBubbleProps) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resolved, setResolved] = useState<"confirmed" | "cancelled" | null>(null);
  const [timeLeft, setTimeLeft] = useState(() => formatTimeLeft(expiresAt));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(formatTimeLeft(expiresAt)), 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (resolved) {
    return (
      <div style={{ padding: "4px 0 4px 36px", fontSize: 11, color: "rgba(244,193,221,0.25)" }}>
        ✓ Action {resolved}
      </div>
    );
  }

  const busy = confirming || cancelling;

  return (
    <div data-approval-id={approvalId} style={{ display: "flex", gap: 8, padding: "4px 0" }}>
      {/* Emma avatar */}
      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,rgba(232,160,191,0.3),rgba(168,93,154,0.2))", border: "1px solid rgba(232,160,191,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(232,160,191,0.7)", fontStyle: "italic" }}>
        E
      </div>

      {/* Card */}
      <div style={{ maxWidth: "88%", background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "4px 18px 18px 18px", padding: "12px 14px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(217,119,6,0.8)" }}>⚠ Action Required</span>
          <span style={{ fontSize: 10, color: "rgba(244,193,221,0.3)", fontFamily: "monospace" }}>{timeLeft}</span>
        </div>

        {/* Tool pill */}
        <span style={{ display: "inline-flex", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 9999, padding: "3px 10px", fontSize: 11, fontFamily: "monospace", color: "rgba(252,165,165,0.7)" }}>
          {tool}
        </span>

        {/* Inputs */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: "rgba(244,193,221,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Details</div>
          {Object.entries(inputs).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderBottom: "1px solid rgba(232,160,191,0.06)", padding: "4px 0" }}>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(244,193,221,0.25)", minWidth: 60, flexShrink: 0 }}>{k}:</span>
              <span style={{ flex: 1, minWidth: 0 }}><InputValue tool={tool} k={k} v={v} /></span>
            </div>
          ))}
        </div>

        {/* Reason */}
        <div style={{ fontSize: 10, color: "rgba(244,193,221,0.25)", fontStyle: "italic", marginTop: 8 }}>{reason}</div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={async () => {
              setConfirming(true);
              try { await onConfirm(approvalId); setResolved("confirmed"); }
              finally { setConfirming(false); }
            }}
            disabled={busy}
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "rgba(52,211,153,0.85)", borderRadius: 9999, padding: "6px 16px", fontSize: 12, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}
          >
            {confirming ? "Confirming…" : "Confirm"}
          </button>
          <button
            onClick={async () => {
              setCancelling(true);
              try { await onCancel(approvalId); setResolved("cancelled"); }
              finally { setCancelling(false); }
            }}
            disabled={busy}
            style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", color: "rgba(248,113,113,0.6)", borderRadius: 9999, padding: "6px 16px", fontSize: 12, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
