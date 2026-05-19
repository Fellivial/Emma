"use client";

import type { ChatMessage as ChatMessageType } from "@/types/emma";
import { ShiningText } from "@/components/ui/shining-text";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-end gap-2 animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}
    >
      {/* Emma avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
          <span className="font-display text-sm italic text-emma-950">E</span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[75%] px-3.5 py-2.5 text-sm font-light leading-relaxed ${
          isUser
            ? "bg-emerald-500/10 border border-emerald-500/15 rounded-2xl rounded-br-sm text-emerald-200/80"
            : "bg-surface border border-surface-border rounded-2xl rounded-bl-sm text-emma-200/80"
        }`}
      >
        {message.display}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
        <span className="font-display text-sm italic text-emma-950">E</span>
      </div>
      <div className="bg-surface border border-surface-border rounded-2xl rounded-bl-sm px-4 py-3">
        <ShiningText text="Emma is thinking…" />
      </div>
    </div>
  );
}
