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
const IDLE_FIRST_DELAY_MIN = 2000;
const IDLE_FIRST_DELAY_MAX = 6000;
const MICRO_MOVE_MIN = 5000;
const MICRO_MOVE_MAX = 12000;

// ─── Idle Behavior Definitions ───────────────────────────────────────────────

type IdleBehavior = "head_micro" | "look_away" | "weight_shift" | "sigh";

interface IdleVariant {
  type: IdleBehavior;
  weight: number; // Probability weight
  duration: number; // ms
}

const IDLE_VARIANTS: IdleVariant[] = [
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
  startTalkingContinuous: (onAudioStart?: () => void) => void;
  startTalkingWithAudio: (audioBlob: Blob, onAudioStart?: () => void) => void;
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
    // eslint-disable-next-line react-hooks/purity
    idleSince: Date.now(),
  });

  const canvasRef = useRef<HTMLCanvasElement>(null!);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelRef = useRef<any>(null);
  const hitListenerRef = useRef<((e: PointerEvent) => void) | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sighTimerRef = useRef<NodeJS.Timeout | null>(null);
  const neutralTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lipSyncFrameRef = useRef<number | null>(null);
  const idleBehaviorRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Idle Behavior Loop ─────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runIdleBehavior = useCallback((model: any) => {
    if (!model) return;
    const core = model?.internalModel?.coreModel;
    if (!core) return;

    // Skip micro-behaviors when a NORMAL or FORCE motion is playing (e.g. talking).
    // pixi-live2d-display MotionPriority: NONE=0, IDLE=1, NORMAL=2, FORCE=3
    const mm = model?.internalModel?.motionManager;
    const currentPriority = mm?.state?.currentPriority ?? 0;
    const isMotionPlaying = currentPriority > 1;
    if (isMotionPlaying) {
      const nextDelay = MICRO_MOVE_MIN + Math.random() * (MICRO_MOVE_MAX - MICRO_MOVE_MIN);
      // eslint-disable-next-line react-hooks/immutability
      idleBehaviorRef.current = setTimeout(() => runIdleBehavior(model), nextDelay);
      return;
    }

    const variant = pickIdleVariant();

    // addParam: additive write — layers ON TOP of motion/breath without fighting them
    const addParam = (id: string, value: number, weight = 1.0) => {
      try {
        core.addParameterValueById(id, value, weight);
      } catch {}
    };
    // setParam: absolute write — used only for reset (snap back to 0)
    const setParam = (id: string, value: number) => {
      try {
        core.setParameterValueById(id, value);
      } catch {}
    };

    switch (variant.type) {
      case "head_micro": {
        const dx = (Math.random() - 0.5) * 6;
        const dy = (Math.random() - 0.5) * 4;
        addParam("ParamAngleX", dx, 0.3);
        addParam("ParamAngleY", dy, 0.3);
        setTimeout(() => {
          const mm = model?.internalModel?.motionManager;
          const currentPriority = mm?.state?.currentPriority ?? 0;
          if (currentPriority > 1) return; // don't fight a NORMAL/FORCE motion
          setParam("ParamAngleX", 0);
          setParam("ParamAngleY", 0);
        }, 1200);
        break;
      }

      case "look_away": {
        const dir = Math.random() > 0.5 ? 0.6 : -0.6;
        addParam("ParamEyeBallX", dir, 0.7);
        addParam("ParamAngleX", dir * 5, 0.5);
        setTimeout(() => {
          const mm = model?.internalModel?.motionManager;
          const currentPriority = mm?.state?.currentPriority ?? 0;
          if (currentPriority > 1) return; // don't fight a NORMAL/FORCE motion
          setParam("ParamEyeBallX", 0);
          setParam("ParamAngleX", 0);
        }, 2000);
        break;
      }

      case "weight_shift": {
        const bodyX = (Math.random() - 0.5) * 6;
        addParam("ParamBodyAngleX", bodyX, 0.4);
        setTimeout(() => {
          const mm = model?.internalModel?.motionManager;
          const currentPriority = mm?.state?.currentPriority ?? 0;
          if (currentPriority > 1) return; // don't fight a NORMAL/FORCE motion
          setParam("ParamBodyAngleX", 0);
        }, 1500);
        break;
      }

      case "sigh": {
        // Deep exhale — mouth slightly open, body drops
        addParam("ParamMouthOpenY", 0.15, 0.6);
        addParam("ParamBodyAngleZ", -2, 0.4);
        setTimeout(() => {
          const mm = model?.internalModel?.motionManager;
          const currentPriority = mm?.state?.currentPriority ?? 0;
          if (currentPriority > 1) return; // don't fight a NORMAL/FORCE motion — critical for mouth
          setParam("ParamMouthOpenY", 0);
          setParam("ParamBodyAngleZ", 0);
        }, 1500);
        break;
      }
    }

    // Schedule next idle behavior
    const nextDelay = MICRO_MOVE_MIN + Math.random() * (MICRO_MOVE_MAX - MICRO_MOVE_MIN);
    // eslint-disable-next-line react-hooks/immutability
    idleBehaviorRef.current = setTimeout(() => runIdleBehavior(model), nextDelay);
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
            const mm = model?.internalModel?.motionManager;
            const currentPriority = mm?.state?.currentPriority ?? 0;
            if (currentPriority > 1) return; // don't fight a NORMAL/FORCE motion — critical for mouth
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
        const probe = await fetch(
          `${window.location.origin}/live2d/emma/Design_genius_White/Design_genius(1).model3.json`,
          { method: "HEAD" }
        );
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

      // Load all pixi packages in parallel — avoids 4 sequential network round-trips.
      const [PIXI, { Live2DModel }, pixiDisplay, { utils: pixiUtils }] = await Promise.all([
        import("pixi.js"),
        import("pixi-live2d-display/cubism4"),
        import("@pixi/display"),
        import("@pixi/core"),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Live2DModel.registerTicker(PIXI.Ticker as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).PIXI = PIXI;

      // pixi-live2d-display uses top-level @pixi/display (a separate module instance
      // from pixi.js's nested @pixi/display). PixiJS v7's EventBoundary calls
      // isInteractive() on every display object, but the top-level @pixi/display
      // never has FederatedEventTarget mixin applied to it. Patch it here so
      // Live2DModel instances satisfy the EventBoundary contract.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proto = pixiDisplay.Container.prototype as any;
      if (typeof proto.isInteractive !== "function") {
        proto.isInteractive = function (this: { eventMode?: string }) {
          return this.eventMode === "static" || this.eventMode === "dynamic";
        };
      }

      // pixi-live2d-display calls utils.url.resolve (deprecated in PixiJS v7.3+).
      // Overwrite it as a plain data property so PixiJS's deprecated getter is
      // shadowed and never fires its console.warn. Also fixes Turbopack builds
      // where the underlying Node url.resolve is not polyfilled.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const urlShim = (pixiUtils as any)?.url;
      if (urlShim) {
        try {
          Object.defineProperty(urlShim, "resolve", {
            value: (base: string, path: string) => new URL(path, base).href,
            writable: true,
            configurable: true,
          });
        } catch {}
      }

      const app = new PIXI.Application({
        view: canvasRef.current,
        backgroundAlpha: 0,
        resizeTo: canvasRef.current.parentElement || undefined,
        antialias: true,
      });
      appRef.current = app;

      try {
        // autoHitTest disabled: the Automator sets model.eventMode = "static" which
        // triggers PixiJS v7 EventBoundary hit-walking before our @pixi/display
        // prototype patch can run. We replicate hit detection via canvas pointerdown.
        // autoFocus kept: head-tracking uses pointermove, not hit test events.
        const modelURL = `${window.location.origin}/live2d/emma/Design_genius_White/Design_genius(1).model3.json`;
        const model = (await Live2DModel.from(
          modelURL,
          {
            autoHitTest: false,
            autoFocus: true,
            autoUpdate: true,
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        )) as any;

        model.anchor.set(0.5, 0.5);
        model.scale.set(0.17);
        model.x = app.screen.width / 2;
        model.y = app.screen.height * 0.65;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.stage.addChild(model as any);
        modelRef.current = model;

        // Manual hit detection — avoids PixiJS v7 EventBoundary incompatibility
        const canvas = canvasRef.current;
        const onPointerDown = (e: PointerEvent) => {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = (e.clientX - rect.left) * scaleX;
          const y = (e.clientY - rect.top) * scaleY;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hitAreas: string[] = (model as any).hitTest(x, y) ?? [];
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
        };
        canvas.addEventListener("pointerdown", onPointerDown);
        hitListenerRef.current = onPointerDown;

        // Start idle behaviors
        // Note: CubismEyeBlink and CubismBreath already run every frame via pixi-live2d-display.
        // We only start the micro-behavior loop here; breathing/blinking are handled natively.
        const firstIdleDelay =
          IDLE_FIRST_DELAY_MIN + Math.random() * (IDLE_FIRST_DELAY_MAX - IDLE_FIRST_DELAY_MIN);
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
  }, [resetIdleTimer, runIdleBehavior]);

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
    (audioBlob: Blob, onAudioStart?: () => void) => {
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
      analyzer.fftSize = 512;
      analyzer.smoothingTimeConstant = 0.5;
      source.connect(analyzer);
      analyzer.connect(ctx.destination);

      const dataArray = new Uint8Array(analyzer.frequencyBinCount);

      // Lerp smoothing state — declared in closure so it persists across frames
      let prevMouth = 0;

      const animate = () => {
        analyzer.getByteFrequencyData(dataArray);

        // Average amplitude in speech range (85-300Hz → bins ~1-8 at 512 FFT / 44.1kHz)
        let sum = 0;
        const speechBins = Math.min(16, dataArray.length);
        for (let i = 0; i < speechBins; i++) {
          sum += dataArray[i];
        }
        const avg = sum / speechBins / 255; // 0-1
        // Cubic easing for visible jaw movement at typical ElevenLabs amplitudes
        const eased = Math.min(1, Math.pow(Math.min(1, avg * 3), 3));
        // Lerp: 40% old value, 60% new — more responsive than quintic
        prevMouth = prevMouth * 0.4 + eased * 0.6;

        if (modelRef.current) {
          const core = modelRef.current?.internalModel?.coreModel;
          if (core) {
            try {
              core.setParameterValueById("ParamMouthOpenY", prevMouth);
            } catch {}
          }
        }

        lipSyncFrameRef.current = requestAnimationFrame(animate);
      };

      audio.onplay = async () => {
        if (ctx.state === "suspended") await ctx.resume();
        onAudioStart?.(); // fire expression callback synced to audio playback
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
        onAudioStart?.(); // fire expression even on audio error
        URL.revokeObjectURL(url);
        setState((s) => ({ ...s, talking: false }));
      };

      audio.play().catch(() => {
        onAudioStart?.(); // fire expression even if audio is blocked by autoplay policy
        URL.revokeObjectURL(url);
        setState((s) => ({ ...s, talking: false }));
      });
    },
    [resetIdleTimer]
  );

  // ── Continuous Lip Sync (WebSpeech — driven by utterance events, not timer) ──

  const startTalkingContinuous = useCallback(
    (onAudioStart?: () => void) => {
      resetIdleTimer();
      setState((s) => ({ ...s, talking: true }));

      if (modelRef.current) {
        try {
          modelRef.current.motion("Talk", 0, 2);
        } catch {}
      }

      // Fire after motion() so Talk motion doesn't stomp the expression set by the callback
      onAudioStart?.();

      const animate = () => {
        if (modelRef.current) {
          const phase = (Date.now() / 150) * Math.PI;
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
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sighTimerRef.current) clearTimeout(sighTimerRef.current);
    if (neutralTimerRef.current) clearTimeout(neutralTimerRef.current);
    if (idleBehaviorRef.current) clearTimeout(idleBehaviorRef.current);
    if (hitListenerRef.current && canvasRef.current) {
      canvasRef.current.removeEventListener("pointerdown", hitListenerRef.current);
      hitListenerRef.current = null;
    }
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
    startTalkingContinuous,
    startTalkingWithAudio,
    stopTalking,
    setListening,
    setLayout,
    toggleVisible,
    destroy,
    resetIdleTimer,
  };
}
