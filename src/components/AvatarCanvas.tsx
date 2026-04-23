"use client";

import { useEffect } from "react";
import type { AvatarState, AvatarExpression, AvatarLayout } from "@/types/emma";
import { Eye, EyeOff, Columns, Layers, PictureInPicture2 } from "lucide-react";

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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Animated avatar placeholder */}
          <div className="relative">
            {/* Glow ring */}
            <div
              className={`absolute -inset-4 rounded-full opacity-20 blur-xl transition-all duration-700 ${
                state.talking ? "bg-emma-300 scale-110" : "bg-emma-400/50 scale-100"
              }`}
            />
            {/* Face */}
            <div className={`
              w-32 h-32 rounded-full
              bg-gradient-to-br from-emma-300/20 to-emma-400/10
              border-2 border-emma-300/20
              flex items-center justify-center
              transition-all duration-500
              ${state.talking ? "scale-105" : "scale-100"}
            `}>
              <span className="text-5xl transition-all duration-300">
                {expr.emoji}
              </span>
            </div>

            {/* Breathing animation ring */}
            <div className="absolute -inset-1 rounded-full border border-emma-300/10 animate-pulse" />
          </div>

          {/* Name */}
          <div className="mt-4 text-sm font-display italic text-emma-300/60">Emma</div>
          <div className="text-[10px] text-emma-200/20 mt-1">
            {state.loaded ? "Live2D Active" : "Placeholder Mode"}
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
            <span className="w-1 h-1 rounded-full bg-emma-300 animate-pulse" style={{ animationDelay: "0.15s" }} />
            <span className="w-1 h-1 rounded-full bg-emma-300 animate-pulse" style={{ animationDelay: "0.3s" }} />
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

      {/* Layout selector */}
      <div className="absolute bottom-2 right-2 flex gap-1">
        {([
          { layout: "side" as AvatarLayout, icon: Columns, label: "Side" },
          { layout: "overlay" as AvatarLayout, icon: Layers, label: "Overlay" },
          { layout: "pip" as AvatarLayout, icon: PictureInPicture2, label: "PiP" },
        ]).map(({ layout, icon: Icon, label }) => (
          <button
            key={layout}
            onClick={() => onSetLayout(layout)}
            className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all ${
              state.layout === layout
                ? "bg-emma-300/20 text-emma-300"
                : "bg-black/40 text-white/20 hover:text-white/50"
            }`}
            title={label}
          >
            <Icon size={11} />
          </button>
        ))}
      </div>
    </div>
  );
}
