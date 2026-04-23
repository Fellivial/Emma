"use client";

import { useState } from "react";
import type { UserProfile } from "@/types/emma";
import { UserPlus, Trash2, Check } from "lucide-react";

interface UserPanelProps {
  users: UserProfile[];
  activeUser: UserProfile;
  onSwitch: (id: string) => void;
  onAdd: (name: string, avatar: string) => void;
  onRemove: (id: string) => void;
}

const AVATARS = ["👤", "👩", "👨", "🧑", "👧", "👦", "🐱", "🐶", "🤖", "👽"];

export function UserPanel({ users, activeUser, onSwitch, onAdd, onRemove }: UserPanelProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState("👤");

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAdd(newName.trim(), newAvatar);
    setNewName("");
    setNewAvatar("👤");
    setAdding(false);
  };

  return (
    <div className="flex-1 overflow-auto flex flex-col gap-2 px-3 pb-3">
      {/* User cards */}
      {users.map((user) => {
        const isActive = user.id === activeUser.id;
        return (
          <div
            key={user.id}
            onClick={() => onSwitch(user.id)}
            className={`rounded-xl border p-3 cursor-pointer transition-all animate-fade-in ${
              isActive
                ? "border-emma-300/25 bg-emma-300/8"
                : "border-surface-border bg-surface hover:bg-surface-hover"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base"
                  style={{ backgroundColor: `${user.color}15`, border: `1px solid ${user.color}30` }}
                >
                  {user.avatar}
                </div>
                <div>
                  <div className="text-xs font-medium text-emma-200/70">{user.name}</div>
                  <div className="text-[10px] text-emma-200/25">{user.role}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isActive && (
                  <span className="text-[9px] text-emma-300 bg-emma-300/10 rounded-full px-2 py-0.5">
                    Active
                  </span>
                )}
                {user.id !== "user-primary" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(user.id); }}
                    className="p-1 text-emma-200/10 hover:text-red-400/50 cursor-pointer transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Preferences summary */}
            <div className="flex gap-2 mt-2 text-[9px] text-emma-200/20">
              <span>🌡️ {user.preferences.preferredTemp}°</span>
              <span>💡 {user.preferences.lightBrightness}%</span>
              <span>🔊 {user.preferences.ttsEnabled ? "on" : "off"}</span>
            </div>
          </div>
        );
      })}

      {/* Add user */}
      {adding ? (
        <div className="rounded-xl border border-emma-300/15 bg-surface p-3 animate-fade-in">
          <div className="flex gap-1 mb-2 flex-wrap">
            {AVATARS.map((av) => (
              <button
                key={av}
                onClick={() => setNewAvatar(av)}
                className={`w-7 h-7 rounded-md flex items-center justify-center text-sm cursor-pointer ${
                  newAvatar === av ? "bg-emma-300/15 border border-emma-300/25" : "hover:bg-surface-hover"
                }`}
              >
                {av}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="flex-1 bg-emma-950/50 border border-surface-border rounded-lg px-3 py-1.5 text-xs text-emma-100 placeholder:text-emma-200/15 outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="px-3 py-1.5 rounded-lg bg-emma-300/15 border border-emma-300/25 text-emma-300 text-xs cursor-pointer disabled:opacity-20"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-emma-300/10 text-emma-300/30 text-xs font-light hover:border-emma-300/20 hover:text-emma-300/50 cursor-pointer transition-all"
        >
          <UserPlus size={13} /> Add User
        </button>
      )}
    </div>
  );
}
