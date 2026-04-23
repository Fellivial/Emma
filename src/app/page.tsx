"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ChatMessage as ChatMessageType,
  ApiMessage,
  PersonaId,
  MemoryEntry,
  Routine,
  AvatarExpression,
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
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { VisionPanel } from "@/components/VisionPanel";
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
      id: uid(), role: "assistant",
      content: greeting, display: greeting,
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
      const conversationText = messages.slice(-20).map((m) => `${m.role}: ${m.display}`).join("\n");
      const res = await fetch("/api/emma/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extract", conversationText }),
      });
      const data = await res.json();
      if (data.extracted && data.extracted.length > 0) {
        await fetchMemories();
        timeline.log({ type: "memory_extracted", source: "system", title: "Memories extracted", detail: `${data.extracted.length} new memories` });
      }
    } catch (err) { console.error("[EMMA] Memory extraction failed:", err); }
    finally { setMemoryExtracting(false); }
  }, [messages, timeline]);

  const deleteMemory = useCallback(async (id: string) => {
    try {
      await fetch("/api/emma/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", entry: { id } }) });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) { console.error("[EMMA] Memory delete failed:", err); }
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
  const handleCreateRoutine = useCallback((routine: Routine) => {
    addCustomRoutine(routine);
    setRoutineVersion((v) => v + 1);
    timeline.log({ type: "system_event", source: "user", title: "Routine created", detail: `${routine.icon} ${routine.name}`, routineId: routine.id });
    notifications.push(buildSystemNotification("Routine Created", `${routine.icon} ${routine.name} is ready`, 3000));
  }, [timeline, notifications]);

  const handleDeleteRoutine = useCallback((id: string) => {
    removeCustomRoutine(id);
    setRoutineVersion((v) => v + 1);
  }, []);

  // ── Vision ─────────────────────────────────────────────────────────────────
  const handleVisionToggle = useCallback(async () => {
    if (vision.active) { vision.stop(); }
    else {
      const ok = await vision.start();
      if (ok) timeline.log({ type: "system_event", source: "user", title: "Vision activated", detail: "Camera connected" });
    }
  }, [vision, timeline]);

  const handleVisionAnalyze = useCallback(async () => {
    const analysis = await vision.analyzeScene();
    if (analysis) {
      timeline.log({
        type: "vision_analysis", source: "system",
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
        id: uid(), role: "user",
        content: text.trim(), display: text.trim(),
        timestamp: Date.now(), visionContext,
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
          type: "system_event", source: "system",
          title: "Context summarized",
          detail: `Compressed ${newApiMsgs.length} → ${managed.length} messages`,
        });
      } else {
        setApiMessages(managed);
      }

      // Avatar enters listening state while waiting for response
      avatar.setListening();

      timeline.log({
        type: "user_message", source: "user",
        title: "User message", detail: text.trim().slice(0, 80),
        userId: multiUser.activeUser.id,
      });

      try {
        // Create placeholder assistant message for streaming
        const assistantId = uid();
        const assistantMsg: ChatMessageType = {
          id: assistantId, role: "assistant",
          content: "", display: "",
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
              setApiMessages((prev) => [...prev, { role: "assistant", content: event.raw || event.text }]);

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
                  m.id === assistantId
                    ? { ...m, display: errorText, content: errorText }
                    : m
                )
              );
              setLoading(false);
            },
          }
        );
      } catch (err) {
        console.error("[EMMA] Stream error:", err);
        setMessages((prev) => [...prev, {
          id: uid(), role: "assistant",
          content: "Something broke on my end. Give me a second.",
          display: "Something broke on my end. Give me a second.",
          timestamp: Date.now(),
        }]);
        setLoading(false);
      }
    },
    [apiMessages, loading, persona, ttsEnabled, voice, vision, emotion, timeline, multiUser.activeUser, executeRoutineById, avatar, contextManager]
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
        type: "user_switched", source: "user",
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
        id: uid(), role: "assistant",
        content: text, display: text,
        timestamp: Date.now(),
        expression,
      };
      setMessages((prev) => [...prev, msg]);
      setApiMessages((prev) => [...prev, { role: "assistant", content: text }]);

      avatar.setExpression(expression);
      avatar.startTalking(text);

      if (ttsEnabled) voice.speak(text);

      timeline.log({
        type: "system_event", source: "proactive",
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-emma-950 via-emma-900 to-emma-950 text-emma-100 font-sans overflow-hidden">
      <Header
        persona={persona}
        visionActive={vision.active}
        ttsBackend={voice.ttsBackend}
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

      <UpgradePrompt enabled={true} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — vision, memory, routines, schedules, timeline, users */}
        <aside className="w-80 border-l border-surface-border bg-emma-950/40 overflow-y-auto flex flex-col gap-4 p-4">
          {/* Vision */}
          <VisionPanel
            active={vision.active}
            supported={vision.supported}
            analyzing={vision.analyzing}
            lastAnalysis={vision.lastAnalysis}
            previewRef={vision.previewRef}
            onToggle={handleVisionToggle}
            onAnalyze={handleVisionAnalyze}
          />
          {/* Memory */}
          <MemoryPanel
            memories={memories}
            loading={memoriesLoading}
            onRefresh={fetchMemories}
            onDelete={deleteMemory}
            onExtract={extractMemories}
            extracting={memoryExtracting}
          />
          {/* Routines */}
          <RoutinePanel
            onActivate={(id) => executeRoutineById(id, "user")}
            activeRoutineId={activeRoutineId}
            onCreate={handleCreateRoutine}
            onDelete={handleDeleteRoutine}
          />
          {/* Schedule */}
          <SchedulePanel
            schedules={scheduler.schedules}
            onToggle={scheduler.toggleSchedule}
            onRemove={scheduler.removeSchedule}
          />
          {/* Timeline */}
          <TimelinePanel entries={timeline.entries} />
          {/* Users */}
          <UserPanel
            users={multiUser.users}
            activeUser={multiUser.activeUser}
            onSwitch={multiUser.switchUser}
            onAdd={multiUser.addUser}
            onRemove={multiUser.removeUser}
          />
        </aside>

        {/* ── Main Content Area: Avatar + Chat ─── */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* Side layout: avatar panel + chat panel side by side */}
          {avatar.state.layout === "side" && avatar.state.visible && (
            <div className="w-[280px] shrink-0 border-r border-surface-border bg-emma-950/60">
              <AvatarCanvas
                state={avatar.state}
                canvasRef={avatar.canvasRef}
                onInit={avatar.init}
                onToggleVisible={avatar.toggleVisible}
                onSetLayout={avatar.setLayout}
              />
            </div>
          )}

          {/* Overlay layout: avatar behind chat at reduced opacity */}
          {avatar.state.layout === "overlay" && avatar.state.visible && (
            <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
              <AvatarCanvas
                state={avatar.state}
                canvasRef={avatar.canvasRef}
                onInit={avatar.init}
                onToggleVisible={avatar.toggleVisible}
                onSetLayout={avatar.setLayout}
              />
            </div>
          )}

          {/* Chat panel (always visible) */}
          <div className={`flex-1 ${avatar.state.layout === "overlay" ? "relative z-10" : ""}`}>
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

          {/* Show avatar button when hidden */}
          {!avatar.state.visible && (
            <button
              onClick={avatar.toggleVisible}
              className="absolute bottom-20 right-4 z-20 px-3 py-2 rounded-full bg-emma-300/10 border border-emma-300/20 text-emma-300/50 text-[11px] hover:text-emma-300 cursor-pointer transition-all"
            >
              👤 Show Emma
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
