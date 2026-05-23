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
    <div className="flex items-center gap-1 mt-1.5 ml-9 opacity-0 group-hover:opacity-100 transition-opacity">
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

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in group">
        <div className="max-w-[80%] px-4 py-2.5 bg-[#1e1824] rounded-2xl rounded-tr-sm text-sm leading-relaxed text-white/85">
          {message.display}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col animate-fade-in group">
      <div className="flex items-start gap-2.5">
        {/* Emma avatar */}
        <div className="w-7 h-7 rounded-full shrink-0 mt-0.5 bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
          <span className="font-display text-sm italic text-emma-950">E</span>
        </div>

        {/* Plain text — no bubble background */}
        <div className="flex-1 text-sm leading-relaxed text-emma-100/80 pt-1">
          {message.display}
        </div>
      </div>

      <FeedbackButtons messageId={message.id} />
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full shrink-0 mt-0.5 bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
        <span className="font-display text-sm italic text-emma-950">E</span>
      </div>
      <div className="flex-1 pt-1.5">
        <ShiningText text="Emma is thinking…" />
      </div>
    </div>
  );
}
