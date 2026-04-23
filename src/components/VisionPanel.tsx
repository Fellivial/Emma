"use client";

import type { VisionAnalysis } from "@/types/emma";
import { Monitor, MonitorOff, Camera, Loader } from "lucide-react";

interface VisionPanelProps {
  active: boolean;
  supported: boolean;
  analyzing: boolean;
  lastAnalysis: VisionAnalysis | null;
  previewRef: React.RefObject<HTMLVideoElement>;
  onToggle: () => void;
  onAnalyze: () => void;
}

export function VisionPanel({
  active, supported, analyzing, lastAnalysis,
  previewRef, onToggle, onAnalyze,
}: VisionPanelProps) {
  if (!supported) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-emma-200/20 font-light px-4 text-center">
        Screen sharing not available in this browser
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto flex flex-col gap-3 px-3 pb-3">
      {/* Screen capture preview */}
      <div className="relative rounded-xl overflow-hidden border border-surface-border bg-black/40 aspect-video">
        <video
          ref={previewRef}
          className="w-full h-full object-contain"
          muted
          playsInline
          style={{ display: active ? "block" : "none" }}
        />

        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <MonitorOff size={24} className="text-emma-200/15" />
            <span className="text-[11px] text-emma-200/20 font-light">Screen share off</span>
          </div>
        )}

        {analyzing && (
          <div className="absolute inset-0 bg-emma-950/60 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-emma-300">
              <Loader size={14} className="animate-spin" />
              Analyzing screen…
            </div>
          </div>
        )}

        {active && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-white/60">SHARING</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={onToggle}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-light border transition-all cursor-pointer ${
            active
              ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-300"
              : "bg-surface border-surface-border text-emma-200/40 hover:bg-surface-hover"
          }`}
        >
          {active ? <Monitor size={13} /> : <MonitorOff size={13} />}
          {active ? "Sharing" : "Share Screen"}
        </button>

        <button
          onClick={onAnalyze}
          disabled={!active || analyzing}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-light border bg-surface border-surface-border text-emma-200/40 hover:bg-surface-hover transition-all cursor-pointer disabled:opacity-20"
        >
          <Camera size={13} />
          Analyze Screen
        </button>
      </div>

      {/* Last analysis */}
      {lastAnalysis && (
        <div className="rounded-xl border border-surface-border bg-surface p-3 animate-fade-in">
          <div className="text-[10px] font-medium text-emma-200/30 uppercase tracking-widest mb-2">
            Screen Analysis
          </div>
          <p className="text-xs font-light text-emma-200/60 leading-relaxed mb-2">
            {lastAnalysis.description}
          </p>

          {lastAnalysis.objects.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {lastAnalysis.objects.map((obj, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emma-300/8 border border-emma-300/10 text-emma-200/40">
                  {obj}
                </span>
              ))}
            </div>
          )}

          {lastAnalysis.activities.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {lastAnalysis.activities.map((act, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/8 border border-emerald-400/10 text-emerald-300/40">
                  {act}
                </span>
              ))}
            </div>
          )}

          {lastAnalysis.anomalies.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {lastAnalysis.anomalies.map((a, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/8 border border-amber-400/10 text-amber-300/40">
                  ⚠ {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
