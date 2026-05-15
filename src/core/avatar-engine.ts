"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { AvatarExpression, AvatarState, AvatarLayout } from "@/types/emma";

// ─── Timing Constants ────────────────────────────────────────────────────────

const TRANSITION_DURATIONS: Partial<Record<AvatarExpression, number>> = {
  neutral: 600,
  smirk: 400,
  warm: 500,
  concerned: 300,
  amused: 250,
  flirty: 700,
  sad: 600,
  skeptical: 350,
  listening: 300,
  idle_bored: 500,
};

const IDLE_BORED_TIMEOUT = 30_000;
const IDLE_SIGH_TIMEOUT = 60_000;
const NEUTRAL_DELAY = 3000;

// Idle variant intervals (ms)
const BLINK_MIN = 2000;
const BLINK_MAX = 6000;
const BREATH_CYCLE = 4000;
const MICRO_MOVE_MIN = 5000;
const MICRO_MOVE_MAX = 12000;

// ─── Idle Behavior Definitions ───────────────────────────────────────────────

type IdleBehavior =
  | "blink"
  | "slow_blink"
  | "double_blink"
  | "breath_deep"
  | "head_micro"
  | "look_away"
  | "weight_shift"
  | "sigh";

interface IdleVariant {
  type: IdleBehavior;
  weight: number; // Probability weight
  duration: number; // ms
}

const IDLE_VARIANTS: IdleVariant[] = [
  { type: "blink", weight: 30, duration: 200 },
  { type: "slow_blink", weight: 10, duration: 600 },
  { type: "double_blink", weight: 8, duration: 400 },
  { type: "breath_deep", weight: 15, duration: 2000 },
  { type: "head_micro", weight: 15, duration: 1500 },
  { type: "look_away", weight: 10, duration: 2500 },
  { type: "weight_shift", weight: 8, duration: 2000 },
  { type: "sigh", weight: 4, duration: 1800 },
];

function pickIdleVariant(): IdleVariant {
  const total = IDLE_VARIANTS.reduce((s, v) => s + v.weight, 0);
  let roll = Math.random() * total;
  for (const v of IDLE_VARIANTS) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return IDLE_VARIANTS[0];
}

// ─── Hook Return Type ────────────────────────────────────────────────────────

interface UseAvatarReturn {
  state: AvatarState;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  init: () => Promise<boolean>;
  setExpression: (expr: AvatarExpression) => void;
  startTalking: (text: string) => void;
  startTalkingWithAudio: (audioBlob: Blob) => void;
  stopTalking: () => void;
  setListening: () => void;
  setLayout: (layout: AvatarLayout) => void;
  toggleVisible: () => void;
  destroy: () => void;
  resetIdleTimer: () => void;
}

/**
 * Live2D avatar controller with:
 * - Expression transitions with per-expression fade
 * - Audio-driven lip sync (analyzes ElevenLabs audio via Web Audio API)
 * - Text-based lip sync fallback
 * - Rich idle behavior system (blink, breathe, micro-move, sigh, look away)
 * - Placeholder mode (CSS animated) when no Live2D model
 */
export function useAvatar(): UseAvatarReturn {
  const [state, setState] = useState<AvatarState>({
    loaded: false,
    expression: "neutral",
    talking: false,
    layout: "side",
    visible: true,
    idleSince: Date.now(),
  });

  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sighTimerRef = useRef<NodeJS.Timeout | null>(null);
  const neutralTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lipSyncFrameRef = useRef<number | null>(null);
  const idleBehaviorRef = useRef<NodeJS.Timeout | null>(null);
  const breathFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Idle Behavior Loop ─────────────────────────────────────────────────────

  const runIdleBehavior = useCallback((model: any) => {
    if (!model) return;

    const variant = pickIdleVariant();
    const core = model?.internalModel?.coreModel;
    if (!core) return;

    const setParam = (id: string, value: number) => {
      try {
        core.setParameterValueById(id, value);
      } catch {}
    };

    switch (variant.type) {
      case "blink":
        setParam("ParamEyeLOpen", 0);
        setParam("ParamEyeROpen", 0);
        setTimeout(() => {
          setParam("ParamEyeLOpen", 1);
          setParam("ParamEyeROpen", 1);
        }, 150);
        break;

      case "slow_blink":
        setParam("ParamEyeLOpen", 0.2);
        setParam("ParamEyeROpen", 0.2);
        setTimeout(() => {
          setParam("ParamEyeLOpen", 1);
          setParam("ParamEyeROpen", 1);
        }, 500);
        break;

      case "double_blink":
        setParam("ParamEyeLOpen", 0);
        setParam("ParamEyeROpen", 0);
        setTimeout(() => {
          setParam("ParamEyeLOpen", 1);
          setParam("ParamEyeROpen", 1);
          setTimeout(() => {
            setParam("ParamEyeLOpen", 0);
            setParam("ParamEyeROpen", 0);
            setTimeout(() => {
              setParam("ParamEyeLOpen", 1);
              setParam("ParamEyeROpen", 1);
            }, 120);
          }, 150);
        }, 120);
        break;

      case "breath_deep":
        // Handled by continuous breathing loop
        setParam("ParamBreath", 1);
        setTimeout(() => setParam("ParamBreath", 0), 1500);
        break;

      case "head_micro":
        const dx = (Math.random() - 0.5) * 6;
        const dy = (Math.random() - 0.5) * 4;
        setParam("ParamAngleX", dx);
        setParam("ParamAngleY", dy);
        setTimeout(() => {
          setParam("ParamAngleX", 0);
          setParam("ParamAngleY", 0);
        }, 1200);
        break;

      case "look_away":
        const dir = Math.random() > 0.5 ? 0.6 : -0.6;
        setParam("ParamEyeBallX", dir);
        setParam("ParamAngleX", dir * 5);
        setTimeout(() => {
          setParam("ParamEyeBallX", 0);
          setParam("ParamAngleX", 0);
        }, 2000);
        break;

      case "weight_shift":
        const bodyX = (Math.random() - 0.5) * 6;
        setParam("ParamBodyAngleX", bodyX);
        setTimeout(() => setParam("ParamBodyAngleX", 0), 1500);
        break;

      case "sigh":
        // Deep exhale — mouth slightly open, body drops
        setParam("ParamMouthOpenY", 0.15);
        setParam("ParamBodyAngleZ", -2);
        setTimeout(() => {
          setParam("ParamMouthOpenY", 0);
          setParam("ParamBodyAngleZ", 0);
        }, 1500);
        break;
    }

    // Schedule next idle behavior
    const nextDelay = MICRO_MOVE_MIN + Math.random() * (MICRO_MOVE_MAX - MICRO_MOVE_MIN);
    idleBehaviorRef.current = setTimeout(() => runIdleBehavior(model), nextDelay);
  }, []);

  // ── Continuous Breathing ───────────────────────────────────────────────────

  const startBreathing = useCallback((model: any) => {
    if (!model) return;
    const core = model?.internalModel?.coreModel;
    if (!core) return;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const phase = ((elapsed % BREATH_CYCLE) / BREATH_CYCLE) * Math.PI * 2;
      const breath = (Math.sin(phase) + 1) * 0.5; // 0 to 1
      try {
        core.setParameterValueById("ParamBreath", breath * 0.6);
      } catch {}
      breathFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  // ── Idle Timer Reset ───────────────────────────────────────────────────────

  const resetIdleTimer = useCallback(() => {
    setState((s) => ({ ...s, idleSince: Date.now() }));

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sighTimerRef.current) clearTimeout(sighTimerRef.current);

    // 30s → bored expression
    idleTimerRef.current = setTimeout(() => {
      if (modelRef.current) {
        try {
          modelRef.current.expression("idle_bored");
        } catch {}
      }
      setState((s) => ({ ...s, expression: "idle_bored" }));
    }, IDLE_BORED_TIMEOUT);

    // 60s → sigh behavior
    sighTimerRef.current = setTimeout(() => {
      const model = modelRef.current;
      if (model) {
        const core = model?.internalModel?.coreModel;
        if (core) {
          try {
            core.setParameterValueById("ParamMouthOpenY", 0.2);
            core.setParameterValueById("ParamBodyAngleZ", -2);
          } catch {}
          setTimeout(() => {
            try {
              core.setParameterValueById("ParamMouthOpenY", 0);
              core.setParameterValueById("ParamBodyAngleZ", 0);
            } catch {}
          }, 1500);
        }
      }
    }, IDLE_SIGH_TIMEOUT);
  }, []);

  // ── Initialize ─────────────────────────────────────────────────────────────

  const init = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !canvasRef.current) return false;
    if (appRef.current) return true;

    try {
      // Skip Live2D init entirely if model files aren't present — avoids the
      // "Cannot find Cubism 2 runtime" console error from pixi-live2d-display.
      try {
        const probe = await fetch("/live2d/emma/emma.model3.json", { method: "HEAD" });
        if (!probe.ok) {
          setState((s) => ({ ...s, loaded: false }));
          resetIdleTimer();
          return false;
        }
      } catch {
        setState((s) => ({ ...s, loaded: false }));
        resetIdleTimer();
        return false;
      }

      const PIXI = await import("pixi.js");
      const { Live2DModel } = await import("pixi-live2d-display");
      (window as any).PIXI = PIXI;

      const app = new PIXI.Application({
        view: canvasRef.current,
        backgroundAlpha: 0,
        resizeTo: canvasRef.current.parentElement || undefined,
        antialias: true,
      });
      appRef.current = app;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = (await Live2DModel.from("/live2d/emma/emma.model3.json", {
          autoInteract: true,
          autoUpdate: true,
        })) as any;

        model.anchor.set(0.5, 0.5);
        model.scale.set(0.25);
        model.x = app.screen.width / 2;
        model.y = app.screen.height * 0.55;

        app.stage.addChild(model as any);
        modelRef.current = model;

        // Hit area interactions
        model.on("hit", (hitAreas: string[]) => {
          if (hitAreas.includes("Head")) {
            try {
              model.motion("Tap_Head");
            } catch {}
            setState((s) => ({ ...s, expression: "amused" }));
          }
          if (hitAreas.includes("Body")) {
            try {
              model.motion("Tap_Body");
            } catch {}
            setState((s) => ({ ...s, expression: "skeptical" }));
            setTimeout(() => {
              try {
                model.expression("flirty");
              } catch {}
              setState((s) => ({ ...s, expression: "flirty" }));
            }, 800);
          }
        });

        // Start idle behaviors
        startBreathing(model);
        const firstIdleDelay = BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN);
        idleBehaviorRef.current = setTimeout(() => runIdleBehavior(model), firstIdleDelay);

        setState((s) => ({ ...s, loaded: true }));
        resetIdleTimer();
        return true;
      } catch {
        // No model files — placeholder mode, still run idle state updates
        setState((s) => ({ ...s, loaded: false }));
        resetIdleTimer();
        return false;
      }
    } catch (err) {
      console.error("[EMMA Avatar] Init failed:", err);
      return false;
    }
  }, [resetIdleTimer, runIdleBehavior, startBreathing]);

  // ── Set Expression ─────────────────────────────────────────────────────────

  const setExpression = useCallback(
    (expr: AvatarExpression) => {
      resetIdleTimer();
      setState((s) => ({ ...s, expression: expr }));

      if (modelRef.current) {
        try {
          modelRef.current.expression(expr);
        } catch {}
      }

      if (expr !== "neutral" && expr !== "idle_bored" && expr !== "listening") {
        if (neutralTimerRef.current) clearTimeout(neutralTimerRef.current);
        neutralTimerRef.current = setTimeout(
          () => {
            if (modelRef.current) {
              try {
                modelRef.current.expression("neutral");
              } catch {}
            }
            setState((s) => ({ ...s, expression: "neutral" }));
          },
          NEUTRAL_DELAY + (TRANSITION_DURATIONS[expr] || 400)
        );
      }
    },
    [resetIdleTimer]
  );

  // ── Audio-Driven Lip Sync ──────────────────────────────────────────────────

  const startTalkingWithAudio = useCallback(
    (audioBlob: Blob) => {
      resetIdleTimer();
      setState((s) => ({ ...s, talking: true }));

      if (modelRef.current) {
        try {
          modelRef.current.motion("Talk", 0, 2);
        } catch {}
      }

      // Create audio context + analyzer
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaElementSource(audio);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256;
      analyzer.smoothingTimeConstant = 0.5;
      source.connect(analyzer);
      analyzer.connect(ctx.destination);

      const dataArray = new Uint8Array(analyzer.frequencyBinCount);

      const animate = () => {
        analyzer.getByteFrequencyData(dataArray);

        // Average amplitude in speech range (85-300Hz → bins ~1-8 at 256 FFT / 44.1kHz)
        let sum = 0;
        const speechBins = Math.min(16, dataArray.length);
        for (let i = 0; i < speechBins; i++) {
          sum += dataArray[i];
        }
        const avg = sum / speechBins / 255; // 0-1
        const mouthOpen = Math.min(1, avg * 2.5); // Amplify for visible movement

        if (modelRef.current) {
          const core = modelRef.current?.internalModel?.coreModel;
          if (core) {
            try {
              core.setParameterValueById("ParamMouthOpenY", mouthOpen);
            } catch {}
          }
        }

        lipSyncFrameRef.current = requestAnimationFrame(animate);
      };

      audio.onplay = () => {
        if (ctx.state === "suspended") ctx.resume();
        animate();
      };

      audio.onended = () => {
        if (lipSyncFrameRef.current) {
          cancelAnimationFrame(lipSyncFrameRef.current);
          lipSyncFrameRef.current = null;
        }
        if (modelRef.current) {
          const core = modelRef.current?.internalModel?.coreModel;
          if (core) {
            try {
              core.setParameterValueById("ParamMouthOpenY", 0);
            } catch {}
          }
        }
        URL.revokeObjectURL(url);
        setState((s) => ({ ...s, talking: false }));
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setState((s) => ({ ...s, talking: false }));
      };

      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        setState((s) => ({ ...s, talking: false }));
      });
    },
    [resetIdleTimer]
  );

  // ── Text-Based Lip Sync (fallback) ─────────────────────────────────────────

  const startTalking = useCallback(
    (text: string) => {
      resetIdleTimer();
      setState((s) => ({ ...s, talking: true }));

      if (modelRef.current) {
        try {
          modelRef.current.motion("Talk", 0, 2);
        } catch {}
      }

      const words = text.split(" ").length;
      const durationMs = words * 250;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= durationMs) {
          if (modelRef.current) {
            const core = modelRef.current?.internalModel?.coreModel;
            if (core) {
              try {
                core.setParameterValueById("ParamMouthOpenY", 0);
              } catch {}
            }
          }
          setState((s) => ({ ...s, talking: false }));
          return;
        }
        if (modelRef.current) {
          const phase = (elapsed / 150) * Math.PI;
          const mouthOpen = Math.abs(Math.sin(phase)) * 0.7;
          const core = modelRef.current?.internalModel?.coreModel;
          if (core) {
            try {
              core.setParameterValueById("ParamMouthOpenY", mouthOpen);
            } catch {}
          }
        }
        lipSyncFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    },
    [resetIdleTimer]
  );

  const stopTalking = useCallback(() => {
    if (lipSyncFrameRef.current) {
      cancelAnimationFrame(lipSyncFrameRef.current);
      lipSyncFrameRef.current = null;
    }
    if (modelRef.current) {
      const core = modelRef.current?.internalModel?.coreModel;
      if (core) {
        try {
          core.setParameterValueById("ParamMouthOpenY", 0);
        } catch {}
      }
      try {
        modelRef.current.motion("Idle", undefined, 1);
      } catch {}
    }
    setState((s) => ({ ...s, talking: false }));
  }, []);

  const setListening = useCallback(() => {
    resetIdleTimer();
    setExpression("listening");
  }, [resetIdleTimer, setExpression]);

  const setLayout = useCallback((layout: AvatarLayout) => {
    setState((s) => ({ ...s, layout }));
  }, []);

  const toggleVisible = useCallback(() => {
    setState((s) => ({ ...s, visible: !s.visible }));
  }, []);

  const destroy = useCallback(() => {
    if (lipSyncFrameRef.current) cancelAnimationFrame(lipSyncFrameRef.current);
    if (breathFrameRef.current) cancelAnimationFrame(breathFrameRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sighTimerRef.current) clearTimeout(sighTimerRef.current);
    if (neutralTimerRef.current) clearTimeout(neutralTimerRef.current);
    if (idleBehaviorRef.current) clearTimeout(idleBehaviorRef.current);
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    if (appRef.current) {
      try {
        appRef.current.destroy(true);
      } catch {}
      appRef.current = null;
    }
    modelRef.current = null;
    setState((s) => ({ ...s, loaded: false }));
  }, []);

  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    state,
    canvasRef,
    init,
    setExpression,
    startTalking,
    startTalkingWithAudio,
    stopTalking,
    setListening,
    setLayout,
    toggleVisible,
    destroy,
    resetIdleTimer,
  };
}
