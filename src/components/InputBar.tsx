"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Mic, Eye, Volume2, VolumeX, ArrowUp } from "lucide-react";

interface InputBarProps {
  onSend: (text: string) => void;
  onVoice: () => void;
  voiceSupported: boolean;
  listening: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  disabled: boolean;
  blocked?: boolean;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  visionActive?: boolean;
  onVisionToggle?: () => void;
}

export function InputBar({
  onSend,
  onVoice,
  voiceSupported,
  listening,
  ttsEnabled,
  onToggleTts,
  disabled,
  blocked,
  onTypingStart,
  onTypingStop,
  visionActive,
  onVisionToggle,
}: InputBarProps) {
  const [input, setInput] = useState("");
  const typingRef = useRef(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
    // Stop typing state
    if (typingRef.current) {
      typingRef.current = false;
      onTypingStop?.();
    }
  };

  const handleChange = (value: string) => {
    setInput(value);

    // Typing awareness: notify when user starts/stops typing
    if (value.length > 0 && !typingRef.current) {
      typingRef.current = true;
      onTypingStart?.();
    }

    // Reset stop timer on each keystroke
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (typingRef.current) {
        typingRef.current = false;
        onTypingStop?.();
      }
    }, 2000); // 2s of no typing → stop
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-t border-surface-border bg-emma-950/60 backdrop-blur-xl">
      {voiceSupported && (
        <button
          onClick={onVoice}
          disabled={disabled}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          aria-pressed={listening}
          className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
            listening
              ? "bg-emma-300 border-emma-300 text-emma-950"
              : "bg-surface border-surface-active text-emma-300 hover:bg-surface-hover"
          }`}
        >
          <Mic size={16} />
        </button>
      )}

      {onVisionToggle && (
        <button
          onClick={onVisionToggle}
          aria-label={visionActive ? "Disable vision" : "Enable vision"}
          aria-pressed={!!visionActive}
          className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
            visionActive
              ? "bg-emerald-400/8 border-emerald-400/20 text-emerald-300/70"
              : "bg-transparent border-surface-border text-emma-200/30 hover:text-emma-200/50"
          }`}
        >
          <Eye size={15} />
        </button>
      )}

      <input
        type="text"
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || blocked}
        placeholder={
          blocked ? "Response limit reached — get extra time to continue" : "Talk to Emma…"
        }
        style={blocked ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        className="flex-1 bg-surface border border-surface-border rounded-2xl px-4 py-2.5 text-sm font-light text-emma-100 placeholder:text-emma-200/20 outline-none focus:border-emma-300/30 transition-colors"
      />

      <button
        onClick={handleSend}
        disabled={!input.trim() || disabled || !!blocked}
        aria-label="Send message"
        aria-disabled={!input.trim() || disabled || !!blocked}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center shrink-0 transition-opacity cursor-pointer disabled:opacity-20"
      >
        <ArrowUp size={16} className="text-emma-950" strokeWidth={2.5} />
      </button>

      <button
        onClick={onToggleTts}
        aria-label={ttsEnabled ? "Mute Emma" : "Unmute Emma"}
        aria-pressed={ttsEnabled}
        className={`w-9 h-9 rounded-full border border-surface-active flex items-center justify-center shrink-0 transition-opacity cursor-pointer ${
          ttsEnabled ? "opacity-100 bg-surface" : "opacity-30 bg-transparent"
        }`}
      >
        {ttsEnabled ? (
          <Volume2 size={15} className="text-emma-300" />
        ) : (
          <VolumeX size={15} className="text-emma-300" />
        )}
      </button>
    </div>
  );
}
