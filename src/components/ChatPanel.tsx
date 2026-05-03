"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/types/emma";
import type { ContextStats } from "@/core/context-manager";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import { InputBar } from "./InputBar";
import { ContextIndicator } from "./ContextIndicator";

interface UsageWarning {
  message: string;
  window: string | null;
}

interface UsageBlocked {
  upgradeUrl: string;
}

interface ChatPanelProps {
  messages: ChatMessageType[];
  loading: boolean;
  onSend: (text: string) => void;
  onVoice: () => void;
  voiceSupported: boolean;
  listening: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  contextStats?: ContextStats;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  usageWarning?: UsageWarning | null;
  usageBlocked?: UsageBlocked | null;
  onDismissWarning?: () => void;
}

export function ChatPanel({
  messages, loading, onSend, onVoice, voiceSupported,
  listening, ttsEnabled, onToggleTts, contextStats,
  onTypingStart, onTypingStop,
  usageWarning, usageBlocked, onDismissWarning,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, usageWarning, usageBlocked]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {loading && <TypingIndicator />}

        {/* Usage warning — amber left-border annotation below last bubble */}
        {usageWarning && !usageBlocked && (
          <div style={{
            borderLeft: "2px solid rgba(217, 119, 6, 0.5)",
            background: "rgba(217, 119, 6, 0.04)",
            borderRadius: "0 8px 8px 0",
            padding: "8px 12px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "8px",
            marginLeft: "12px",
          }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "12px", color: "rgba(252, 211, 77, 0.7)", lineHeight: "1.4", fontStyle: "italic" }}>
                {usageWarning.message}
              </p>
              <Link
                href="/settings/billing?addon=extra_pack"
                style={{ fontSize: "11px", color: "rgba(252, 211, 77, 0.5)", textDecoration: "none", marginTop: "4px", display: "inline-block" }}
              >
                Get extra time →
              </Link>
            </div>
            {onDismissWarning && (
              <button
                onClick={onDismissWarning}
                style={{ color: "rgba(252, 211, 77, 0.3)", background: "none", border: "none", cursor: "pointer", padding: "0", lineHeight: 1 }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Usage blocked — compact CTA card below Emma's block message */}
        {usageBlocked && (
          <div style={{
            border: "1px solid rgba(232,160,191,0.15)",
            background: "rgba(232,160,191,0.04)",
            borderRadius: "12px",
            padding: "12px 16px",
            marginLeft: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(232,160,191,0.7)" }}>Get Extra Responses</span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(232,160,191,0.6)" }}>$9</span>
            </div>
            <p style={{ fontSize: "11px", color: "rgba(232,160,191,0.35)", lineHeight: "1.4" }}>
              500 extra messages, valid for 30 days
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
              <Link
                href="/settings/billing?addon=extra_pack"
                style={{
                  fontSize: "11px",
                  color: "#1a1020",
                  background: "linear-gradient(135deg, rgba(232,160,191,0.9), rgba(168,93,154,0.9))",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Get Extra Time →
              </Link>
              <Link
                href="/settings/billing"
                style={{ fontSize: "11px", color: "rgba(232,160,191,0.4)", textDecoration: "none" }}
              >
                Or upgrade →
              </Link>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {contextStats && <ContextIndicator stats={contextStats} />}

      <InputBar
        onSend={onSend}
        onVoice={onVoice}
        voiceSupported={voiceSupported}
        listening={listening}
        ttsEnabled={ttsEnabled}
        onToggleTts={onToggleTts}
        disabled={loading}
        blocked={!!usageBlocked}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </div>
  );
}
