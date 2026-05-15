"use client";

import { useState, useCallback } from "react";
import type {
  UserProfile,
  UserPreferences,
  AutonomyTier,
  DEFAULT_USER_PREFERENCES,
} from "@/types/emma";
import { uid } from "@/lib/utils";

// ─── Default Users ───────────────────────────────────────────────────────────

const DEFAULT_PREFS: UserPreferences = {
  preferredTemp: 72,
  lightBrightness: 70,
  lightColor: "warm white",
  ttsEnabled: true,
  notificationsEnabled: true,
};

const INITIAL_USERS: UserProfile[] = [
  {
    id: "user-primary",
    name: "You",
    avatar: "👤",
    color: "#e8a0bf",
    role: "admin",
    preferences: { ...DEFAULT_PREFS },
    createdAt: Date.now(),
  },
];

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseMultiUserReturn {
  users: UserProfile[];
  activeUser: UserProfile;
  switchUser: (id: string) => void;
  addUser: (name: string, avatar: string, role?: UserProfile["role"]) => UserProfile;
  removeUser: (id: string) => void;
  updatePreferences: (userId: string, prefs: Partial<UserPreferences>) => void;
  updateProfile: (userId: string, updates: Partial<UserProfile>) => void;
  setAutonomyOverride: (userId: string, routineId: string, tier: AutonomyTier) => void;
}

export function useMultiUser(): UseMultiUserReturn {
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [activeUserId, setActiveUserId] = useState("user-primary");

  const activeUser = users.find((u) => u.id === activeUserId) || users[0];

  const switchUser = useCallback((id: string) => {
    setActiveUserId(id);
  }, []);

  const addUser = useCallback(
    (name: string, avatar: string, role: UserProfile["role"] = "member") => {
      const newUser: UserProfile = {
        id: `user-${uid()}`,
        name,
        avatar,
        color: ACCENT_COLORS[users.length % ACCENT_COLORS.length],
        role,
        preferences: { ...DEFAULT_PREFS },
        createdAt: Date.now(),
      };
      setUsers((prev) => [...prev, newUser]);
      return newUser;
    },
    [users.length]
  );

  const removeUser = useCallback(
    (id: string) => {
      if (id === "user-primary") return; // Can't remove primary
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (activeUserId === id) setActiveUserId("user-primary");
    },
    [activeUserId]
  );

  const updatePreferences = useCallback((userId: string, prefs: Partial<UserPreferences>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, preferences: { ...u.preferences, ...prefs } } : u))
    );
  }, []);

  const updateProfile = useCallback((userId: string, updates: Partial<UserProfile>) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
  }, []);

  const setAutonomyOverride = useCallback(
    (userId: string, routineId: string, tier: AutonomyTier) => {
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          return {
            ...u,
            autonomyOverrides: { ...u.autonomyOverrides, [routineId]: tier },
          };
        })
      );
    },
    []
  );

  return {
    users,
    activeUser,
    switchUser,
    addUser,
    removeUser,
    updatePreferences,
    updateProfile,
    setAutonomyOverride,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  "#e8a0bf",
  "#7ee8a0",
  "#a0c4e8",
  "#e8d4a0",
  "#c4a0e8",
  "#e8a0a0",
  "#a0e8e8",
  "#e8bfa0",
];

/**
 * Serialize active user context for the system prompt.
 */
export function serializeUserContext(user: UserProfile): string {
  const prefs = user.preferences;
  return `Active user: ${user.name} (${user.role})
Preferred temp: ${prefs.preferredTemp}°F
Light preference: ${prefs.lightBrightness}%, ${prefs.lightColor}
TTS: ${prefs.ttsEnabled ? "on" : "off"}
Quiet hours: ${prefs.quietHoursStart ? `${prefs.quietHoursStart}–${prefs.quietHoursEnd}` : "none"}`;
}
