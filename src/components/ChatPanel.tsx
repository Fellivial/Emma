"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { ChatMessage as ChatMessageType, ApprovalDetails } from "@/types/emma";
import type { ContextStats } from "@/core/context-manager";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import { InputBar } from "./InputBar";
import { ContextIndicator } from "./ContextIndicator";
import { ApprovalBubble } from "./ApprovalBubble";
import { AgentPlan } from "@/components/ui/agent-plan";
import type { AgentTask } from "@/components/ui/agent-plan";

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
  historyLoading?: boolean;
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
  pendingApprovals?: ApprovalDetails[];
  onApprove?: (approvalId: string) => Promise<void>;
  onCancelApproval?: (approvalId: string) => Promise<void>;
  visionActive?: boolean;
  onVisionToggle?: () => void;
  agentPlan?: AgentTask[];
  transcript?: string;
  voiceError?: string | null;
  onVoiceErrorClear?: () => void;
}

export function ChatPanel({
  messages,
  loading,
  historyLoading,
  onSend,
  onVoice,
  voiceSupported,
  listening,
  ttsEnabled,
  onToggleTts,
  contextStats,
  onTypingStart,
  onTypingStop,
  usageWarning,
  usageBlocked,
  onDismissWarning,
  pendingApprovals,
  onApprove,
  onCancelApproval,
  visionActive,
  onVisionToggle,
  agentPlan,
  transcript,
  voiceError,
  onVoiceErrorClear,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading, usageWarning, usageBlocked]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="emma-chat-scroll flex-1 overflow-auto px-5 py-4 flex flex-col gap-3"
      >
        {historyLoading && messages.length === 0 && (
          <div className="flex items-end gap-2 animate-fade-in">
            <div className="w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-emma-300/30 to-emma-400/30" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-48 rounded-full bg-emma-200/6 animate-pulse" />
              <div className="h-3.5 w-36 rounded-full bg-emma-200/4 animate-pulse" />
              <div className="h-3.5 w-24 rounded-full bg-emma-200/3 animate-pulse" />
            </div>
          </div>
        )}
        {messages
          .filter((msg) => msg.role === "user" || !!msg.display)
          .map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        {pendingApprovals &&
          pendingApprovals.map((approval) => (
            <ApprovalBubble
              key={approval.approvalId}
              approvalId={approval.approvalId}
              tool={approval.tool}
              inputs={approval.inputs}
              reason={approval.reason}
              expiresAt={approval.expiresAt}
              onConfirm={onApprove ?? (() => Promise.resolve())}
              onCancel={onCancelApproval ?? (() => Promise.resolve())}
            />
          ))}
        {loading && agentPlan && agentPlan.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
              <span className="font-display text-sm italic text-emma-950">E</span>
            </div>
            <div className="flex-1 min-w-0">
              <AgentPlan tasks={agentPlan} />
            </div>
          </div>
        )}
        {loading &&
          (!agentPlan || agentPlan.length === 0) &&
          (() => {
            const last = messages[messages.length - 1];
            return !last || last.role === "user" || !last.display;
          })() && <TypingIndicator />}

        {/* Usage warning — amber left-border annotation below last bubble */}
        {usageWarning && !usageBlocked && (
          <div
            style={{
              borderLeft: "2px solid rgba(217, 119, 6, 0.5)",
              background: "rgba(217, 119, 6, 0.04)",
              borderRadius: "0 8px 8px 0",
              padding: "8px 12px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "8px",
              marginLeft: "12px",
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(252, 211, 77, 0.7)",
                  lineHeight: "1.4",
                  fontStyle: "italic",
                }}
              >
                {usageWarning.message}
              </p>
              <Link
                href="/settings/billing?addon=extra_pack"
                style={{
                  fontSize: "11px",
                  color: "rgba(252, 211, 77, 0.5)",
                  textDecoration: "none",
                  marginTop: "4px",
                  display: "inline-block",
                }}
              >
                Get extra time →
              </Link>
            </div>
            {onDismissWarning && (
              <button
                onClick={onDismissWarning}
                style={{
                  color: "rgba(252, 211, 77, 0.3)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0",
                  lineHeight: 1,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Usage blocked — compact CTA card below Emma's block message */}
        {usageBlocked && (
          <div
            style={{
              border: "1px solid rgba(232,160,191,0.15)",
              background: "rgba(232,160,191,0.04)",
              borderRadius: "12px",
              padding: "12px 16px",
              marginLeft: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(232,160,191,0.7)" }}>
                Get Extra Responses
              </span>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(232,160,191,0.6)" }}>
                $9
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "rgba(232,160,191,0.35)", lineHeight: "1.4" }}>
              500K extra tokens, valid for 30 days
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
              <Link
                href="/settings/billing?addon=extra_pack"
                style={{
                  fontSize: "11px",
                  color: "#1a1020",
                  background:
                    "linear-gradient(135deg, rgba(232,160,191,0.9), rgba(168,93,154,0.9))",
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
        visionActive={visionActive}
        onVisionToggle={onVisionToggle}
        transcript={transcript}
        voiceError={voiceError}
        onVoiceErrorClear={onVoiceErrorClear}
      />
    </div>
  );
}
