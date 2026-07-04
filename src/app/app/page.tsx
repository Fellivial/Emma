"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Settings } from "lucide-react";
import type {
  ChatMessage as ChatMessageType,
  ApiMessage,
  PersonaId,
  MemoryEntry,
  Routine,
  AvatarExpression,
  AutonomousTask,
  ApprovalDetails,
} from "@/types/emma";
import {
  getRoutine,
  addCustomRoutine,
  removeCustomRoutine,
  matchRoutineTrigger,
  BUILT_IN_ROUTINES,
} from "@/core/routines-engine";
import { useVoice } from "@/core/voice-engine";
import { useVision } from "@/core/vision-engine";
import { useScheduler, buildDefaultSchedules } from "@/core/scheduler-engine";
import { useNotifications } from "@/core/notifications-engine";
import { useTimeline } from "@/core/timeline-engine";
import { useMultiUser } from "@/core/multi-user-engine";
import { useEmotion } from "@/core/emotion-engine";
import { useAvatar } from "@/core/avatar-engine";
import { useContextManager } from "@/core/context-manager";
import { generateGreeting, getGreetingExpression } from "@/core/greeting-engine";
import { useProactiveSpeech } from "@/core/proactive-speech";
import { deriveBehaviorFlags } from "@/core/behavior-flags";
import {
  buildTierNotification,
  shouldAutoExecute,
  buildSystemNotification,
  buildPatternNotification,
} from "@/core/autonomy-engine";
import { uid } from "@/lib/utils";
import { streamEmmaResponse, type StreamDoneEvent } from "@/lib/stream-client";

import { Header } from "@/components/Header";
import { ChatPanel } from "@/components/ChatPanel";
import { InputBar } from "@/components/InputBar";
import { NotificationToast } from "@/components/NotificationToast";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { AutonomousTasksPanel } from "@/components/AutonomousTasksPanel";
import { MemoryPanel } from "@/components/MemoryPanel";
import { RoutinePanel } from "@/components/RoutinePanel";
import { SchedulePanel } from "@/components/SchedulePanel";
import { TimelinePanel } from "@/components/TimelinePanel";
import { UserPanel } from "@/components/UserPanel";
import { VisionPanel } from "@/components/VisionPanel";

// ─── EMMA L4 Shell — Physical Integration ────────────────────────────────────

// TODO: Enable only after routines have real persistence and server-side execution.
const ENABLE_ROUTINES = false;

export default function EmmaPage() {
  // ── Core ────────────────────────────────────────────────────────────────────
  const [persona, setPersona] = useState<PersonaId>("mommy");
  const [vibeResolved, setVibeResolved] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [historyReady, setHistoryReady] = useState<ChatMessageType[] | null>(null);
  const [usageWarning, setUsageWarning] = useState<{
    message: string;
    window: string | null;
  } | null>(null);
  const [usageBlocked, setUsageBlocked] = useState<{ upgradeUrl: string } | null>(null);
  const [autonomousTasks, setAutonomousTasks] = useState<AutonomousTask[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalDetails[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [realtimeIds, setRealtimeIds] = useState<{ userId: string; clientId: string } | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // ── Memory (L2) ────────────────────────────────────────────────────────────
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoryExtracting, setMemoryExtracting] = useState(false);

  // ── Routine (L3) ───────────────────────────────────────────────────────────
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [, setRoutineVersion] = useState(0);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const voice = useVoice();
  const vision = useVision();
  // Destructured for JSX: once `vision.previewRef` is used in render, the
  // react-hooks/refs rule taints every inline `vision.*` read as a ref access.
  const {
    active: visionActive,
    supported: visionSupported,
    analyzing: visionAnalyzing,
    lastAnalysis: visionLastAnalysis,
    previewRef: visionPreviewRef,
  } = vision;
  const timeline = useTimeline();
  const multiUser = useMultiUser();
  const emotion = useEmotion();
  const avatar = useAvatar();
  const contextManager = useContextManager();
  const proactiveResetRef = useRef<() => void>(() => {});

  // ── Behavior flags — client-side derivation for companion presence systems ──
  // Same pure derivation the brain route uses server-side (ADR 0001). Greeting,
  // proactive speech, voice, and avatar consume these; localHour is omitted on
  // purpose (impure in render) — late-night behavior stays with each engine's
  // own time checks, and the server prompt path still derives with the hour.
  const behaviorFlags = useMemo(
    () =>
      deriveBehaviorFlags({
        personaId: persona,
        memories,
        emotionState: emotion.currentEmotion ?? undefined,
      }),
    [persona, memories, emotion.currentEmotion]
  );

  // ── Execute workflow routine ───────────────────────────────────────────────
  const executeRoutineById = useCallback(
    (routineId: string, source: "user" | "scheduler" | "proactive") => {
      if (!ENABLE_ROUTINES) {
        console.warn(`[Routines] Blocked ${source} execution for "${routineId}": unavailable`);
        return;
      }
      const routine = getRoutine(routineId);
      if (!routine) return;

      setActiveRoutineId(routineId);

      timeline.log({
        type: "routine_run",
        source,
        title: `${routine.icon} ${routine.name}`,
        detail: "Workflow routine triggered",
        routineId,
      });

      setTimeout(() => setActiveRoutineId(null), 3000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeline, multiUser.activeUser.id]
  );

  // ── Notifications (L3) ────────────────────────────────────────────────────
  const notifications = useNotifications(
    (routineId) => {
      executeRoutineById(routineId, "proactive");
    },
    (routineId, minutes) => {
      timeline.log({
        type: "notification_sent",
        source: "system",
        title: "Snoozed",
        detail: `Routine ${routineId} snoozed for ${minutes}m`,
        routineId,
      });
    }
  );

  // ── Scheduler (L3) ────────────────────────────────────────────────────────
  const scheduler = useScheduler(
    useCallback(
      (routineId: string, _scheduleId: string) => {
        if (!ENABLE_ROUTINES) return;

        const routine = getRoutine(routineId);
        if (!routine) return;

        timeline.log({
          type: "schedule_triggered",
          source: "scheduler",
          title: "⏰ Schedule fired",
          detail: `${routine.name} triggered by schedule`,
          routineId,
          tier: routine.autonomyTier,
        });

        if (shouldAutoExecute(routine)) {
          executeRoutineById(routineId, "scheduler");
          notifications.push(buildTierNotification(routine, "scheduler"));
        } else {
          notifications.push(buildTierNotification(routine, "scheduler"));
        }
      },
      [executeRoutineById, notifications, timeline]
    ),
    buildDefaultSchedules(BUILT_IN_ROUTINES, ENABLE_ROUTINES)
  );

  // ── Load memories on mount ─────────────────────────────────────────────────
  const fetchMemories = async () => {
    setMemoriesLoading(true);
    try {
      const res = await fetch("/api/emma/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get" }),
      });
      const data = await res.json();
      if (data.entries) {
        setMemories(data.entries);
        const vibeEntry = (data.entries as MemoryEntry[]).find(
          (e) => e.key === "interaction_vibe" && e.category === "preference"
        );
        if (vibeEntry?.value === "warm" || vibeEntry?.value === "balanced") {
          setPersona("neutral");
        }
      }
    } catch (err) {
      console.error("[EMMA] Memory fetch failed:", err);
    } finally {
      setMemoriesLoading(false);
      setVibeResolved(true);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMemories();
    fetch("/api/emma/history")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        const loaded: ChatMessageType[] = (
          d.messages as Array<{
            id: string;
            role: string;
            content: string;
            display: string;
            expression?: string;
            created_at: string;
          }>
        ).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          display: m.display,
          expression: m.expression as AvatarExpression | undefined,
          timestamp: new Date(m.created_at).getTime(),
        }));
        setHistoryReady(loaded);
      })
      .catch(() => {
        setHistoryReady([]);
      });
    // Surface top pattern suggestion (quiet-hours + daily-cap enforced server-side)
    fetch("/api/emma/patterns")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pattern?: { id: string; suggestion: string } | null } | null) => {
        if (d?.pattern) {
          notifications.push(buildPatternNotification(d.pattern.id, d.pattern.suggestion));
        }
      })
      .catch(() => {});
    timeline.log({
      type: "system_event",
      source: "system",
      title: "EMMA L4 initialized",
      detail: "All pillars online",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Eager greeting — fires after vibe is resolved so persona is correct ──────
  useEffect(() => {
    if (!vibeResolved) return;
    if (initialized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true);

    const greeting = generateGreeting(persona, memories, behaviorFlags);
    const greetingExpression = getGreetingExpression(persona, behaviorFlags);

    const greetingMsg: ChatMessageType = {
      id: uid(),
      role: "assistant",
      content: greeting,
      display: greeting,
      timestamp: Date.now(),
      expression: greetingExpression as AvatarExpression,
    };
    setMessages([greetingMsg]);
    setApiMessages([{ role: "assistant", content: greeting }]);

    setTimeout(() => {
      avatar.setExpression(greetingExpression as AvatarExpression);
    }, 500);
  }, [initialized, vibeResolved, persona, memories, avatar, behaviorFlags]);

  // ── When history loads with messages, replace the greeting ───────────────────
  useEffect(() => {
    if (historyReady === null || historyReady.length === 0) return;
    setMessages(historyReady);
    setApiMessages(historyReady.map((m) => ({ role: m.role, content: m.content })));
  }, [historyReady]);

  // ── Memory extraction ──────────────────────────────────────────────────────
  const extractMemories = useCallback(async () => {
    if (messages.length < 4) return;
    setMemoryExtracting(true);
    try {
      const conversationText = messages
        .slice(-20)
        .map((m) => `${m.role}: ${m.display}`)
        .join("\n");
      const res = await fetch("/api/emma/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract", conversationText }),
      });
      const data = await res.json();
      if (data.extracted && data.extracted.length > 0) {
        await fetchMemories();
        timeline.log({
          type: "memory_extracted",
          source: "system",
          title: "Memories extracted",
          detail: `${data.extracted.length} new memories`,
        });
      }
    } catch (err) {
      console.error("[EMMA] Memory extraction failed:", err);
    } finally {
      setMemoryExtracting(false);
    }
  }, [messages, timeline]);

  const deleteMemory = useCallback(async (id: string) => {
    try {
      await fetch("/api/emma/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", entry: { id } }),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("[EMMA] Memory delete failed:", err);
    }
  }, []);

  // Auto-extract every 5 messages
  const lastExtractCount = useRef(0);
  useEffect(() => {
    const userMsgCount = messages.filter((m) => m.role === "user").length;
    if (userMsgCount > 0 && userMsgCount % 5 === 0 && userMsgCount !== lastExtractCount.current) {
      lastExtractCount.current = userMsgCount;
      extractMemories();
    }
  }, [messages, extractMemories]);

  // Extract on tab hide / page close — captures short sessions missed by the 5-message trigger.
  // Uses sendBeacon so the request survives the page being unloaded.
  useEffect(() => {
    const handleHide = () => {
      if (document.visibilityState !== "hidden") return;
      const userMsgCount = messages.filter((m) => m.role === "user").length;
      const newSinceLastExtract = userMsgCount - lastExtractCount.current;
      if (newSinceLastExtract < 2 || messages.length < 4) return;
      lastExtractCount.current = userMsgCount;
      const conversationText = messages
        .slice(-20)
        .map((m) => `${m.role}: ${m.display}`)
        .join("\n");
      const blob = new Blob([JSON.stringify({ action: "extract", conversationText })], {
        type: "application/json",
      });
      navigator.sendBeacon?.("/api/emma/memory", blob);
    };
    document.addEventListener("visibilitychange", handleHide);
    return () => document.removeEventListener("visibilitychange", handleHide);
  }, [messages]);

  // ── Custom routines ────────────────────────────────────────────────────────
  const handleCreateRoutine = useCallback(
    (routine: Routine) => {
      addCustomRoutine(routine);
      setRoutineVersion((v) => v + 1);
      timeline.log({
        type: "system_event",
        source: "user",
        title: "Routine created",
        detail: `${routine.icon} ${routine.name}`,
        routineId: routine.id,
      });
      notifications.push(
        buildSystemNotification("Routine Created", `${routine.icon} ${routine.name} is ready`, 3000)
      );
    },
    [timeline, notifications]
  );

  const handleDeleteRoutine = useCallback((id: string) => {
    removeCustomRoutine(id);
    setRoutineVersion((v) => v + 1);
  }, []);

  // ── Tasks + approvals: initial load + 60s fallback poll ─────────────────────
  const realtimeIdsSet = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const fetchAll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/emma/tasks?type=all&limit=6");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.tasks) setAutonomousTasks(data.tasks);
          if (data.approvals) setPendingApprovals(data.approvals);
          // Resolve IDs once for Realtime subscription
          if (data.clientId && !realtimeIdsSet.current) {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user && !cancelled) {
              realtimeIdsSet.current = true;
              setRealtimeIds({ userId: user.id, clientId: data.clientId });
            }
          }
        }
      } catch {
        /* silent */
      }
    };

    fetchAll();
    const id = setInterval(fetchAll, 60_000);
    const onVisible = () => {
      if (!document.hidden) fetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase]);

  // ── Realtime: postgres_changes + broadcast for live updates ──────────────────
  useEffect(() => {
    if (!supabase || !realtimeIds) return;
    const { clientId, userId } = realtimeIds;

    const mapRtTask = (r: Record<string, unknown>): AutonomousTask => ({
      id: r.id as string,
      goal: r.goal as string,
      status: r.status as AutonomousTask["status"],
      triggerType: r.trigger_type as AutonomousTask["triggerType"],
      stepsTaken: (r.steps_taken as number) ?? 0,
      totalTokens: (r.token_cost as number) ?? 0,
      createdAt: r.created_at ? new Date(r.created_at as string).getTime() : 0,
      completedAt: r.completed_at ? new Date(r.completed_at as string).getTime() : undefined,
      currentTool: (r.current_tool as string | undefined) ?? undefined,
    });

    const changesChannel = supabase
      .channel(`emma-rt-${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (payload: { new: Record<string, unknown> }) => {
          setAutonomousTasks((prev) => [mapRtTask(payload.new), ...prev].slice(0, 6));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        (payload: { new: Record<string, unknown> }) => {
          setAutonomousTasks((prev) =>
            prev.map((t) => (t.id === (payload.new.id as string) ? mapRtTask(payload.new) : t))
          );
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approvals" }, () => {
        // Refetch approvals on any new insertion — DB is authoritative
        fetch("/api/emma/tasks?type=approvals&limit=6")
          .then((r) => r.json())
          .then((d) => {
            if (d.approvals) setPendingApprovals(d.approvals);
          })
          .catch(() => {});
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "approvals" },
        (payload: { new: Record<string, unknown> }) => {
          if ((payload.new.status as string) !== "pending") {
            setPendingApprovals((prev) =>
              prev.filter((a) => a.approvalId !== (payload.new.id as string))
            );
          }
        }
      )
      .subscribe();

    // Broadcast channel: agent loop fires this immediately on approval creation
    const broadcastChannel = supabase
      .channel(`user-${userId}`)
      .on("broadcast", { event: "approval_request" }, () => {
        fetch("/api/emma/tasks?type=approvals&limit=6")
          .then((r) => r.json())
          .then((d) => {
            if (d.approvals) setPendingApprovals(d.approvals);
          })
          .catch(() => {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(changesChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [supabase, realtimeIds]);

  const handleApprove = useCallback(async (approvalId: string) => {
    const res = await fetch("/api/emma/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", approvalId }),
    });
    if (res.ok) setPendingApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
  }, []);

  const handleCancelApproval = useCallback(async (approvalId: string) => {
    const res = await fetch("/api/emma/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", approvalId }),
    });
    if (res.ok) setPendingApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
  }, []);

  const handleViewTask = useCallback((taskId: string) => {
    window.open(`/settings/tasks${taskId ? `/${taskId}` : ""}`, "_blank");
  }, []);

  // ── Vision ─────────────────────────────────────────────────────────────────
  const handleVisionAnalyze = useCallback(async () => {
    const analysis = await vision.analyzeScene();
    if (analysis) {
      timeline.log({
        type: "vision_analysis",
        source: "system",
        title: "Screen analyzed",
        detail: analysis.description.slice(0, 100),
      });
    }
  }, [vision, timeline]);

  const handleVisionToggle = useCallback(async () => {
    if (vision.active) {
      vision.stop();
    } else {
      const ok = await vision.start();
      if (ok) {
        timeline.log({
          type: "system_event",
          source: "user",
          title: "Vision activated",
          detail: "Screen sharing connected",
        });
        // Warm the first analysis so Emma has screen context immediately,
        // instead of waiting for the first message or a manual analyze click.
        void handleVisionAnalyze();
      }
    }
  }, [vision, timeline, handleVisionAnalyze]);

  // ── Send Message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      // Reset proactive timers on user activity
      proactiveResetRef.current();
      avatar.resetIdleTimer();

      // Text emotion analysis
      const textEmotion = emotion.analyzeText(text);
      const combinedEmotion = emotion.getCombined() || textEmotion;
      voice.setCurrentEmotion(combinedEmotion.primary);

      // Instant routine detection — kick off the routine before Emma's response arrives.
      // Emma's response will also emit [EMMA_ROUTINE] if relevant; executeRoutineById is idempotent
      // over the 3s display window so a double-call is harmless.
      const preMatchedRoutineId = matchRoutineTrigger(text);
      if (ENABLE_ROUTINES && preMatchedRoutineId) {
        executeRoutineById(preMatchedRoutineId, "user");
      }

      const userMsg: ChatMessageType = {
        id: uid(),
        role: "user",
        content: text.trim(),
        display: text.trim(),
        timestamp: Date.now(),
        userId: multiUser.activeUser.id,
        emotion: combinedEmotion,
      };

      const newApiMsgs: ApiMessage[] = [...apiMessages, { role: "user", content: text.trim() }];
      // Snapshot pre-send state so a refusal can roll back this exchange.
      const preSendApiMessages = apiMessages;
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      // ── Vision: give Emma the CURRENT screen, not a stale snapshot ─────
      // Runs after the user's bubble renders so the refresh never delays the UI.
      // Refresh when sharing is active and the last analysis is missing or old;
      // fall back to the last snapshot if the refresh fails.
      const VISION_STALE_MS = 30_000;
      let visionContext: string | undefined;
      if (vision.active) {
        let analysis = vision.lastAnalysis;
        if (!analysis || Date.now() - analysis.timestamp > VISION_STALE_MS) {
          // Same refresh cadence feeds the vision emotion signal (best-effort,
          // fire-and-forget; fuses via the emotion engine's 30s freshness window).
          const frame = vision.captureFrame();
          if (frame) void emotion.analyzeFromVision(frame.base64);
          analysis = (await vision.analyzeScene(text.trim())) ?? vision.lastAnalysis;
        }
        if (analysis) {
          visionContext = analysis.description;
          if (analysis.objects.length > 0) {
            visionContext += ` Objects: ${analysis.objects.join(", ")}.`;
          }
        }
      }

      // ── Context Management: trim/summarize before sending ──────────────
      const { managed, summarized } = await contextManager.processMessages(newApiMsgs);

      // If summarization happened, sync apiMessages state with managed version
      if (summarized) {
        setApiMessages(managed);
        timeline.log({
          type: "system_event",
          source: "system",
          title: "Context summarized",
          detail: `Compressed ${newApiMsgs.length} → ${managed.length} messages`,
        });
      } else {
        setApiMessages(managed);
      }

      // Avatar enters listening state while waiting for response
      avatar.setListening();

      timeline.log({
        type: "user_message",
        source: "user",
        title: "User message",
        detail: text.trim().slice(0, 80),
        userId: multiUser.activeUser.id,
      });

      // ── Early TTS: prefetch first-sentence audio while the stream runs ──
      // Cuts perceived voice latency from (full stream + full-text TTS) to
      // roughly the first-sentence TTS time; the remainder generates while
      // chunk 1 plays. Expression for chunk 1 is unknown mid-stream, so it
      // uses the neutral voice profile; chunk 2 carries the real expression.
      const FIRST_SENTENCE_MIN = 12; // don't burn a request on a bare "Mmm."
      const FIRST_SENTENCE_MAX = 220; // fire even without a boundary by this point
      let streamedForTts = "";
      let ttsPrefetch: { sentence: string; blobPromise: Promise<Blob | null> } | null = null;

      try {
        // Create placeholder assistant message for streaming
        const assistantId = uid();
        const assistantMsg: ChatMessageType = {
          id: assistantId,
          role: "assistant",
          content: "",
          display: "",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        await streamEmmaResponse(
          {
            messages: managed,
            deviceGraph: {},
            visionContext,
            persona,
            activeUser: multiUser.activeUser,
            emotionState: combinedEmotion,
            userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          {
            // ── Stream text deltas into the placeholder message ──────────
            onDelta: (deltaText: string) => {
              // Strip any complete internal tags that escaped the server-side filter.
              // Partial tags spanning chunk boundaries are cleaned up by parseEmmaResponse on done.
              const safe = deltaText.replace(
                /\[emotion:[^\]]*\]|\[EMMA_ROUTINE\][^\[]*\[\/EMMA_ROUTINE\]|\[EMMA_CMD\][^\[]*\[\/EMMA_CMD\]/g,
                ""
              );
              if (!safe) return;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, display: m.display + safe, content: m.content + safe }
                    : m
                )
              );

              // Kick off first-sentence TTS as soon as a sentence boundary
              // streams in (or the buffer grows past the no-boundary cap).
              if (ttsEnabled && !ttsPrefetch) {
                streamedForTts += safe;
                // First boundary whose prefix clears the minimum — a leading
                // filler like "Mmm." keeps growing to include the next sentence.
                let sentence: string | null = null;
                const boundaryRe = /[.!?](?=\s)/g;
                let b: RegExpExecArray | null;
                while ((b = boundaryRe.exec(streamedForTts))) {
                  const candidate = streamedForTts.slice(0, b.index + 1);
                  if (candidate.trim().length >= FIRST_SENTENCE_MIN) {
                    sentence = candidate;
                    break;
                  }
                }
                if (!sentence && streamedForTts.length >= FIRST_SENTENCE_MAX) {
                  sentence = streamedForTts;
                }
                if (sentence) {
                  ttsPrefetch = {
                    sentence,
                    blobPromise: voice.fetchAudioBlob(sentence),
                  };
                }
              }
            },

            // ── Final event: commands, expression, full text ─────────────
            onDone: async (event: StreamDoneEvent) => {
              // Kick off TTS immediately — runs in parallel with all state updates below.
              // If the first-sentence prefetch matched the final text, only the
              // remainder is fetched here; otherwise the full response (as before).
              const prefetch =
                ttsEnabled &&
                event.text &&
                ttsPrefetch &&
                event.text.startsWith(ttsPrefetch.sentence)
                  ? ttsPrefetch
                  : null;
              const restText = prefetch
                ? event.text.slice(prefetch.sentence.length).trim()
                : event.text;
              const audioBlobPromise =
                ttsEnabled && restText
                  ? voice.fetchAudioBlob(restText, undefined, event.expression ?? undefined)
                  : Promise.resolve(null);

              // Finalize message with parsed data
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: event.raw || event.text,
                        display: event.text,
                        commands: event.commands.length > 0 ? event.commands : undefined,
                        expression: event.expression || undefined,
                      }
                    : m
                )
              );
              // Refused exchanges must not enter API history — the model
              // rejects turns that follow a refusal in the same context.
              // Roll back to the snapshot taken before this send.
              if (event.refused) {
                setApiMessages(preSendApiMessages);
              } else if (event.contextWindowExceeded) {
                // Input overflowed the 1M context window. Hard-truncate to the
                // 6 most recent messages so the next request definitely fits.
                setApiMessages((prev) => prev.slice(-6));
              } else {
                // Preserve compaction blocks alongside the text so the model can
                // reconstruct compressed history on the next turn.
                setApiMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant" as const,
                    content:
                      event.compactionBlocks && event.compactionBlocks.length > 0
                        ? ([
                            ...(event.compactionBlocks as unknown as import("@/types/emma").ApiMessageContent[]),
                            { type: "text", text: event.raw || event.text },
                          ] as import("@/types/emma").ApiMessageContent[])
                        : event.raw || event.text,
                  },
                ]);
              }

              // Persist exchange to chat history (fire-and-forget)
              if (!event.refused && !event.contextWindowExceeded) {
                fetch("/api/emma/history", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify([
                    userMsg,
                    {
                      id: assistantId,
                      role: "assistant",
                      content: event.raw || event.text,
                      display: event.text,
                      expression: event.expression || undefined,
                      timestamp: Date.now(),
                    },
                  ]),
                }).catch(() => {});
              }

              // Handle enforcement metadata
              if (event.enforcement?.status === "warning" && event.enforcement.message) {
                setUsageWarning({
                  message: event.enforcement.message,
                  window: event.enforcement.warningWindow,
                });
              }
              if (event.enforcement?.status === "blocked") {
                setUsageBlocked({
                  upgradeUrl: event.enforcement.upgradeUrl || "/settings/billing?addon=extra_pack",
                });
              }

              // Apply routine
              if (ENABLE_ROUTINES && event.routineId) {
                executeRoutineById(event.routineId, "user");
              }

              // Commands parsed but no longer dispatched to physical devices

              // TTS + lip sync — audio was already in-flight from top of onDone.
              // Expression is fired inside onAudioStart so it syncs with actual playback,
              // not with response parse (~800ms–2s before audio begins).
              if (ttsEnabled && event.text) {
                const firstBlob = prefetch ? await prefetch.blobPromise : null;
                if (prefetch && firstBlob) {
                  // Two-chunk pipeline: the prefetched first sentence plays now;
                  // the remainder is already generating and follows seamlessly.
                  avatar.startTalkingWithAudio(
                    firstBlob,
                    () => {
                      if (event.expression) avatar.setExpression(event.expression);
                    },
                    () => {
                      void audioBlobPromise.then((restBlob) => {
                        if (restBlob) {
                          avatar.startTalkingWithAudio(restBlob);
                        } else if (restText) {
                          // Remainder fetch failed mid-reply — finish via WebSpeech
                          // rather than dropping spoken content.
                          voice.speakFallback(
                            restText,
                            event.expression ?? undefined,
                            () => avatar.startTalkingContinuous(),
                            () => avatar.stopTalking()
                          );
                        }
                      });
                    }
                  );
                } else if (!prefetch && (await audioBlobPromise)) {
                  const audioBlob = await audioBlobPromise;
                  avatar.startTalkingWithAudio(audioBlob!, () => {
                    if (event.expression) avatar.setExpression(event.expression);
                  });
                } else {
                  // WebSpeech: drive avatar from actual utterance start/end events
                  // so mouth only moves when speech is actually playing.
                  voice.speakFallback(
                    event.text,
                    event.expression ?? undefined,
                    () =>
                      avatar.startTalkingContinuous(() => {
                        if (event.expression) avatar.setExpression(event.expression);
                      }),
                    () => avatar.stopTalking()
                  );
                }
              } else if (event.text) {
                if (event.expression) avatar.setExpression(event.expression);
                avatar.startTalking(event.text);
              }

              proactiveResetRef.current();
              setLoading(false);
            },

            // ── Error ────────────────────────────────────────────────────
            onError: (errorText: string) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, display: errorText, content: errorText } : m
                )
              );
              setLoading(false);
            },
          }
        );
      } catch (err) {
        console.error("[EMMA] Stream error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: "Something broke on my end. Give me a second.",
            display: "Something broke on my end. Give me a second.",
            timestamp: Date.now(),
          },
        ]);
        setLoading(false);
      }
    },
    [
      apiMessages,
      loading,
      persona,
      ttsEnabled,
      voice,
      vision,
      emotion,
      timeline,
      multiUser.activeUser,
      executeRoutineById,
      avatar,
      contextManager,
    ]
  );

  const [voiceTranscript, setVoiceTranscript] = useState("");

  const handleVoice = useCallback(async () => {
    if (voice.listening) {
      voice.stopListening();
      return;
    }
    const transcript = await voice.listen();
    if (transcript) {
      // Voice emotion: analyze the captured utterance audio so getCombined()
      // fuses the voice signal when this transcript is sent.
      const sample = voice.getLastAudioSample();
      if (sample) emotion.analyzeVoice(sample.samples, sample.sampleRate);
      setVoiceTranscript(transcript);
    }
  }, [voice, emotion]);

  const handleSend = useCallback(
    (text: string) => {
      setVoiceTranscript("");
      sendMessage(text);
    },
    [sendMessage]
  );

  // ── User switch logging ────────────────────────────────────────────────────
  const prevUserId = useRef(multiUser.activeUser.id);
  useEffect(() => {
    if (multiUser.activeUser.id !== prevUserId.current) {
      prevUserId.current = multiUser.activeUser.id;
      timeline.log({
        type: "user_switched",
        source: "user",
        title: `Switched to ${multiUser.activeUser.name}`,
        detail: `${multiUser.activeUser.avatar} ${multiUser.activeUser.role}`,
        userId: multiUser.activeUser.id,
      });
    }
  }, [multiUser.activeUser, timeline]);

  // ── Proactive Speech — Emma initiates unprompted ───────────────────────────
  const handleProactiveSpeak = useCallback(
    (text: string, expression: AvatarExpression) => {
      const msg: ChatMessageType = {
        id: uid(),
        role: "assistant",
        content: text,
        display: text,
        timestamp: Date.now(),
        expression,
      };
      setMessages((prev) => [...prev, msg]);
      setApiMessages((prev) => [...prev, { role: "assistant", content: text }]);

      avatar.setExpression(expression);
      avatar.startTalking(text);

      if (ttsEnabled) voice.speak(text, undefined, expression);

      timeline.log({
        type: "system_event",
        source: "proactive",
        title: "Proactive speech",
        detail: text.slice(0, 60),
      });
    },
    [avatar, voice, ttsEnabled, timeline]
  );

  const proactive = useProactiveSpeech(
    handleProactiveSpeak,
    true,
    memories,
    persona,
    behaviorFlags
  );
  // eslint-disable-next-line react-hooks/refs
  proactiveResetRef.current = proactive.resetActivity;

  // ── Surface daily reflection / pattern on session open ────────────────────
  // Fetches the top unseen pattern_detection row and delivers it as proactive
  // speech ~4 s after the greeting lands. The patterns route enforces quiet-
  // hours and a daily cap of 3 — no extra guard needed here.
  useEffect(() => {
    if (!initialized) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/emma/patterns");
        if (!res.ok) return;
        const data = (await res.json()) as {
          pattern: { id: string; suggestion: string; patternType: string } | null;
        };
        if (!data.pattern?.suggestion) return;
        const expression: AvatarExpression =
          data.pattern.patternType === "memory_reflection" ? "warm" : "listening";
        handleProactiveSpeak(data.pattern.suggestion, expression);
      } catch {}
    }, 4000);
    return () => clearTimeout(timer);
  }, [initialized, handleProactiveSpeak]);

  // ── Typing Awareness — avatar reacts to user typing ────────────────────────
  const handleTypingStart = useCallback(() => {
    avatar.setListening();
    proactiveResetRef.current();
  }, [avatar]);

  const handleTypingStop = useCallback(() => {
    avatar.resetIdleTimer();
  }, [avatar]);

  // ── Responsive layout: mobile immersive / pip fallback ───────────────────
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 1024);
      if (w < 1024) {
        if (avatar.state.layout !== "overlay") avatar.setLayout("overlay");
      } else if (w <= 1100 && avatar.state.layout === "side") {
        avatar.setLayout("pip");
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar.state.layout, avatar.setLayout]);

  // ── Mobile immersive render ────────────────────────────────────────────────
  if (isMobile) {
    const visibleMessages = messages
      .filter((msg) => msg.role === "user" || !!msg.display)
      .slice(-4);
    return (
      <div className="h-[100dvh] w-screen bg-emma-950 overflow-hidden relative font-sans">
        <NotificationToast
          notifications={notifications.notifications}
          onAction={notifications.handleAction}
          onDismiss={notifications.dismiss}
        />

        {/* Offscreen video sink for screen capture — VisionPanel isn't rendered
            on mobile, but frame capture still needs a playing <video> element. */}
        <video
          ref={visionPreviewRef}
          className="absolute w-px h-px opacity-0 pointer-events-none"
          muted
          playsInline
        />

        {/* Full-screen avatar background */}
        <div className="absolute inset-0 z-0">
          <AvatarCanvas
            state={avatar.state}
            canvasRef={avatar.canvasRef}
            onInit={avatar.init}
            onToggleVisible={avatar.toggleVisible}
            onSetLayout={avatar.setLayout}
            hideControls
          />
        </div>

        {/* Gradient overlay — darkens bottom for text legibility */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(13,10,14,0.96) 0%, rgba(13,10,14,0.6) 38%, rgba(13,10,14,0.15) 65%, transparent 100%)",
          }}
        />

        {/* Top mini bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
              <span className="font-display text-base italic text-emma-950">E</span>
            </div>
            <span className="text-[11px] font-semibold tracking-wider text-emma-300/80">EMMA</span>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="w-11 h-11 flex items-center justify-center text-emma-200/30 hover:text-emma-200/60 transition-colors"
          >
            <Settings size={16} />
          </Link>
        </div>

        {/* Floating chat bubbles */}
        <div
          className="absolute left-4 right-4 z-10 flex flex-col gap-2"
          style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
        >
          {visibleMessages.map((msg) => (
            <MobileChatBubble key={msg.id} message={msg} />
          ))}
          {loading &&
            (() => {
              const last = messages[messages.length - 1];
              return !last || last.role === "user" || !last.display;
            })() && <MobileTypingBubble />}
        </div>

        {/* Pinned input bar */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <InputBar
            onSend={handleSend}
            onVoice={handleVoice}
            voiceSupported={voice.supported}
            listening={voice.listening}
            ttsEnabled={ttsEnabled}
            onToggleTts={() => setTtsEnabled((v) => !v)}
            disabled={loading}
            blocked={!!usageBlocked}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            visionActive={visionActive}
            onVisionToggle={handleVisionToggle}
            transcript={voiceTranscript}
            voiceError={voice.error}
            onVoiceErrorClear={voice.clearError}
          />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 text-emma-100 font-sans overflow-hidden">
      <style>{`
        @media (max-width: 1100px) {
          .emma-avatar-panel { display: none !important; }
        }
        @media (max-width: 900px) {
          .emma-right-sidebar { display: none !important; }
        }
        .emma-chat-min { min-width: 480px; }
      `}</style>
      <Header
        persona={persona}
        visionActive={visionActive}
        elConnected={false}
        memoryCount={memories.length}
        scheduleCount={ENABLE_ROUTINES ? scheduler.schedules.filter((s) => s.enabled).length : 0}
        activeUser={multiUser.activeUser}
        currentEmotion={emotion.currentEmotion}
      />

      <NotificationToast
        notifications={notifications.notifications}
        onAction={notifications.handleAction}
        onDismiss={notifications.dismiss}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Emma avatar identity panel ── */}
        <div
          className="emma-avatar-panel shrink-0 border-r border-surface-border bg-emma-950/60 flex flex-col overflow-hidden"
          style={{ width: 420, flexShrink: 0, borderRight: "1px solid rgba(232,160,191,0.1)" }}
        >
          <AvatarCanvas
            state={avatar.state}
            canvasRef={avatar.canvasRef}
            onInit={avatar.init}
            onToggleVisible={avatar.toggleVisible}
            onSetLayout={avatar.setLayout}
            onPreviewVoice={() =>
              voice.speakFallback("Mmm. There you are. I've been waiting.", "warm")
            }
          />
        </div>

        {/* ── Center: Chat area ── */}
        <div className="emma-chat-min flex-1 flex overflow-hidden relative">
          {/* Overlay layout: avatar behind chat at reduced opacity */}
          {avatar.state.layout === "overlay" && avatar.state.visible && (
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
              <AvatarCanvas
                state={avatar.state}
                canvasRef={avatar.canvasRef}
                onInit={avatar.init}
                onToggleVisible={avatar.toggleVisible}
                onSetLayout={avatar.setLayout}
              />
            </div>
          )}

          <div
            className={`flex-1 flex flex-col overflow-hidden ${avatar.state.layout === "overlay" ? "relative z-10" : ""}`}
          >
            <ChatPanel
              messages={messages}
              loading={loading}
              historyLoading={historyReady === null}
              onSend={handleSend}
              onVoice={handleVoice}
              voiceSupported={voice.supported}
              listening={voice.listening}
              ttsEnabled={ttsEnabled}
              onToggleTts={() => setTtsEnabled((v) => !v)}
              contextStats={contextManager.stats}
              onTypingStart={handleTypingStart}
              onTypingStop={handleTypingStop}
              usageWarning={usageWarning}
              usageBlocked={usageBlocked}
              onDismissWarning={() => setUsageWarning(null)}
              pendingApprovals={pendingApprovals}
              onApprove={handleApprove}
              onCancelApproval={handleCancelApproval}
              visionActive={visionActive}
              onVisionToggle={handleVisionToggle}
              transcript={voiceTranscript}
              voiceError={voice.error}
              onVoiceErrorClear={voice.clearError}
            />
          </div>

          {/* PiP layout: floating avatar in corner */}
          {avatar.state.layout === "pip" && avatar.state.visible && (
            <div className="absolute bottom-20 right-4 z-20 w-36 h-44 rounded-2xl overflow-hidden border border-emma-300/15 shadow-xl shadow-black/30 bg-emma-950/80 backdrop-blur-xl">
              <AvatarCanvas
                state={avatar.state}
                canvasRef={avatar.canvasRef}
                onInit={avatar.init}
                onToggleVisible={avatar.toggleVisible}
                onSetLayout={avatar.setLayout}
                onPreviewVoice={() =>
                  voice.speakFallback("Mmm. There you are. I've been waiting.", "warm")
                }
              />
            </div>
          )}
        </div>

        {/* ── Right: Sidebar ── */}
        <aside
          className="emma-right-sidebar shrink-0 border-l border-surface-border bg-emma-950/40 overflow-y-auto flex flex-col gap-5 p-4"
          style={{ width: "clamp(200px, 18%, 256px)" }}
        >
          {/* Autonomous tasks */}
          <AutonomousTasksPanel tasks={autonomousTasks} onViewTask={handleViewTask} />

          {/* Vision — screen share + on-demand analysis */}
          <SideSection label="Vision">
            <VisionPanel
              active={visionActive}
              supported={visionSupported}
              analyzing={visionAnalyzing}
              lastAnalysis={visionLastAnalysis}
              previewRef={visionPreviewRef}
              onToggle={handleVisionToggle}
              onAnalyze={handleVisionAnalyze}
            />
          </SideSection>

          {/* Memory */}
          <SideSection label="Memory" count={memories.length}>
            <MemoryPanel
              memories={memories}
              loading={memoriesLoading}
              onRefresh={fetchMemories}
              onDelete={deleteMemory}
              onExtract={extractMemories}
              extracting={memoryExtracting}
            />
          </SideSection>

          {/* Routines */}
          <SideSection label="Routines">
            {ENABLE_ROUTINES ? (
              <RoutinePanel
                onActivate={(id) => executeRoutineById(id, "user")}
                activeRoutineId={activeRoutineId}
                onCreate={handleCreateRoutine}
                onDelete={handleDeleteRoutine}
              />
            ) : (
              <p className="px-3 py-4 text-xs text-emma-200/40">
                Routine automation is temporarily unavailable.
              </p>
            )}
          </SideSection>

          {/* Schedule */}
          <SideSection label="Schedule" count={0}>
            {ENABLE_ROUTINES ? (
              <SchedulePanel
                schedules={scheduler.schedules}
                onToggle={scheduler.toggleSchedule}
                onRemove={scheduler.removeSchedule}
              />
            ) : (
              <p className="px-3 py-4 text-xs text-emma-200/40">
                Scheduled routines are temporarily unavailable.
              </p>
            )}
          </SideSection>

          {/* Timeline */}
          <SideSection label="Timeline" count={timeline.entries.length}>
            <TimelinePanel entries={timeline.entries} />
          </SideSection>

          {/* Users */}
          <SideSection label="Users" count={multiUser.users.length}>
            <UserPanel
              users={multiUser.users}
              activeUser={multiUser.activeUser}
              onSwitch={multiUser.switchUser}
              onAdd={multiUser.addUser}
              onRemove={multiUser.removeUser}
            />
          </SideSection>
        </aside>
      </div>
    </div>
  );
}

// ── Mobile chat bubble ────────────────────────────────────────────────────────
function MobileChatBubble({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 bg-[#1e1824] rounded-2xl rounded-tr-sm text-sm leading-relaxed text-white/85">
          {message.display}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <div className="w-6 h-6 rounded-full shrink-0 mt-0.5 bg-gradient-to-br from-emma-300 to-emma-400 flex items-center justify-center">
        <span className="font-display text-xs italic text-emma-950">E</span>
      </div>
      <div className="flex-1 text-sm leading-relaxed text-white/80 pt-0.5">{message.display}</div>
    </div>
  );
}

function MobileTypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-black/50 border border-white/8 backdrop-blur-md flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emma-300/60 animate-pulse" />
        <span
          className="w-1.5 h-1.5 rounded-full bg-emma-300/60 animate-pulse"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-emma-300/60 animate-pulse"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}

// ── Sidebar section wrapper ────────────────────────────────────────────────────
function SideSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] font-medium text-emma-200/30 uppercase tracking-[0.15em]">
          {label}
        </span>
        {count !== undefined && count > 0 && (
          <span className="text-[9px] text-emma-200/20 bg-emma-300/8 border border-emma-300/10 rounded-full px-1.5 py-px font-light">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
