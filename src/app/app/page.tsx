"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { formatCommandLog } from "@/core/command-parser";
import { getPersona } from "@/core/personas";
import {
  getRoutine,
  getAllRoutines,
  addCustomRoutine,
  removeCustomRoutine,
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
import {
  buildTierNotification,
  shouldAutoExecute,
  buildSystemNotification,
} from "@/core/autonomy-engine";
import { uid } from "@/lib/utils";
import { streamEmmaResponse, type StreamDoneEvent } from "@/lib/stream-client";

import { Header } from "@/components/Header";
import { ChatPanel } from "@/components/ChatPanel";
import { NotificationToast } from "@/components/NotificationToast";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { AutonomousTasksPanel } from "@/components/AutonomousTasksPanel";
import { MemoryPanel } from "@/components/MemoryPanel";
import { RoutinePanel } from "@/components/RoutinePanel";
import { SchedulePanel } from "@/components/SchedulePanel";
import { TimelinePanel } from "@/components/TimelinePanel";
import { UserPanel } from "@/components/UserPanel";

// ─── EMMA L4 Shell — Physical Integration ────────────────────────────────────

export default function EmmaPage() {
  // ── Core ────────────────────────────────────────────────────────────────────
  const [persona] = useState<PersonaId>("mommy");
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [usageWarning, setUsageWarning] = useState<{
    message: string;
    window: string | null;
  } | null>(null);
  const [usageBlocked, setUsageBlocked] = useState<{ upgradeUrl: string } | null>(null);
  const [autonomousTasks, setAutonomousTasks] = useState<AutonomousTask[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalDetails[]>([]);

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
  const timeline = useTimeline();
  const multiUser = useMultiUser();
  const emotion = useEmotion();
  const avatar = useAvatar();
  const contextManager = useContextManager();
  const proactiveResetRef = useRef<() => void>(() => {});

  // ── Execute workflow routine ───────────────────────────────────────────────
  const executeRoutineById = useCallback(
    (routineId: string, source: "user" | "scheduler" | "proactive") => {
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
      (routineId: string, scheduleId: string) => {
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
    buildDefaultSchedules(BUILT_IN_ROUTINES)
  );

  // ── Load memories on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetchMemories();
    timeline.log({
      type: "system_event",
      source: "system",
      title: "EMMA L4 initialized",
      detail: "All pillars online",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMemories = async () => {
    setMemoriesLoading(true);
    try {
      const res = await fetch("/api/emma/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get" }),
      });
      const data = await res.json();
      if (data.entries) setMemories(data.entries);
    } catch (err) {
      console.error("[EMMA] Memory fetch failed:", err);
    } finally {
      setMemoriesLoading(false);
    }
  };

  // ── Context-Aware Greeting ──────────────────────────────────────────────────
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const greeting = generateGreeting(persona, memories);
    const greetingExpression = getGreetingExpression(persona);

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

    // Set avatar expression for greeting
    setTimeout(() => {
      avatar.setExpression(greetingExpression as AvatarExpression);
    }, 500);
  }, [initialized, persona, memories, avatar]);

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

  // Auto-extract every 10 messages
  const lastExtractCount = useRef(0);
  useEffect(() => {
    const userMsgCount = messages.filter((m) => m.role === "user").length;
    if (userMsgCount > 0 && userMsgCount % 10 === 0 && userMsgCount !== lastExtractCount.current) {
      lastExtractCount.current = userMsgCount;
      extractMemories();
    }
  }, [messages, extractMemories]);

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

  // ── Autonomous tasks polling (15s) ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const res = await fetch("/api/emma/tasks?type=tasks&limit=6");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.tasks) setAutonomousTasks(data.tasks);
        }
      } catch {
        /* silent */
      }
    };
    loadTasks();
    const id = setInterval(loadTasks, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Approvals polling (30s) ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadApprovals = async () => {
      try {
        const res = await fetch("/api/emma/tasks?type=approvals");
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.approvals) setPendingApprovals(data.approvals);
        }
      } catch {
        /* silent */
      }
    };
    loadApprovals();
    const id = setInterval(loadApprovals, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
  const handleVisionToggle = useCallback(async () => {
    if (vision.active) {
      vision.stop();
    } else {
      const ok = await vision.start();
      if (ok)
        timeline.log({
          type: "system_event",
          source: "user",
          title: "Vision activated",
          detail: "Camera connected",
        });
    }
  }, [vision, timeline]);

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

      let visionContext: string | undefined;
      if (vision.active && vision.lastAnalysis) {
        visionContext = vision.lastAnalysis.description;
        if (vision.lastAnalysis.objects.length > 0) {
          visionContext += ` Objects: ${vision.lastAnalysis.objects.join(", ")}.`;
        }
      }

      const userMsg: ChatMessageType = {
        id: uid(),
        role: "user",
        content: text.trim(),
        display: text.trim(),
        timestamp: Date.now(),
        visionContext,
        userId: multiUser.activeUser.id,
        emotion: combinedEmotion,
      };

      const newApiMsgs: ApiMessage[] = [...apiMessages, { role: "user", content: text.trim() }];
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

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
          },
          {
            // ── Stream text deltas into the placeholder message ──────────
            onDelta: (deltaText: string) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, display: m.display + deltaText, content: m.content + deltaText }
                    : m
                )
              );
            },

            // ── Final event: commands, expression, full text ─────────────
            onDone: async (event: StreamDoneEvent) => {
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
              setApiMessages((prev) => [
                ...prev,
                { role: "assistant", content: event.raw || event.text },
              ]);

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
              if (event.routineId) executeRoutineById(event.routineId, "user");

              // Commands parsed but no longer dispatched to physical devices

              // Avatar expression
              if (event.expression) {
                avatar.setExpression(event.expression);
              }

              // TTS + lip sync
              if (ttsEnabled && event.text) {
                const audioBlob = await voice.fetchAudioBlob(event.text);
                if (audioBlob) {
                  avatar.startTalkingWithAudio(audioBlob);
                } else {
                  avatar.startTalking(event.text);
                  voice.speakFallback(event.text);
                }
              } else if (event.text) {
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

  const handleVoice = useCallback(async () => {
    const transcript = await voice.listen();
    if (transcript) sendMessage(transcript);
  }, [voice, sendMessage]);

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

      if (ttsEnabled) voice.speak(text);

      timeline.log({
        type: "system_event",
        source: "proactive",
        title: "Proactive speech",
        detail: text.slice(0, 60),
      });
    },
    [avatar, voice, ttsEnabled, timeline]
  );

  const proactive = useProactiveSpeech(handleProactiveSpeak, true);
  proactiveResetRef.current = proactive.resetActivity;

  // ── Typing Awareness — avatar reacts to user typing ────────────────────────
  const handleTypingStart = useCallback(() => {
    avatar.setListening();
    proactiveResetRef.current();
  }, [avatar]);

  const handleTypingStop = useCallback(() => {
    avatar.resetIdleTimer();
  }, [avatar]);

  // ── PiP fallback: auto-switch to pip when avatar panel is hidden ──────────
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1100 && avatar.state.layout === "side") {
        avatar.setLayout("pip");
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [avatar.state.layout, avatar.setLayout]);

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
        visionActive={vision.active}
        elConnected={false}
        memoryCount={memories.length}
        scheduleCount={scheduler.schedules.filter((s) => s.enabled).length}
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
              onSend={sendMessage}
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
              visionActive={vision.active}
              onVisionToggle={handleVisionToggle}
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
            <RoutinePanel
              onActivate={(id) => executeRoutineById(id, "user")}
              activeRoutineId={activeRoutineId}
              onCreate={handleCreateRoutine}
              onDelete={handleDeleteRoutine}
            />
          </SideSection>

          {/* Schedule */}
          <SideSection label="Schedule" count={scheduler.schedules.filter((s) => s.enabled).length}>
            <SchedulePanel
              schedules={scheduler.schedules}
              onToggle={scheduler.toggleSchedule}
              onRemove={scheduler.removeSchedule}
            />
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
