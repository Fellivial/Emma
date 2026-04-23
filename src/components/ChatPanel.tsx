"use client";

import { useRef, useEffect } from "react";
import type { ChatMessage as ChatMessageType } from "@/types/emma";
import type { ContextStats } from "@/core/context-manager";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import { InputBar } from "./InputBar";
import { ContextIndicator } from "./ContextIndicator";

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
}

export function ChatPanel({
  messages, loading, onSend, onVoice, voiceSupported,
  listening, ttsEnabled, onToggleTts, contextStats,
  onTypingStart, onTypingStop,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {loading && <TypingIndicator />}
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
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
      />
    </div>
  );
}
