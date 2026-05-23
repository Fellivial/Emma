"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/types/emma";
import { ShiningText } from "@/components/ui/shining-text";

interface ChatMessageProps {
  message: ChatMessageType;
}

function FeedbackButtons({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);

  const give = async (r: "up" | "down") => {
    if (rating) return;
    setRating(r);
    await fetch("/api/emma/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, rating: r }),
    });
  };

  return (
    <div className="flex items-center gap-1 mt-1 ml-9 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => give("up")}
        className={`p-1 rounded transition-colors ${
          rating === "up"
            ? "text-emma-300"
            : "text-emma-200/20 hover:text-emma-200/50"
        }`}
        aria-label="Helpful"
        disabled={!!rating}
      >
        <ThumbsUp size={11} />
      </button>
      <button
        onClick={() => give("down")}
        className={`p-1 rounded transition-colors ${
          rating === "down"
            ? "text-emma-400/70"
            : "text-emma-200/20 hover:text-emma-200/50"
        }`}
        aria-label="Not helpful"
        disabled={!!rating}
      >
        <ThumbsDown size={11} />
      </button>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex flex-col animate-fade-in ${isUser ? "items-end" : "items-start"} group`}
    >
      <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
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

      {!isUser && <FeedbackButtons messageId={message.id} />}
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
