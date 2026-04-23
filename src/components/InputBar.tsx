"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Mic, Volume2, VolumeX, ArrowUp } from "lucide-react";

interface InputBarProps {
  onSend: (text: string) => void;
  onVoice: () => void;
  voiceSupported: boolean;
  listening: boolean;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  disabled: boolean;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export function InputBar({
  onSend, onVoice, voiceSupported, listening, ttsEnabled,
  onToggleTts, disabled, onTypingStart, onTypingStop,
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
          className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
            listening
              ? "bg-emma-300 border-emma-300 text-emma-950"
              : "bg-surface border-surface-active text-emma-300 hover:bg-surface-hover"
          }`}
          title="Tap to speak"
        >
          <Mic size={16} />
        </button>
      )}

      <input
        type="text"
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Talk to Emma…"
        className="flex-1 bg-surface border border-surface-border rounded-full px-4 py-2.5 text-sm font-light text-emma-100 placeholder:text-emma-200/20 outline-none focus:border-emma-300/30 transition-colors"
      />

      <button
        onClick={handleSend}
        disabled={!input.trim() || disabled}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center shrink-0 transition-opacity cursor-pointer disabled:opacity-20"
      >
        <ArrowUp size={16} className="text-emma-950" strokeWidth={2.5} />
      </button>

      <button
        onClick={onToggleTts}
        className={`w-9 h-9 rounded-full border border-surface-active flex items-center justify-center shrink-0 transition-opacity cursor-pointer ${
          ttsEnabled ? "opacity-100 bg-surface" : "opacity-30 bg-transparent"
        }`}
        title={ttsEnabled ? "TTS on" : "TTS off"}
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
