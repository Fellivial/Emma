"use client";

import Link from "next/link";
import { Eye, Brain, Clock, Volume2, Settings } from "lucide-react";
import type { PersonaId, EmotionState, UserProfile } from "@/types/emma";

const EMOTION_EMOJI: Record<string, string> = {
  neutral: "😐",
  happy: "😊",
  sad: "😢",
  angry: "😠",
  anxious: "😰",
  tired: "😴",
  excited: "🤩",
  frustrated: "😤",
  calm: "😌",
  stressed: "😬",
};

interface HeaderProps {
  persona: PersonaId;
  visionActive: boolean;
  elConnected: boolean;
  elVoiceName?: string | null;
  memoryCount: number;
  scheduleCount: number;
  activeUser: UserProfile;
  currentEmotion: EmotionState | null;
}

export function Header(props: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-surface-border bg-emma-950/80 backdrop-blur-2xl shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
          <span className="font-display text-lg italic text-emma-950">E</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wider text-emma-300">EMMA</h1>
            <span className="text-[9px] font-light text-emma-200/15 bg-emma-300/5 border border-emma-300/10 rounded px-1.5 py-0.5 uppercase tracking-wider">
              v1
            </span>
          </div>
          <p className="text-[10px] font-light text-emma-200/25 uppercase tracking-[0.15em]">
            Workspace Agent
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Pill
          active={props.visionActive}
          color="emerald"
          ariaLabel={props.visionActive ? "Vision active" : "Vision inactive"}
        >
          <Eye size={12} />
        </Pill>
        {props.memoryCount > 0 && (
          <Pill color="purple" ariaLabel={`${props.memoryCount} memories stored`}>
            <Brain size={12} />
            {props.memoryCount}
          </Pill>
        )}
        {props.scheduleCount > 0 && (
          <Pill color="blue" ariaLabel={`${props.scheduleCount} scheduled tasks`}>
            <Clock size={12} />
            {props.scheduleCount}
          </Pill>
        )}
        {props.currentEmotion && props.currentEmotion.confidence > 0.3 && (
          <Pill>{EMOTION_EMOJI[props.currentEmotion.primary] || "😐"}</Pill>
        )}
        {/* Active user */}
        <div
          className="flex items-center gap-1 text-[11px] font-light text-emma-200/30 bg-surface border border-surface-border rounded-full px-2.5 py-1"
          style={{ borderColor: `${props.activeUser.color}20` }}
        >
          <span className="text-xs">{props.activeUser.avatar}</span>
          {props.activeUser.name}
        </div>
        <Pill active={props.elConnected} color={props.elConnected ? "emerald" : undefined}>
          <Volume2 size={12} />
          {props.elConnected ? `EL · ${props.elVoiceName?.slice(0, 10) ?? ""}` : "WS"}
        </Pill>
        <Link
          href="/settings"
          className="flex items-center gap-1 text-[10px] font-light text-emma-200/25 bg-surface border border-surface-border rounded-full px-2.5 py-1 hover:text-emma-200/50 hover:border-emma-300/20 transition-all"
        >
          <Settings size={12} /> Settings
        </Link>
      </div>
    </header>
  );
}

function Pill({
  children,
  dot,
  active,
  color,
  ariaLabel,
}: {
  children: React.ReactNode;
  dot?: string;
  active?: boolean;
  color?: string;
  ariaLabel?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: active ? "text-emerald-300/50 bg-emerald-400/5 border-emerald-400/15" : "",
    purple: "text-purple-300/40 bg-purple-400/5 border-purple-400/10",
    blue: active
      ? "text-blue-300/40 bg-blue-400/5 border-blue-400/10"
      : "text-emma-200/20 bg-surface border-surface-border",
  };
  const cls = (color && colorMap[color]) || "text-emma-200/25 bg-surface border-surface-border";
  return (
    <div
      className={`flex items-center gap-1 text-[10px] font-light rounded-full px-2 py-1 border ${cls}`}
      aria-label={ariaLabel}
      role={ariaLabel ? "status" : undefined}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: dot, boxShadow: `0 0 6px ${dot}` }}
        />
      )}
      {children}
    </div>
  );
}
