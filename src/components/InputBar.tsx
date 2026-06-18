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
  transcript?: string;
  voiceError?: string | null;
  onVoiceErrorClear?: () => void;
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
  transcript,
  voiceError,
  onVoiceErrorClear,
}: InputBarProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea up to ~200px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Merge voice transcript into the textarea when it changes
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
      textareaRef.current?.focus();
    }
  }, [transcript]);

  // Auto-clear voice error after 8s so the hint doesn't persist indefinitely
  useEffect(() => {
    if (!voiceError || !onVoiceErrorClear) return;
    const id = setTimeout(onVoiceErrorClear, 8000);
    return () => clearTimeout(id);
  }, [voiceError, onVoiceErrorClear]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled || blocked) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (typingRef.current) {
      typingRef.current = false;
      onTypingStop?.();
    }
  };

  const handleChange = (value: string) => {
    setInput(value);
    if (value.length > 0 && !typingRef.current) {
      typingRef.current = true;
      onTypingStart?.();
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (typingRef.current) {
        typingRef.current = false;
        onTypingStop?.();
      }
    }, 2000);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const hasContent = input.trim().length > 0;

  return (
    <div className="relative px-3 pb-3 pt-2">
      {/* Floating card */}
      <div
        className="flex flex-col rounded-2xl border transition-all duration-200 bg-emma-900/70 backdrop-blur-xl border-surface-border shadow-[0_4px_24px_rgba(0,0,0,0.45)] hover:border-emma-300/15"
      >
        {/* Textarea */}
        <div className="px-4 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || blocked}
            placeholder={
              blocked ? "Response limit reached — get extra time to continue" : "Talk to Emma…"
            }
            aria-label="Message Emma"
            rows={1}
            className="w-full bg-transparent border-none outline-none resize-none text-sm font-light text-emma-100 placeholder:text-emma-200/20 leading-relaxed overflow-hidden block"
            style={{ minHeight: "1.5rem" }}
          />
        </div>

        {/* Voice error hint */}
        {voiceError && (
          <p className="px-4 pb-1 text-xs text-red-400/70">
            {voiceError === "not-allowed"
              ? "Microphone access was denied — check browser permissions"
              : voiceError === "no-speech"
                ? "No speech detected — try speaking after clicking the mic"
                : voiceError === "service-not-allowed"
                  ? "Speech recognition is not available in this browser"
                  : "Microphone error — check your audio device"}
          </p>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
          {/* Left tools */}
          <div className="flex items-center gap-1 flex-1">
            {voiceSupported && (
              <button
                onClick={onVoice}
                disabled={disabled}
                aria-label={listening ? "Stop listening" : "Start voice input"}
                aria-pressed={listening}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer disabled:opacity-30 ${
                  listening
                    ? "bg-emma-300 text-emma-950"
                    : "text-emma-200/40 hover:text-emma-300/70 hover:bg-emma-300/8"
                }`}
              >
                <Mic size={15} />
              </button>
            )}

            {onVisionToggle && (
              <button
                onClick={onVisionToggle}
                disabled={disabled}
                aria-label={visionActive ? "Disable vision" : "Enable vision"}
                aria-pressed={!!visionActive}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer disabled:opacity-30 ${
                  visionActive
                    ? "text-emerald-300/70 bg-emerald-400/8"
                    : "text-emma-200/40 hover:text-emma-200/60 hover:bg-emma-300/8"
                }`}
              >
                <Eye size={15} />
              </button>
            )}
          </div>

          {/* Right tools */}
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleTts}
              aria-label={ttsEnabled ? "Mute Emma" : "Unmute Emma"}
              aria-pressed={ttsEnabled}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                ttsEnabled
                  ? "text-emma-300/60 hover:text-emma-300"
                  : "text-emma-200/30 hover:text-emma-200/50"
              }`}
            >
              {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>

            <button
              onClick={handleSend}
              disabled={!hasContent || disabled || !!blocked}
              aria-label="Send message"
              aria-disabled={!hasContent || disabled || !!blocked}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                hasContent && !disabled && !blocked
                  ? "bg-gradient-to-br from-emma-300 to-emma-400 text-emma-950 hover:opacity-90 shadow-md shadow-black/20"
                  : "bg-emma-300/15 text-emma-950/30 cursor-default"
              }`}
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
