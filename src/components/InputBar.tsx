"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { Mic, Eye, Volume2, VolumeX, ArrowUp, Plus, X, FileText } from "lucide-react";

interface AttachedFile {
  id: string;
  file: File;
  preview: string | null;
}

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
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea up to ~200px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

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

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles = Array.from(fileList).map((file) => ({
      id: Math.random().toString(36).slice(2, 9),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const hasContent = input.trim().length > 0;

  return (
    <div
      className="relative px-3 pb-3 pt-2"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Floating card */}
      <div
        className={`flex flex-col rounded-2xl border transition-all duration-200 bg-emma-900/70 backdrop-blur-xl ${
          isDragging
            ? "border-emma-300/40 shadow-[0_0_0_2px_rgba(232,160,191,0.12)]"
            : "border-surface-border shadow-[0_4px_24px_rgba(0,0,0,0.45)] hover:border-emma-300/15"
        }`}
      >
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex gap-2 px-3 pt-3 overflow-x-auto pb-1">
            {files.map((f) => (
              <FilePreview
                key={f.id}
                file={f}
                onRemove={(id) => setFiles((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}

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

        {/* Action bar */}
        <div className="flex items-center gap-1 px-3 pb-3 pt-1">
          {/* Left tools */}
          <div className="flex items-center gap-0.5 flex-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              type="button"
              aria-label="Attach file"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-emma-200/25 hover:text-emma-300/70 hover:bg-emma-300/8 transition-colors cursor-pointer"
            >
              <Plus size={16} />
            </button>

            {voiceSupported && (
              <button
                onClick={onVoice}
                disabled={disabled}
                aria-label={listening ? "Stop listening" : "Start voice input"}
                aria-pressed={listening}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer disabled:opacity-30 ${
                  listening
                    ? "bg-emma-300 text-emma-950"
                    : "text-emma-200/25 hover:text-emma-300/70 hover:bg-emma-300/8"
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
                    : "text-emma-200/25 hover:text-emma-200/50 hover:bg-emma-300/8"
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
                  ? "text-emma-300/50 hover:text-emma-300"
                  : "text-emma-200/15 hover:text-emma-200/35"
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

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-3 bg-emma-950/85 border-2 border-dashed border-emma-300/35 rounded-2xl z-50 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
          <FileText size={28} className="text-emma-300/50 mb-1.5" />
          <p className="text-xs font-light text-emma-300/50">Drop files to attach</p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function FilePreview({ file, onRemove }: { file: AttachedFile; onRemove: (id: string) => void }) {
  return (
    <div className="relative group flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-surface-border bg-emma-950/60">
      {file.preview ? (
        <img src={file.preview} alt={file.file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <FileText size={14} className="text-emma-200/30" />
        </div>
      )}
      <button
        onClick={() => onRemove(file.id)}
        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove file"
      >
        <X size={8} className="text-white" />
      </button>
    </div>
  );
}
