# Live2D Expression Synchronization Research

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: GitHub (AI-girl-emotional-agent, ai-vtuber-live, pixi-live2d-display source), Live2D Cubism SDK docs, direct source code review.

---

## Emma's Current Expression System

### Flow Today

```
1. LLM streams response (SSE)
2. stream-client.ts collects full text, fires "done" event
3. parseEmmaResponse() extracts [emotion: smirk] tag
4. setExpression("smirk") called IMMEDIATELY  ← expression fires here
5. Client POSTs text to /api/emma/tts
6. Waits 800ms–2s for full MP3 from ElevenLabs
7. startTalkingWithAudio(blob) — audio plays, lip sync starts
```

**The timing bug**: Expression fires ~1–2s _before_ audio starts. Avatar wears the emotion while still completely silent.

### What Emma Has

| Component              | File                                                        | Current state                                   |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Expression names       | `src/core/command-parser.ts:5` — `VALID_EXPRESSIONS`        | 10 expressions                                  |
| Expression trigger     | `src/core/avatar-engine.ts:438` — `setExpression()`         | Calls `model.expression(expr)`                  |
| LLM emotion tag        | `[emotion: <name>]` appended to every response              | Works, wrong timing                             |
| User emotion detection | `src/core/emotion-engine.ts`                                | Voice/vision/text → feeds system prompt         |
| Idle parameter control | `src/core/avatar-engine.ts:125` — `runIdleBehavior()`       | Direct `setParameterValueById`                  |
| Lip sync               | `src/core/avatar-engine.ts:469` — `startTalkingWithAudio()` | `setParameterValueById("ParamMouthOpenY", ...)` |

### Emma's 10 Expressions

```typescript
// src/core/command-parser.ts:5
const VALID_EXPRESSIONS = new Set([
  "neutral",
  "smirk",
  "warm",
  "concerned",
  "amused",
  "skeptical",
  "listening",
  "flirty",
  "sad",
  "idle_bored",
]);
```

---

## How Live2D Expressions Work (Technical)

### Expression Files (`.exp3.json`)

Each named expression is a JSON file listed in the model's `.model3.json` under `Expressions`. Example for a "happy" expression:

```json
{
  "Version": 3,
  "Type": "Live2D Expression",
  "FadeInTime": 0.5,
  "FadeOutTime": 0.5,
  "Parameters": [
    { "Id": "ParamBrowLY", "Value": 0.8, "Blend": "Add" },
    { "Id": "ParamBrowRY", "Value": 0.8, "Blend": "Add" },
    { "Id": "ParamEyeLSmile", "Value": 1.0, "Blend": "Overwrite" },
    { "Id": "ParamEyeRSmile", "Value": 1.0, "Blend": "Overwrite" },
    { "Id": "ParamMouthForm", "Value": 0.8, "Blend": "Add" }
  ]
}
```

### Three Blend Modes

| Mode              | Behavior                                                      | Best for                                  |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------- |
| **Add** (default) | Adds value difference from initial state to current parameter | Brow raises, cheek puffs on top of motion |
| **Multiply**      | Multiplies current parameter value                            | Amplify/dampen existing motion            |
| **Overwrite**     | Forces exact value, ignores motion                            | Full smile freeze, eye close              |

**Critical for Emma**: If any `.exp3.json` file uses `Overwrite` on `ParamMouthOpenY`, it will fight with the lip sync loop. Expression files should either not touch `ParamMouthOpenY`, or use `Add` mode so the lip sync value layers on top.

### Expression vs Motion vs Direct Parameter — Render Order

Emma uses all three layers simultaneously:

```
Each render frame:
  1. motionManager.updateMotion()       ← Talk/Idle motion (.motion3.json)
  2. expressionManager.updateMotion()   ← Expression (.exp3.json) — LAYERED ON TOP
  3. Direct setParameterValueById()     ← Lip sync, idle blink — OVERWRITES ALL
```

Expressions compose on top of motions via a separate `CubismMotionQueueManager`. If the same parameter appears in both motion and expression (e.g., `ParamBrowLY`), the expression value is added/multiplied/overwritten onto whatever the motion set.

### pixi-live2d-display Expression API

```typescript
// High-level — what Emma currently uses:
await model.expression("warm"); // by name → async, may fetch .exp3.json
await model.expression(2); // by index
await model.expression(); // random expression
// Returns: Promise<boolean> — false if expression not found

// Lower-level — direct manager access:
const manager = model.internalModel?.motionManager?.expressionManager;
// manager.definitions  → array of { Name, File } from model3.json
// manager.expressions  → cached loaded expressions (undefined = not loaded yet)
// manager.currentExpression → the active one

manager.setExpression("exp_02"); // by name
manager.resetExpression(); // → default (neutral params)
manager.restoreExpression(); // → revert to currentExpression
manager.setRandomExpression(); // excludes current
```

### Automatic Fade

`model.expression("warm")` triggers fade automatically:

- New expression fades in over `FadeInTime` seconds (default 0.5s)
- Previous expression fades out simultaneously
- Managed by `CubismMotionQueueManager.startMotion(motion, false, performance.now())`
- No manual lerp needed for expression transitions — SDK handles it

Emma already benefits from this. The only issue is the 1–2s timing mismatch before audio starts.

---

## Emotion → Expression Mapping Pattern

### Reference: AI-girl-emotional-agent (FallingRadiance, Mar 2026)

**Backend** — LLM forced to output structured JSON with emotion field:

```python
# backend/app/agent/graph.py — system prompt snippet:
"""
You must output JSON:
{
  "reply": "...",
  "emotion": "happy|neutral|sad|angry|shy|surprised",
  "use_tool": false,
  ...
}
"""
```

**Frontend** — Expression map + reactive watcher:

```typescript
// frontend/src/components/Live2DAvatar.vue
const expressionMap = {
  neutral: "exp_01",
  happy: "exp_02",
  sad: "exp_03",
  angry: "exp_04",
  shy: "exp_05",
  surprised: "exp_06",
};

async function setExpression(emotion: string) {
  const exp = expressionMap[emotion] ?? expressionMap.neutral;
  const manager = model.internalModel?.motionManager?.expressionManager;
  if (manager?.definitions) {
    const hit = manager.definitions.find((d) => d.Name === exp);
    if (hit) manager.setExpression(exp);
  }
}

// Vue watch — fires every time parent passes a new emotion prop
watch(
  () => props.emotion,
  (v) => setExpression(v)
);
```

**Emma does the same** (`model.expression(expr)` in `setExpression`), but the trigger is immediate on LLM done, not on audio start.

---

## The Timing Fix

### What to change

In `src/app/app/page.tsx`, the current flow is approximately:

```typescript
// (1) Expression fires immediately after parse:
const { text, expression } = parseEmmaResponse(raw);
if (expression) avatar.setExpression(expression);

// (2) TTS fetched and played separately:
const blob = await fetchTTS(text);
avatar.startTalkingWithAudio(blob);
```

**Fixed flow** — pass expression as callback into `startTalkingWithAudio`:

```typescript
// (1) Hold the expression:
const { text, expression } = parseEmmaResponse(raw);

// (2) Pass it to fire on audio start:
const blob = await fetchTTS(text);
avatar.startTalkingWithAudio(blob, () => {
  if (expression) avatar.setExpression(expression);
});
```

**In `avatar-engine.ts`**, update `startTalkingWithAudio` signature:

```typescript
// src/core/avatar-engine.ts:469
const startTalkingWithAudio = useCallback(
  (audioBlob: Blob, onAudioStart?: () => void) => {
    // ...existing setup...
    audio.onplay = async () => {
      if (ctx.state === "suspended") await ctx.resume();
      onAudioStart?.(); // ← expression fires here, synced to audio
      animate();
    };
  },
  [resetIdleTimer]
);
```

**Result**: Expression fires at the exact moment audio starts. ~15 line change total.

**Also applies to Web Speech fallback** (`startTalkingContinuous`): fire `onAudioStart()` immediately since WebSpeech starts playing right away.

---

## Sentence-Level Expression Sync

**Reference**: `sayhi12345/ai-vtuber-live` — `useSpeechQueue.js` + `pipeline.py`

Rather than one expression per full response, segment by sentence and assign each segment its own emotion.

### Flow

```
LLM stream → sentence accumulator → {text, emotion} segments → queue
                                                                  ↓
                                           dequeue: setExpression(emotion)
                                                    fetchTTS(text)
                                                    playBlob(audio)
```

### Sentence Accumulator (Python, translatable to TypeScript)

```python
# pipeline.py
SENTENCE_SPLIT_PATTERN = re.compile(r"(.+?[。！？!?\.]+)")

class SegmentAccumulator:
    buffer = ""

    def feed(self, chunk: str) -> list[str]:
        self.buffer += chunk
        segments = []
        while True:
            match = self.pattern.search(self.buffer)
            if not match:
                break
            segments.append(match.group(1).strip())
            self.buffer = self.buffer[match.end():]
        return segments
```

### Speech Queue with Expression Sync

```javascript
// useSpeechQueue.js — key excerpt
async function runQueue() {
  while (queue.length > 0) {
    const { text, emotion } = queue.shift();
    onSubtitle(text);
    onExpression(emotion); // ← expression fires BEFORE audio

    const blob = await synthesizeTts({ text, emotion });
    await player.playBlob(blob); // ← audio plays after expression set
  }
}
```

**Key insight**: `onExpression(emotion)` fires ~100–300ms before audio plays (during TTS fetch). This slight anticipation is intentional — real faces change expression slightly before voice.

### Per-Sentence Keyword Emotion (Python → TypeScript)

```typescript
// From pipeline.py detect_emotion(), adapted for TypeScript:
function detectEmotionFromSentence(text: string): AvatarExpression {
  const t = text.toLowerCase();
  if (/wow|surprised|really\?|no way/i.test(t)) return "amused";
  if (/[!]{2,}|wonderful|amazing|love|great/i.test(t)) return "warm";
  if (/sorry|unfortunately|sad|miss/i.test(t)) return "concerned";
  if (/hmm|actually|but|however/i.test(t)) return "skeptical";
  if (/haha|lol|funny|cute/i.test(t)) return "smirk";
  return "neutral";
}
```

**Alternative** (higher accuracy): Instead of keyword detection, instruct the LLM to embed inline emotion markers per sentence in its stream: `"That's wonderful! [E:warm] Let me think about that... [E:skeptical]"`. The stream client parses these as they arrive.

---

## Amplitude Analysis: Time-Domain RMS

**Reference**: `audioPlayer.js` from ai-vtuber-live

Switch from frequency-domain (`getByteFrequencyData`) to time-domain (`getByteTimeDomainData`) for cleaner lip sync signal:

```typescript
// audioPlayer.js (adapted to TypeScript for Emma)
analyser.fftSize = 1024; // larger for smoother RMS
analyser.getByteTimeDomainData(dataArray); // 128 = silence baseline

let sumSq = 0;
for (let i = 0; i < dataArray.length; i++) {
  const v = (dataArray[i] - 128) / 128; // normalize around 0
  sumSq += v * v;
}
const rms = Math.sqrt(sumSq / dataArray.length);
const boosted = Math.min(1, rms * 12); // amplify
const gated = boosted < 0.025 ? 0 : boosted; // noise gate — silence clamp

// Asymmetric smoothing (attack fast, decay medium, silence fast):
const alpha = gated > prevMouth ? 0.46 : gated === 0 ? 0.2 : 0.24;
prevMouth += (gated - prevMouth) * alpha;

core.addParameterValueById("ParamMouthOpenY", prevMouth, 0.8);
```

**Why time-domain over frequency-domain**: RMS directly measures waveform displacement — it responds to consonant pops immediately and falls cleanly to 0 on silence. Frequency averaging blurs transients and can keep the mouth partially open during soft fricatives.

---

## Muted / No-Audio Fallback

**Reference**: `useSpeechQueue.js` — `playMutedSpeechPattern`

When TTS is unavailable (no ElevenLabs key, or muted), use a timed mouth-movement pattern:

```typescript
async function playMutedSpeechPattern(
  text: string,
  onMouth: (v: number) => void,
  onSpeaking: (b: boolean) => void,
  shouldStop: () => boolean
) {
  const durationMs = Math.max(700, text.length * 92); // ~92ms per character
  const pattern = [0.16, 0.44, 0.2, 0.58, 0.24, 0.36, 0.18, 0.5];
  let elapsed = 0,
    frame = 0;
  onSpeaking(true);

  while (elapsed < durationMs && !shouldStop()) {
    const remaining = durationMs - elapsed;
    const fadeOut = remaining < 220 ? remaining / 220 : 1; // tail fade
    onMouth(pattern[frame % pattern.length] * fadeOut);
    await sleep(Math.min(75, remaining)); // ~13fps
    elapsed += 75;
    frame++;
  }
  onSpeaking(false);
  onMouth(0);
}
```

Emma's current `startTalking(text)` sinusoidal pattern is similar but without the tail fade. This pattern array approach looks more organic.

---

## Expression + TTS Timestamp Sync (Advanced)

Using ElevenLabs `/stream/with-timestamps` (see TTS research) + character alignment to schedule expression changes:

```typescript
// Build timeline from ElevenLabs alignment data
const expressionTimeline: Array<{ time: number; expression: AvatarExpression }> = [];

// Group characters into words, detect emotion per word
let wordBuffer = "",
  wordStart = 0;
for (const { char, start, end } of alignment) {
  if (char === " " || char === "." || char === "!") {
    if (wordBuffer) {
      const expr = detectEmotionFromSentence(wordBuffer);
      if (expr !== currentExpr) {
        expressionTimeline.push({ time: wordStart, expression: expr });
        currentExpr = expr;
      }
    }
    wordBuffer = "";
    wordStart = end;
  } else {
    if (!wordBuffer) wordStart = start;
    wordBuffer += char;
  }
}

// In rAF loop:
const elapsed = audioCtx.currentTime - playbackStartTime;
const nextEvent = expressionTimeline.find((e) => e.time <= elapsed && !e.fired);
if (nextEvent) {
  avatar.setExpression(nextEvent.expression);
  nextEvent.fired = true;
}
```

This enables mid-sentence expression changes precisely when the LLM "says" the emotional word. Complexity: High. Requires Approach C from TTS research to be implemented first.

---

## Expression Conflict Check (Important)

Emma's idle behaviors directly call `setParameterValueById` for eyes, brows, body. This **does not conflict** with the expression system as long as the expression `.exp3.json` files don't `Overwrite` those same parameters.

**Run this check before any implementation**:

```bash
# Find all expression files for Emma's model
ls public/live2d/emma/Design_genius_White/
cat public/live2d/emma/Design_genius_White/*.exp3.json 2>/dev/null | grep -i "Mouth\|ParamEye\|Brow"
```

If any expression file has `ParamMouthOpenY` with `"Blend": "Overwrite"`, the lip sync will be blocked during that expression. Solution: remove `ParamMouthOpenY` from the expression file, or change to `"Blend": "Add"`.

---

## Diagnostic: Verify Available Expressions

Add this to `init()` in `avatar-engine.ts` (one line, remove after confirming):

```typescript
const manager = model.internalModel?.motionManager?.expressionManager;
const available = manager?.definitions?.map((d) => d.Name) ?? [];
console.log("[EMMA Avatar] Available expressions:", available);
// Compare against VALID_EXPRESSIONS from command-parser.ts
```

If `"warm"` returns `false` from `model.expression("warm")`, the expression simply doesn't exist in the model file — nothing happens silently.

---

## Implementation Order

| Step | Change                                            | Files                                    | Complexity           |
| ---- | ------------------------------------------------- | ---------------------------------------- | -------------------- |
| 1    | Diagnostic — log available expressions            | `avatar-engine.ts:init`                  | Trivial              |
| 2    | Check exp3.json for Mouth conflicts               | Read model files                         | Trivial              |
| 3    | Delay expression to `audio.onplay`                | `avatar-engine.ts`, `app/page.tsx`       | Very low (~15 lines) |
| 4    | Switch to RMS + noise gate + asymmetric smoothing | `avatar-engine.ts:startTalkingWithAudio` | Low (~15 lines)      |
| 5    | Muted pattern with tail fade                      | `avatar-engine.ts:startTalking`          | Low                  |
| 6    | Sentence-level expression queue                   | Route + stream-client + avatar           | High                 |
| 7    | ElevenLabs timestamp expression scheduling        | Requires TTS research Step 3 first       | High                 |

Steps 1–5 are fast, independent, and constitute a meaningful quality improvement with minimal risk.

---

## Files to Modify

| File                        | Change                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/core/avatar-engine.ts` | Add `onAudioStart` callback to `startTalkingWithAudio`; RMS amplitude; noise gate; muted pattern fade |
| `src/app/app/page.tsx`      | Pass expression as `onAudioStart` callback; hold `pendingExpression` until audio starts               |
| `src/app/api/emma/route.ts` | (Step 6) Emit `emotion_change` SSE events per sentence                                                |
| `src/lib/stream-client.ts`  | (Step 6) Handle `emotion_change` events, pass to expression queue                                     |

---

## Sources

- `FallingRadiance/AI-girl-emotional-agent` — Vue + pixi-live2d-display, LangGraph, emotion-driven expressions, Mar 2026 — `expressionMap`, `setExpression()`, reactive `watch()` pattern, structured JSON LLM output
- `sayhi12345/ai-vtuber-live` — React + SSE streaming + speech queue + expression sync, May 2026 — `useSpeechQueue.js` (queue + per-segment emotion), `audioPlayer.js` (RMS + asymmetric smoothing + noise gate), `pipeline.py` (sentence segmentation + keyword emotion)
- `guansss/pixi-live2d-display` source — `ExpressionManager.ts`, `Cubism4ExpressionManager.ts` — expression API internals, automatic fade, `setExpression()` async behavior
- Live2D Cubism SDK docs — `/en/cubism-sdk-manual/expression/` — Add/Multiply/Overwrite blend modes, expression vs motion layering, `CubismMotionQueueManager` fade
- Emma codebase (`src/core/avatar-engine.ts`, `src/core/command-parser.ts`, `src/core/emotion-engine.ts`) — confirmed timing bug at `setExpression()` call site, existing 10 expressions, RMS vs frequency comparison
