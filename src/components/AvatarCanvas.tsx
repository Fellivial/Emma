"use client";

import { useEffect } from "react";
import type { AvatarState, AvatarExpression, AvatarLayout } from "@/types/emma";
import { Eye, EyeOff } from "lucide-react";

const EXPRESSION_EMOJI: Record<AvatarExpression, { emoji: string; label: string }> = {
  neutral: { emoji: "😌", label: "Neutral" },
  smirk: { emoji: "😏", label: "Smirk" },
  warm: { emoji: "🥰", label: "Warm" },
  concerned: { emoji: "😟", label: "Concerned" },
  amused: { emoji: "😄", label: "Amused" },
  skeptical: { emoji: "🤨", label: "Skeptical" },
  listening: { emoji: "👂", label: "Listening" },
  flirty: { emoji: "😘", label: "Flirty" },
  sad: { emoji: "😢", label: "Sad" },
  idle_bored: { emoji: "🙄", label: "Bored" },
};

interface AvatarCanvasProps {
  state: AvatarState;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onInit: () => void;
  onToggleVisible: () => void;
  onSetLayout: (layout: AvatarLayout) => void;
}

export function AvatarCanvas({
  state,
  canvasRef,
  onInit,
  onToggleVisible,
  onSetLayout,
}: AvatarCanvasProps) {
  // Auto-init on mount
  useEffect(() => {
    onInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expr = EXPRESSION_EMOJI[state.expression] || EXPRESSION_EMOJI.neutral;

  if (!state.visible) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-emma-950/60">
        <button
          onClick={onToggleVisible}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-surface-border text-emma-200/30 text-xs hover:text-emma-300 cursor-pointer transition-all"
        >
          <Eye size={14} /> Show Avatar
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Live2D Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: state.loaded ? "auto" : "none" }}
      />

      {/* CSS Placeholder (when model not loaded) */}
      {!state.loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0 pb-8">
          {/* Avatar circle */}
          <div className="relative">
            {/* Ambient glow */}
            <div
              className={`absolute -inset-6 rounded-full blur-2xl transition-all duration-700 ${
                state.talking ? "opacity-25 bg-emma-300" : "opacity-8 bg-emma-400"
              }`}
            />
            {/* Circle */}
            <div
              className={`
              relative w-[148px] h-[148px] rounded-full
              bg-gradient-to-br from-emma-900/80 via-emma-950/90 to-black/60
              border border-emma-300/12
              flex items-center justify-center
              transition-all duration-500
              ${state.talking ? "scale-[1.03] border-emma-300/20" : "scale-100"}
            `}
            >
              <span className="font-display text-[72px] font-light text-emma-300/18 select-none leading-none">
                E
              </span>
              <div className="absolute inset-0 rounded-full border border-emma-300/6 animate-pulse" />
            </div>

            {/* Status dot */}
            <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-emerald-400 border-2 border-emma-950 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
          </div>

          {/* Identity */}
          <div className="mt-4 text-sm font-display italic text-emma-300/80 tracking-wide">
            Emma
          </div>
          <div className="text-[10px] font-light text-emma-200/25 mt-1 cursor-pointer hover:text-emma-200/40 transition-colors">
            Click to preview voice
          </div>

          {/* Model status */}
          <div className="absolute bottom-14 left-0 right-0 text-center">
            <span className="text-[9px] font-light tracking-[0.2em] text-emma-200/12 uppercase">
              Live2D model not loaded
            </span>
          </div>
        </div>
      )}

      {/* Expression indicator overlay */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
        <span className="text-xs">{expr.emoji}</span>
        <span className="text-[10px] text-white/50">{expr.label}</span>
        {state.talking && (
          <span className="flex gap-0.5 ml-1">
            <span className="w-1 h-1 rounded-full bg-emma-300 animate-pulse" />
            <span
              className="w-1 h-1 rounded-full bg-emma-300 animate-pulse"
              style={{ animationDelay: "0.15s" }}
            />
            <span
              className="w-1 h-1 rounded-full bg-emma-300 animate-pulse"
              style={{ animationDelay: "0.3s" }}
            />
          </span>
        )}
      </div>

      {/* Controls overlay */}
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          onClick={onToggleVisible}
          className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/30 hover:text-white/60 cursor-pointer transition-colors"
          title="Hide avatar"
        >
          <EyeOff size={12} />
        </button>
      </div>

      {/* Layout selector — text pill tabs */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
        {(["side", "overlay", "pip"] as AvatarLayout[]).map((layout) => (
          <button
            key={layout}
            onClick={() => onSetLayout(layout)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-light border cursor-pointer transition-all ${
              state.layout === layout
                ? "bg-emma-300/15 border-emma-300/25 text-emma-300/80"
                : "bg-black/30 border-white/8 text-white/20 hover:text-white/40 hover:border-white/15"
            }`}
          >
            {layout}
          </button>
        ))}
      </div>
    </div>
  );
}
