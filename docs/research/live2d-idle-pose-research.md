# Live2D Idle Animation & Pose Research

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: pixi-live2d-display source, Cubism 5 SDK Web Samples, Live2D model3.json format — live-browsed 2026-05-31.

---

## Emma's Current Idle State

Emma's `runIdleBehavior()` (in `src/core/avatar-engine.ts`) is a **custom, parameter-direct idle system**. It does NOT use Live2D's built-in motion system at all.

### What Emma currently does

```typescript
// Every 5–12 seconds, randomly picks one of 8 behaviors:
const IDLE_VARIANTS = [
  { type: "blink", weight: 30, duration: 200 },
  { type: "slow_blink", weight: 10, duration: 600 },
  { type: "double_blink", weight: 8, duration: 400 },
  { type: "breath_deep", weight: 15, duration: 2000 },
  { type: "head_micro", weight: 15, duration: 1500 },
  { type: "look_away", weight: 10, duration: 2500 },
  { type: "weight_shift", weight: 8, duration: 2000 },
  { type: "sigh", weight: 4, duration: 1800 },
];

// All implemented via setParameterValueById() + setTimeout() pairs
// e.g. weight_shift: setParam("ParamBodyAngleX", ±3) → reset after 1500ms
```

Parameters Emma drives directly:

- `ParamEyeLOpen` / `ParamEyeROpen` — blink variants
- `ParamBreath` — breath deep
- `ParamAngleX` / `ParamAngleY` — head micro-movement
- `ParamEyeBallX` — look away
- `ParamBodyAngleX` — weight shift
- `ParamMouthOpenY` + `ParamBodyAngleZ` — sigh

Separate continuous breathing loop via `requestAnimationFrame`:

```typescript
const breath = (Math.sin(phase) + 1) * 0.5; // 0–1, 4s cycle
core.setParameterValueById("ParamBreath", breath * 0.6);
```

Idle timer escalation:

- 0s: continuous idle behaviors (blink/breath/micro-move)
- 30s: `idle_bored` expression set
- 60s: "sigh" behavior triggered

### Gaps in the current system

1. **No `.motion3.json` idle motions used** — the model's built-in `"Idle"` motion group (if present) is never played. pixi-live2d-display would play these automatically, but Emma's custom parameter loop conflicts with them.
2. **`setParameterValueById` overwrites motion data** — uses absolute set which replaces values the motion system writes. Should use `addParameterValueById` with a weight for blending.
3. **No smooth lerp between idle states** — snaps to values immediately, then snaps back via `setTimeout`. No easing.
4. **Breath duplicates CubismBreath** — the internal model already runs `CubismBreath` on `ParamBreath`, `ParamAngleX/Y/Z`, and `ParamBodyAngleX`. Emma's manual loop doubles up.
5. **Blink duplicates CubismEyeBlink** — pixi-live2d-display auto-blinks via `CubismEyeBlink.updateParameters()` if the model has `EyeBlink` parameter groups. Emma's manual blink fires on top.
6. **Idle loop runs during talking** — no guard to pause micro-behaviors when a NORMAL/FORCE motion (talking) is active.

---

## How pixi-live2d-display Handles Idle Natively

### Motion Priority System

pixi-live2d-display uses a 4-level priority queue (`MotionState.ts`):

```typescript
enum MotionPriority {
  NONE, // 0 — no motion playing; not assignable to a motion
  IDLE, // 1 — auto-idle; blocked if ANY other motion is playing
  NORMAL, // 2 — standard tap/interaction motions
  FORCE, // 3 — always plays, preempts everything
}
```

**Idle auto-play loop** — from `MotionManager.update()`:

```typescript
update(model, now): boolean {
  if (this.isFinished()) {
    this.playing = false;
    this.emit("motionFinish");
    if (this.state.shouldOverrideExpression()) {
      this.expressionManager?.restoreExpression();
    }
    this.state.complete();
    if (this.state.shouldRequestIdleMotion()) {
      // Auto-starts a random motion from the "Idle" group
      this.startRandomMotion(this.groups.idle, MotionPriority.IDLE);
    }
  }
  return this.updateParameters(model, now);
}
```

**Key rule**: `MotionPriority.IDLE` is blocked if `currentPriority !== NONE`. Any NORMAL or FORCE motion prevents idle from starting.

### The Idle Group Name

Cubism 4 models: `groups.idle = "Idle"` (capital I, hardcoded in `Cubism4MotionManager`)

In `model3.json`, the Idle group structure:

```json
"Motions": {
  "Idle": [
    {
      "File": "motions/haru_g_idle.motion3.json",
      "FadeInTime": 0.5,
      "FadeOutTime": 0.5
    },
    {
      "File": "motions/haru_g_m15.motion3.json",
      "FadeInTime": 0.5,
      "FadeOutTime": 0.5
    }
  ],
  "TapBody": [
    {
      "File": "motions/haru_g_m26.motion3.json",
      "FadeInTime": 0.5,
      "FadeOutTime": 0.5,
      "Sound": "sounds/haru_talk_13.wav"
    }
  ]
}
```

Multiple idle motions — the system picks randomly from those not currently active. Motions can have associated audio (`.wav`).

### Motion Fading Config Defaults

```typescript
// From pixi-live2d-display src/config.ts
export const config = {
  motionFadingDuration: 500, // ms — standard NORMAL/FORCE motions
  idleMotionFadingDuration: 2000, // ms — idle motions fade in/out slower
  expressionFadingDuration: 500, // ms
  preserveExpressionOnMotion: true, // expressions survive motion changes
  sound: true, // play .wav files associated with motions
  motionSync: true, // wait for audio to load before starting motion
};
```

### Playing Motions from TypeScript

```typescript
const mm = model.internalModel.motionManager;

// High-level: play random motion from group (NORMAL priority)
await model.motion("Idle"); // random from "Idle" group
await model.motion("TapBody", 2); // specific index, NORMAL priority
// Returns Promise<boolean> — false if blocked by higher priority

// Low-level: explicit priority
await mm.startMotion("Idle", 0, MotionPriority.NORMAL);
await mm.startRandomMotion("Idle", MotionPriority.IDLE); // auto-idle
await mm.startMotion("TapBody", 0, MotionPriority.FORCE); // interrupts all

// Stop all motions (triggers idle auto-play on next update())
mm.stopAllMotions();
```

### Motion Events

```typescript
mm.on("motionStart", (group, index, audio) => {
  console.log(`Playing: ${group}[${index}]`);
});

mm.on("motionFinish", () => {
  // Motion ended — system will auto-queue next idle
});

// Motion-specific sound events (from motion3.json UserData markers)
model.internalModel.on("motion:someEvent", () => {
  /* sound marker hit */
});
```

### Preload Strategy

```typescript
const model = await Live2DModel.from("model.json", {
  motionPreload: MotionPreloadStrategy.IDLE, // default: preload idle only
  // MotionPreloadStrategy.ALL  — preload everything upfront
  // MotionPreloadStrategy.NONE — load each motion on first play
  idleMotionGroup: "Idle", // override idle group name if model uses different name
});
```

---

## Built-in Effects That Run Automatically

The `Cubism4InternalModel` runs these **every frame** without any calls needed — Emma's manual code may be conflicting:

| Effect         | Class            | Parameters driven                                       | Notes                                          |
| -------------- | ---------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Breathing      | `CubismBreath`   | `ParamAngleX/Y/Z`, `ParamBodyAngleX`, `ParamBreath`     | Sine-wave oscillation, always active           |
| Eye blink      | `CubismEyeBlink` | `ParamEyeLOpen`, `ParamEyeROpen`                        | Auto-blinks if model has `EyeBlink` group      |
| Focus tracking | `updateFocus()`  | `ParamEyeBallX/Y`, `ParamAngleX/Y/Z`, `ParamBodyAngleX` | Driven by mouse position via `focusController` |
| Pose/parts     | `CubismPose`     | Part opacities                                          | Auto-manages costume variant cross-fading      |

**`CubismBreath` parameters** (from `Cubism4InternalModel.init()`):

```typescript
this.breath.setParameters([
  new BreathParameterData(ParamAngleX, 0.0, 15.0, 6.5345, 0.5),
  new BreathParameterData(ParamAngleY, 0.0, 8.0, 3.5345, 0.5),
  new BreathParameterData(ParamAngleZ, 0.0, 10.0, 5.5345, 0.5),
  new BreathParameterData(ParamBodyAngleX, 0.0, 4.0, 15.5345, 0.5),
  new BreathParameterData(ParamBreath, 0.0, 0.5, 3.2345, 0.5),
  //  (parameterId, offset, peak, cycle_seconds, weight)
]);
```

Emma's `startBreathing()` drives `ParamBreath` manually — it stacks with this.

---

## The `.pose3.json` System — What It Is and Is NOT

**Critical disambiguation**: In Live2D SDK terminology, "Pose" does NOT mean body posture (standing/sitting/leaning). It means **mutually exclusive body part visibility groups**.

### What `.pose3.json` Controls

```json
{
  "Type": "Live2D Pose",
  "Groups": [
    [
      { "Id": "Part01ArmRA001", "Link": [] },
      { "Id": "Part01ArmRB001", "Link": [] }
    ],
    [
      { "Id": "Part01ArmLA001", "Link": [] },
      { "Id": "Part01ArmLB001", "Link": [] }
    ]
  ]
}
```

Each inner array is a **mutually exclusive group**. When `Part01ArmRA001` is shown (opacity 1), `Part01ArmRB001` fades to 0. `CubismPose.updateParameters()` manages these cross-fades automatically every frame.

**You do not manually switch these** — the Cubism Pose system reads part opacities from the model parameters and applies automatic cross-fading transitions between variants.

The `"Link"` array specifies dependent parts that change together:

```json
{ "Id": "Part01ArmRA001", "Link": ["Part01HandRA001", "Part01SleeveRA001"] }
```

### How CubismPose is Loaded

```typescript
// In Cubism4InternalModel — auto-managed:
declare pose?: CubismPose;  // undefined if no pose3.json

// In update():
this.pose?.updateParameters(model, dt);  // called every frame
```

---

## Body "Pose" (Posture) — How It Actually Works

Since `.pose3.json` manages costume parts, **body posture** (standing, sitting, tilted) is controlled differently:

### 1. Motion Files (Primary Method)

A "sitting" or "leaning" pose is a separate set of `.motion3.json` files. The model's artwork has parts drawn for that angle; the motion file drives parameters to that configuration. You switch by playing a transition motion.

### 2. Direct Parameter Control (Simple Adjustments)

Standard Cubism body parameters:

```
ParamAngleX:     -30 to +30  (head left/right)
ParamAngleY:     -30 to +30  (head up/down)
ParamAngleZ:     -30 to +30  (head tilt/roll)
ParamBodyAngleX: -10 to +10  (body left/right sway)
ParamBodyAngleY: -10 to +10  (body front/back lean)
ParamBodyAngleZ: -10 to +10  (body rotation)
ParamBreath:       0 to  1   (breathing intensity)
ParamEyeBallX:    -1 to +1   (eye direction horizontal)
ParamEyeBallY:    -1 to +1   (eye direction vertical)
ParamEyeLOpen:     0 to  1   (left eye open)
ParamEyeROpen:     0 to  1   (right eye open)
ParamMouthOpenY:   0 to  1   (mouth open amount)
```

These are the standard IDs. Always verify with `core.getModel().parameters.ids`.

### 3. Model-specific Parameters

Some models expose a `ParamPose` or `ParamBodySwitch` that gates which part group is shown. This is entirely model-specific — depends on how the Cubism Editor project was authored.

---

## setParameterValueById vs addParameterValueById

This is the single most important technical detail for Emma's idle system:

```typescript
// ABSOLUTE — overwrites the motion system's output
// Use only when no motion is playing, or for things that should fully override
coreModel.setParameterValueById("ParamAngleX", 5.0);

// ADDITIVE — blends ON TOP of whatever the motion/breath/focus already set
// Use for micro-behaviors that should layer without fighting the motion
coreModel.addParameterValueById("ParamAngleX", 2.0, 0.3);
//                                               ^    ^ weight (0–1, default 1.0)
```

Emma's current `runIdleBehavior` uses `setParameterValueById` for all micro-behaviors. This overwrites motion data and conflicts with `CubismBreath`. The fix is `addParameterValueById` with a modest weight (0.2–0.4).

---

## Idle Motion Integration Strategy for Emma

### Step 1 — Check if model has idle motions

```typescript
const mm = model.internalModel.motionManager;
const hasIdleGroup = !!mm.definitions["Idle"]?.length;

if (hasIdleGroup) {
  // Use built-in idle — do NOT run manual parameter loop simultaneously
  // pixi-live2d-display will auto-play idle when no other motion is active
} else {
  // No idle motions in model — continue with manual parameter loop
  runIdleBehavior(model);
}
```

### Step 2 — Fix the manual loop for models without idle motions

For the manual `runIdleBehavior`, switch to `addParameterValueById`:

```typescript
// weight_shift — additive, won't fight CubismBreath
core.addParameterValueById("ParamBodyAngleX", bodyX, 0.4);

// head_micro — additive on top of focus tracking
core.addParameterValueById("ParamAngleX", dx, 0.3);
core.addParameterValueById("ParamAngleY", dy, 0.3);

// look_away — higher weight, more intentional
core.addParameterValueById("ParamEyeBallX", dir, 0.7);
core.addParameterValueById("ParamAngleX", dir * 5, 0.5);
```

Remove: manual `blink` (CubismEyeBlink handles it), `breath_deep` / `startBreathing()` (CubismBreath handles it).

### Step 3 — Pause micro-behaviors during talking

```typescript
// In runIdleBehavior, add a guard:
const isMotionPlaying = mm.state.currentPriority > MotionPriority.IDLE;
if (isMotionPlaying) {
  // Skip this tick — motion system owns the parameters
  const nextDelay = MICRO_MOVE_MIN + Math.random() * (MICRO_MOVE_MAX - MICRO_MOVE_MIN);
  idleBehaviorRef.current = setTimeout(() => runIdleBehavior(model), nextDelay);
  return;
}
```

---

## Pose Switching (Future Feature)

If Emma's model is authored with multiple idle groups (e.g., `"Idle"`, `"Idle_Lean"`, `"Idle_Tired"`), pose switching works like this:

### Override the active idle group at runtime

```typescript
// Switch idle group
model.internalModel.motionManager.groups.idle = "Idle_Tired";

// Force re-pick from new group
model.internalModel.motionManager.stopAllMotions();
// → auto-play will now pick from "Idle_Tired"
```

### Play transition motions between poses

```typescript
type PoseState = "standing" | "lean" | "tired";

async function switchPose(newPose: PoseState, model: any) {
  const mm = model.internalModel.motionManager;

  // 1. Play transition motion at NORMAL (interrupts current idle)
  const transitGroup = `To${newPose.charAt(0).toUpperCase()}${newPose.slice(1)}`;
  const started = await mm.startMotion(transitGroup, 0, 2 /* NORMAL */);

  if (!started) return; // blocked — try later

  // 2. On finish, switch idle group
  mm.once("motionFinish", () => {
    mm.groups.idle = `Idle_${newPose}`;
    mm.startRandomMotion(`Idle_${newPose}`, 1 /* IDLE */);
  });
}
```

### Pose triggered by emotion

A natural extension: map Emma's expression → pose:

```typescript
const EXPRESSION_POSE_MAP: Record<AvatarExpression, string> = {
  neutral: "Idle",
  warm: "Idle",
  flirty: "Idle_Lean",
  sad: "Idle_Tired",
  idle_bored: "Idle_Tired",
  // ...
};

function setExpressionWithPose(expr: AvatarExpression) {
  model.expression(expr);
  const targetPose = EXPRESSION_POSE_MAP[expr] ?? "Idle";
  if (targetPose !== currentIdleGroup) {
    switchPose(targetPose);
  }
}
```

---

## Quick Reference: All Key APIs

```typescript
const mm = model.internalModel.motionManager;
const core = model.internalModel.coreModel;

// ── Motion groups ──────────────────────────────────────────────────────────
Object.keys(mm.definitions); // ["Idle", "TapBody", ...]
mm.definitions["Idle"]?.length; // number of idle motions (0 if none)

// ── Playback ───────────────────────────────────────────────────────────────
await model.motion("Idle"); // random, NORMAL priority
await model.motion("TapBody", 2); // specific index, NORMAL priority
await mm.startRandomMotion("Idle", 1); // IDLE priority (won't override normal)
await mm.startMotion("TapBody", 0, 2); // NORMAL priority
await mm.startMotion("React", 0, 3); // FORCE priority
mm.stopAllMotions(); // triggers idle auto-play

// ── State inspection ──────────────────────────────────────────────────────
mm.isFinished(); // true if no motion queued
mm.state.currentPriority; // 0=NONE 1=IDLE 2=NORMAL 3=FORCE
mm.playing; // bool — motion is playing

// ── Idle group control ────────────────────────────────────────────────────
mm.groups.idle; // current idle group name ("Idle")
mm.groups.idle = "Idle_Tired"; // override at runtime

// ── Events ────────────────────────────────────────────────────────────────
mm.on("motionStart", (group, index, audio) => {});
mm.on("motionFinish", () => {});
mm.once("motionFinish", () => {}); // one-shot

// ── Parameter writes ──────────────────────────────────────────────────────
core.addParameterValueById(id, value, weight); // additive — blends with motion
core.setParameterValueById(id, value); // absolute — overwrites motion
core.getModel().parameters.ids; // string[] — all param IDs

// ── Built-in effects ──────────────────────────────────────────────────────
model.internalModel.eyeBlink; // CubismEyeBlink | undefined
model.internalModel.breath; // CubismBreath (always present)
```

---

## Sources

- `pixi-live2d-display/src/cubism4/Cubism4MotionManager.ts` — `groups.idle = "Idle"`, fading durations, `createMotion`
- `pixi-live2d-display/src/cubism-common/MotionManager.ts` — idle auto-play loop, `startRandomMotion`, priority system
- `pixi-live2d-display/src/cubism-common/MotionState.ts` — `MotionPriority` enum, reserve/start state machine
- `pixi-live2d-display/src/cubism4/Cubism4InternalModel.ts` — `CubismBreath`, `CubismEyeBlink`, `updateFocus()`, `pose`
- `pixi-live2d-display/src/config.ts` — `idleMotionFadingDuration: 2000`, `motionFadingDuration: 500`
- `CubismWebSamples/lappmodel.ts` (Cubism 5, Apr 2026) — official idle loop, `CubismPoseUpdater`
- `CubismWebSamples/lappdefine.ts` — `MotionGroupIdle = "Idle"`, `PriorityIdle = 1`, `PriorityNormal = 2`, `PriorityForce = 3`
- `Haru.model3.json` — real model3.json structure: Idle/TapBody groups, FadeInTime/FadeOutTime
- `Haru.pose3.json` — real pose3.json: mutually exclusive part groups (arm variants, NOT body posture)
- `haru_g_idle.motion3.json` — real idle motion: `"Loop": true`, 10s duration, 30fps, bezier curve format
- `src/core/avatar-engine.ts` — Emma's current implementation reviewed
