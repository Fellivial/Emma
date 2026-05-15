"use client";

import type {
  PillarStatus,
  EmotionState,
  MemoryEntry,
  ScheduleEntry,
  TimelineEntry,
  UserProfile,
} from "@/types/emma";

interface DashboardProps {
  visionActive: boolean;
  memories: MemoryEntry[];
  schedules: ScheduleEntry[];
  timelineEntries: TimelineEntry[];
  currentEmotion: EmotionState | null;
  activeUser: UserProfile;
  userCount: number;
  ttsBackend: string;
}

export function Dashboard(props: DashboardProps) {
  const pillars: PillarStatus[] = [
    {
      id: "voice",
      name: "P1 — Voice",
      icon: "🎙️",
      status: "online",
      detail: `TTS: ${props.ttsBackend === "elevenlabs" ? "ElevenLabs" : "Web Speech"}`,
      metrics: { backend: props.ttsBackend },
    },
    {
      id: "vision",
      name: "P2 — Vision",
      icon: "👁️",
      status: props.visionActive ? "online" : "offline",
      detail: props.visionActive ? "Screen sharing active" : "Screen share off",
      metrics: { active: props.visionActive ? "yes" : "no" },
    },
    {
      id: "brain",
      name: "P3 — Brain",
      icon: "🧠",
      status: "online",
      detail: "Workspace orchestration active",
      metrics: {},
    },
    {
      id: "personality",
      name: "P4 — Personality",
      icon: "💜",
      status: "online",
      detail: `${props.memories.length} memories • ${props.activeUser.name}${
        props.currentEmotion
          ? ` • ${EMOTION_EMOJI[props.currentEmotion.primary] || "😐"} ${props.currentEmotion.primary}`
          : ""
      }`,
      metrics: {
        memories: props.memories.length,
        users: props.userCount,
        emotion: props.currentEmotion?.primary || "unknown",
      },
    },
    {
      id: "proactive",
      name: "P5 — Proactive",
      icon: "⚡",
      status: props.schedules.some((s) => s.enabled) ? "online" : "degraded",
      detail: `${props.schedules.filter((s) => s.enabled).length} active schedules • ${props.timelineEntries.length} timeline events`,
      metrics: {
        activeSchedules: props.schedules.filter((s) => s.enabled).length,
        timelineEvents: props.timelineEntries.length,
      },
    },
  ];

  return (
    <div className="flex-1 overflow-auto flex flex-col gap-2 px-3 pb-3 pt-1">
      {/* User card */}
      <div className="rounded-xl border border-surface-border bg-surface p-3 animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{props.activeUser.avatar}</span>
          <div>
            <div className="text-xs font-medium text-emma-200/70">{props.activeUser.name}</div>
            <div className="text-[10px] text-emma-200/30">
              {props.activeUser.role} • {props.userCount} user{props.userCount !== 1 ? "s" : ""}
            </div>
          </div>
          {props.currentEmotion && (
            <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface border border-surface-border">
              <span className="text-sm">{EMOTION_EMOJI[props.currentEmotion.primary]}</span>
              <span className="text-[10px] text-emma-200/40">{props.currentEmotion.primary}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pillar status cards */}
      {pillars.map((p) => (
        <div
          key={p.id}
          className={`rounded-xl border p-3 animate-fade-in ${
            p.status === "online"
              ? "border-emerald-400/10 bg-emerald-400/3"
              : p.status === "degraded"
                ? "border-amber-400/10 bg-amber-400/3"
                : "border-surface-border bg-surface"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">{p.icon}</span>
              <span className="text-xs font-medium text-emma-200/60">{p.name}</span>
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                p.status === "online"
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                  : p.status === "degraded"
                    ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]"
                    : "bg-red-400/50"
              }`}
            />
          </div>
          <p className="text-[11px] font-light text-emma-200/35">{p.detail}</p>
        </div>
      ))}
    </div>
  );
}

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
