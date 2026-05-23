"use client";

import Link from "next/link";
import {
  Eye,
  Brain,
  Clock,
  Volume2,
  Settings,
  User,
  BarChart2,
  CreditCard,
  Plug,
  Cpu,
} from "lucide-react";
import type { PersonaId, EmotionState, UserProfile } from "@/types/emma";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const emotionEmoji =
    props.currentEmotion && props.currentEmotion.confidence > 0.3
      ? EMOTION_EMOJI[props.currentEmotion.primary] ?? null
      : null;

  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-surface-border bg-emma-950/80 backdrop-blur-2xl shrink-0">
      {/* ── Left: Logo ─────────────────────────────────────────────── */}
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

      {/* ── Right: Status dots + Settings dropdown ─────────────────── */}
      <div className="flex items-center gap-2">
        {/* Compact status indicators */}
        <div className="flex items-center gap-1.5">
          {props.visionActive && (
            <StatusDot color="emerald" label="Vision active">
              <Eye size={11} />
            </StatusDot>
          )}
          {props.memoryCount > 0 && (
            <StatusDot color="purple" label={`${props.memoryCount} memories`}>
              <Brain size={11} />
              <span className="text-[10px]">{props.memoryCount}</span>
            </StatusDot>
          )}
          {props.scheduleCount > 0 && (
            <StatusDot color="blue" label={`${props.scheduleCount} scheduled`}>
              <Clock size={11} />
              <span className="text-[10px]">{props.scheduleCount}</span>
            </StatusDot>
          )}
          {props.elConnected && (
            <StatusDot color="emerald" label="Voice connected">
              <Volume2 size={11} />
            </StatusDot>
          )}
          {emotionEmoji && (
            <StatusDot label={`Emotion: ${props.currentEmotion?.primary}`}>
              <span className="text-xs leading-none">{emotionEmoji}</span>
            </StatusDot>
          )}
        </div>

        {/* Active user pill — opens settings dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 text-[11px] font-light text-emma-200/40 bg-emma-300/4 border border-emma-300/8 rounded-full px-2.5 py-1 hover:text-emma-200/70 hover:border-emma-300/20 hover:bg-emma-300/8 transition-all"
              style={{ borderColor: `${props.activeUser.color}18` }}
              aria-label="Settings"
            >
              <span className="text-xs leading-none">{props.activeUser.avatar}</span>
              <span>{props.activeUser.name}</span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            {/* User info header */}
            <div className="flex items-center gap-2.5 px-2.5 py-2.5 border-b border-emma-300/8 mb-1">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emma-300/30 to-emma-400/30 flex items-center justify-center text-sm">
                {props.activeUser.avatar}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-emma-100/80 truncate">
                  {props.activeUser.name}
                </p>
                <p className="text-[10px] text-emma-200/30 capitalize">{props.persona} mode</p>
              </div>
            </div>

            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings/profile" className="flex items-center gap-2">
                  <User size={13} />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/integrations" className="flex items-center gap-2">
                  <Plug size={13} />
                  Integrations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/tasks" className="flex items-center gap-2">
                  <Cpu size={13} />
                  Tasks & Agent
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings/usage" className="flex items-center gap-2">
                  <BarChart2 size={13} />
                  Usage
                  {props.memoryCount > 0 && (
                    <span className="ml-auto text-[10px] text-emma-200/30">
                      {props.memoryCount} mem
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/billing" className="flex items-center gap-2">
                  <CreditCard size={13} />
                  Billing
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings size={13} />
                All settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function StatusDot({
  children,
  color,
  label,
}: {
  children: React.ReactNode;
  color?: "emerald" | "purple" | "blue";
  label?: string;
}) {
  const colorMap = {
    emerald: "text-emerald-300/50 bg-emerald-400/6 border-emerald-400/15",
    purple: "text-purple-300/50 bg-purple-400/6 border-purple-400/12",
    blue: "text-blue-300/50 bg-blue-400/6 border-blue-400/12",
  };
  const cls = color ? colorMap[color] : "text-emma-200/30 bg-emma-300/4 border-emma-300/8";

  return (
    <div
      className={`flex items-center gap-1 rounded-full px-2 py-1 border text-[10px] font-light ${cls}`}
      aria-label={label}
      role="status"
    >
      {children}
    </div>
  );
}
