# Vision Research: Screen Analysis, Emotion Detection & Autonomous Features

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: Anthropic vision docs, Gemini vision/Live API, OpenAI vision guide, MediaPipe FaceLandmarker, face-api.js — live-browsed 2026-05-31.

---

## Emma's Current Vision System

### What exists today

Two separate endpoints, neither connected to autonomous behavior:

| Endpoint                 | Model (dev)                  | Model (launch plan)       | Output                                                  |
| ------------------------ | ---------------------------- | ------------------------- | ------------------------------------------------------- |
| `POST /api/emma/vision`  | `google/gemma-4-31b-it:free` | `google/gemini-2.5-flash` | `{ description, objects[], activities[], anomalies[] }` |
| `POST /api/emma/emotion` | `openai/gpt-oss-120b:free`   | `google/gemini-2.5-flash` | `{ primary, confidence, valence, arousal }`             |

**Client-side emotion fusion** (`src/core/emotion-engine.ts`):

- Voice: RMS energy + zero-crossing rate + spectral centroid → Russell's Circumplex
- Vision: sends webcam JPEG base64 to `/api/emma/emotion`
- Text: keyword/pattern matching
- Fusion weights: voice `0.3`, vision `0.4`, text `0.3`
- Signal validity window: 30 seconds

**Screen analysis system prompt** (vision route):

```
Analyze: what app/website is open, what user is working on,
key visible content, errors/warnings, overall context.
Returns: { description, objects[], activities[], anomalies[] }
```

### Gaps in the current system

1. **Vision analysis never injected into Emma's system prompt** — `personas.ts` has a `visionContext` parameter slot but it's not reliably populated from vision API results. Emma "sees" the screen but never actually uses that knowledge.
2. **No autonomous/periodic monitoring** — vision fires only when explicitly called. Emma can't notice what's on screen unprompted.
3. **No vision-to-action pipeline** — analysis results don't trigger any behavior change.
4. **Emotion from LLM is expensive and slow** — sending webcam frames to an LLM for emotion detection adds ~300–800ms latency and costs API tokens. MediaPipe FaceLandmarker runs the same task in-browser at ~50ms with zero API cost and gives 52-dimensional output instead of 10 label guesses.
5. **Dev model mismatch** — `gemma-4-31b-it:free` has limited vision capability. Launch model `gemini-2.5-flash` is significantly more capable.
6. **No visual change detection** — Emma re-analyzes identical screens repeatedly instead of only triggering on meaningful changes.
7. **No bounding box detection** — Gemini supports structured object detection with pixel coordinates; not used.
8. **No real-time video analysis** — only single-frame snapshots.

---

## Vision APIs: Full Capabilities

### Claude Vision (Anthropic)

**Input formats**: base64, URL, Files API (`file_id`)

```python
# base64
{ "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "..." } }
# URL
{ "type": "image", "source": { "type": "url", "url": "https://..." } }
# Files API — upload once, reference many times (keeps payloads small across multi-turn)
{ "type": "image", "source": { "type": "file", "file_id": "file_xxx" } }
```

**Limits**:

- Max per request: 100 images (200K context models), 600 images (other models)
- Max dimensions: 8000×8000 px standard; reduced to 2000×2000 when >20 images
- Token cost formula: `width × height / 750`

**High-resolution support** (Opus 4.7 and 4.8 only):

- Long edge up to 2576px (vs 1568px on other models)
- Up to 4784 tokens/image (vs 1568 tokens on others)
- Auto-enabled — no beta header required
- Example: 1920×1080 → ~2765 tokens → $0.014 at Opus 4.7 rates

**Cost examples** (Claude Sonnet 4.6, $3/M input):
| Image size | Tokens | Cost |
|---|---|---|
| 200×200 | ~54 | $0.00016 |
| 1000×1000 | ~1334 | $0.004 |
| 1920×1080 | ~1568 (capped) | $0.0047 |

**Key limitations**:

- Cannot identify people by name (by design)
- Animations unsupported — only first frame of GIFs
- May hallucinate on images <200px or heavily rotated

**Best for Emma**: screen content analysis, document understanding, code screenshots, UI/error detection, text extraction.

---

### Gemini Vision (Google)

**Token calculation**:

- If both dimensions ≤384px: **258 tokens flat**
- Larger: tiled into 768×768 px chunks, **258 tokens per tile**
- Formula: `ceil(width/768) × ceil(height/768) × 258`

**Cost examples** (Gemini 3.5 Flash, $1.50/M input):
| Image | Tokens | Cost |
|---|---|---|
| 384×384 or less | 258 | $0.000387 |
| 640×360 | 258 (fits in one tile) | $0.000387 |
| 1920×1080 | 3×2=6 tiles × 258 = 1548 | $0.0023 |

**Object detection with bounding boxes**:

```python
prompt = """Detect all visible UI elements. Return JSON array:
[{ "label": "element name", "box_2d": [ymin, xmin, ymax, xmax] }]
Coordinates normalized 0-1000."""

# Rescale to pixel coordinates:
abs_y1 = box["box_2d"][0] / 1000 * image_height
abs_x1 = box["box_2d"][1] / 1000 * image_width
```

Supports custom instructions ("show bounding boxes of all error indicators"), multi-image input, video frames, PDFs.

**Max 3,600 images per request.** Formats: PNG, JPEG, WebP, HEIC, HEIF.

---

### Gemini Video Understanding

```python
# Upload video, reference for analysis
myfile = client.files.upload(file="screen_recording.mp4")
response = client.models.generate_content(
  model="gemini-3.5-flash",
  contents=[myfile, "Describe what the user is doing in this recording."]
)
```

| Input method | Max size             | Best for                           |
| ------------ | -------------------- | ---------------------------------- |
| File API     | 20GB paid / 2GB free | Long recordings (>1 min), reusable |
| Inline       | <100MB               | Short clips (<1 min)               |
| YouTube URL  | N/A                  | Public videos                      |

Capabilities: describe, segment, extract information, Q&A, timestamps, transcription.

---

### Gemini Live API (Real-Time Video)

The path to truly real-time, continuous vision awareness:

```
Input:  JPEG frames ≤ 1 FPS + audio (16kHz PCM) + text
Output: Audio (24kHz PCM)
Protocol: Stateful WebSocket (WSS)
```

**Key features**:

- **Affective dialog** — adapts response tone/style to the user's visible emotional expression
- **Barge-in** — user can interrupt mid-response
- **Tool use** — function calling, Google Search
- **Audio transcriptions** — both user speech and model output

```javascript
// Client-to-server (recommended — bypasses backend proxy, lower latency)
const ws = new WebSocket("wss://generativelanguage.googleapis.com/ws/...");

// Send webcam frame (≤1 FPS):
ws.send(
  JSON.stringify({
    client_content: {
      turns: [
        {
          role: "user",
          parts: [
            {
              inline_data: { mime_type: "image/jpeg", data: frameBase64 },
            },
          ],
        },
      ],
    },
  })
);
```

**Partners**: LiveKit, Pipecat, Firebase AI SDK, Agora, Voximplant.

**For Emma**: replaces periodic polling with continuous low-FPS awareness. Affective dialog means Emma's TTS tone shifts based on your visible state. Highest-quality real-time vision path but requires WebSocket infrastructure.

---

### Gemini Computer Use

Gemini can autonomously control browsers by seeing screenshots and emitting actions:

```
1. Send screenshot + goal
2. Model returns: function_call { action: "click", coordinate: {x, y} }
3. Your code executes the action
4. Capture new screenshot → repeat
```

**Safety**: responses include `safety_decision` (regular / requires_confirmation / not_allowed).

**Supported actions**: click, type, scroll, key_press, navigate, move_mouse.

**Note**: NOT available on Gemini 3.5 Flash — check model versions section in docs.

**For Emma's autonomous vision**: let Emma see an error dialog and offer to click "Fix" or navigate to help documentation.

---

## Browser-Side Vision: Zero API Cost

### MediaPipe FaceLandmarker (Best for Emotion Detection)

Replaces the `/api/emma/emotion` LLM call entirely. Runs in browser via WebAssembly/GPU.

**Output per frame**:

- **478 3D facial landmarks** (full face geometry)
- **52 blendshape scores** (expression coefficients, 0–1 each)
- Facial transformation matrix

**The 52 blendshapes**:

```
Eyes:    eyeBlinkLeft/Right, eyeSquintLeft/Right, eyeWideLeft/Right
         eyeLookDownLeft/Right, eyeLookInLeft/Right, eyeLookOutLeft/Right, eyeLookUpLeft/Right
Brows:   browDownLeft/Right, browInnerUp, browOuterUpLeft/Right
Cheeks:  cheekPuff, cheekSquintLeft/Right
Jaw:     jawForward, jawLeft, jawRight, jawOpen
Mouth:   mouthClose, mouthFunnel, mouthPucker, mouthLeft, mouthRight
         mouthSmileLeft/Right, mouthFrownLeft/Right, mouthDimpleLeft/Right
         mouthStretchLeft/Right, mouthRollLower, mouthRollUpper
         mouthShrugLower, mouthShrugUpper, mouthPressLeft/Right
         mouthLowerDownLeft/Right, mouthUpperUpLeft/Right
Nose:    noseSneerLeft/Right
```

**Setup**:

```typescript
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/.../face_landmarker.task",
    delegate: "GPU",
  },
  outputFaceBlendshapes: true, // the 52 scores
  runningMode: "VIDEO", // frame-by-frame
  numFaces: 1,
});

// Per video frame:
const result = faceLandmarker.detectForVideo(videoElement, performance.now());
if (result.faceBlendshapes.length > 0) {
  const scores = result.faceBlendshapes[0].categories;
  // [{ categoryName: "mouthSmileLeft", score: 0.72 }, ...]
}
```

**Mapping blendshapes to Emma's 10 emotion labels**:

```typescript
function blendshapesToEmotion(scores: { categoryName: string; score: number }[]): EmotionLabel {
  const g = (name: string) => scores.find((s) => s.categoryName === name)?.score ?? 0;
  const avg = (...names: string[]) => names.reduce((s, n) => s + g(n), 0) / names.length;

  const smile = avg("mouthSmileLeft", "mouthSmileRight");
  const frown = avg("mouthFrownLeft", "mouthFrownRight");
  const browDn = avg("browDownLeft", "browDownRight");
  const browUp = g("browInnerUp");
  const eyeWide = avg("eyeWideLeft", "eyeWideRight");
  const eyeBlink = avg("eyeBlinkLeft", "eyeBlinkRight");

  if (smile > 0.4 && browDn < 0.2) return "happy";
  if (browDn > 0.4 && frown > 0.3) return "angry";
  if (frown > 0.3 && browUp > 0.3) return "sad";
  if (eyeWide > 0.5 && browUp > 0.5) return "anxious";
  if (eyeBlink > 0.7) return "tired";
  if (g("jawOpen") > 0.3 && eyeWide > 0.3) return "excited";
  if (browDn > 0.3 && smile < 0.2) return "frustrated";
  return "neutral";
}
```

**Advantages over current LLM approach**:

- Zero API cost
- ~50ms vs ~300–800ms latency
- Can run at webcam frame rate (30fps capable)
- 52-dimensional signal vs 10-label LLM guess
- No network round trip

---

### face-api.js (Simpler Alternative)

JavaScript library on TensorFlow.js:

```typescript
import * as faceapi from "face-api.js";

await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
await faceapi.nets.faceExpressionNet.loadFromUri("/models");
await faceapi.nets.ageGenderNet.loadFromUri("/models");

const detection = await faceapi
  .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
  .withFaceExpressions()
  .withAgeAndGender();

// detection.expressions: { neutral: 0.12, happy: 0.78, sad: 0.02, ... }
// detection.age: 28.3
// detection.gender: "male", detection.genderProbability: 0.94
```

**7 expression classes**: neutral, happy, sad, angry, fearful, disgusted, surprised.

**Tradeoff vs MediaPipe**: simpler API, fewer expression classes, less precise. Good for quick integration without needing to write blendshape mapping logic.

---

## Autonomous Vision Features

### Feature 1: Periodic Screen Monitoring

Emma captures the user's screen every N seconds to maintain context without the user having to explain what they're working on.

```typescript
// New: src/core/vision-monitor.ts

const SCAN_INTERVAL = 30_000; // 30 seconds

async function startScreenMonitoring(onAnalysis: (v: VisionAnalysis) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: 640, height: 360, frameRate: 1 },
  });

  const video = document.createElement("video");
  video.srcObject = stream;
  await video.play();

  let lastSig = "";

  const intervalId = setInterval(async () => {
    const { frame, sig } = captureFrame(video);
    if (hasSignificantChange(lastSig, sig)) {
      lastSig = sig;
      const res = await fetch("/api/emma/vision", {
        method: "POST",
        body: JSON.stringify({ frame, context: "background_monitor" }),
      });
      const { analysis } = await res.json();
      if (analysis) onAnalysis(analysis);
    }
  }, SCAN_INTERVAL);

  return () => {
    clearInterval(intervalId);
    stream.getTracks().forEach((t) => t.stop());
  };
}
```

**Cost** (Gemini 3.5 Flash, 640×360):

- ~258 image tokens + ~512 prompt tokens + ~128 output tokens = ~900 tokens total
- $0.002 per call at 30s intervals → ~$0.24/hour — affordable

---

### Feature 2: Visual Change Detection (Smart Polling)

Only call the API when the screen has meaningfully changed:

```typescript
function captureFrame(video: HTMLVideoElement): { frame: string; sig: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  canvas.getContext("2d")!.drawImage(video, 0, 0, 640, 360);
  const frame = canvas.toDataURL("image/jpeg", 0.7).split(",")[1]; // base64

  // Perceptual hash: downsample to 8×8 grayscale
  const tiny = document.createElement("canvas");
  tiny.width = 8;
  tiny.height = 8;
  tiny.getContext("2d")!.drawImage(canvas, 0, 0, 8, 8);
  const px = tiny.getContext("2d")!.getImageData(0, 0, 8, 8).data;
  let sig = "";
  for (let i = 0; i < px.length; i += 4)
    sig += Math.floor((px[i] + px[i + 1] + px[i + 2]) / 3)
      .toString(16)
      .padStart(2, "0");
  return { frame, sig };
}

function hasSignificantChange(a: string, b: string, threshold = 1500): boolean {
  if (!a) return true;
  let diff = 0;
  for (let i = 0; i < a.length; i += 2)
    diff += Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16));
  return diff > threshold;
}
```

Reduces API calls by 80–90% on stationary screens.

---

### Feature 3: Proactive Vision Triggers

When vision detects a condition, Emma surfaces a Tier 2 suggestion:

```typescript
type VisionTrigger = {
  condition: (analysis: VisionAnalysis) => boolean;
  message: (analysis: VisionAnalysis) => string;
  cooldownMs: number;
};

const VISION_TRIGGERS: VisionTrigger[] = [
  {
    condition: (a) => a.anomalies.some((x) => /error|warning|exception/i.test(x)),
    message: (a) => `I noticed a ${a.anomalies[0]} on your screen. Want me to help diagnose it?`,
    cooldownMs: 60_000,
  },
  {
    condition: (a) => a.activities.some((x) => /form|filling|input/i.test(x)),
    message: (a) => `Looks like you're filling out a form. Want me to help with any fields?`,
    cooldownMs: 300_000,
  },
  {
    condition: (a) => a.activities.some((x) => /code|programming|debug/i.test(x)),
    message: (a) => `I can see you're working on code. Want me to review what's on screen?`,
    cooldownMs: 600_000,
  },
  {
    condition: (a) => a.anomalies.some((x) => /deadline|due|overdue/i.test(x)),
    message: (a) => `I spotted something about a deadline. Need help prioritizing?`,
    cooldownMs: 3_600_000,
  },
];
```

Wires directly into Emma's Tier 2 autonomy system in `autonomy-engine.ts`.

---

### Feature 4: Inject Vision Context into System Prompt

The biggest quick win — `personas.ts` already has the `visionContext` parameter. Just populate it reliably:

```typescript
// In src/core/personas.ts - buildSystemPrompt() already has:
// if (visionContext) prompt += `\n\nScreen context: ${visionContext}`;

// In app/app/page.tsx — after each vision analysis:
setVisionContext(
  analysis.description +
    (analysis.anomalies.length ? `\nIssues visible: ${analysis.anomalies.join(", ")}` : "") +
    (analysis.activities.length ? `\nUser activity: ${analysis.activities.join(", ")}` : "")
);
```

Emma will now naturally reference what she sees in her responses without being prompted.

---

### Feature 5: Bounding Box Detection for UI Awareness

Upgrade the vision prompt to return structured coordinates:

```typescript
// Updated system prompt for /api/emma/vision
const VISION_SYSTEM_PROMPT_V2 = `You are EMMA's vision subsystem analyzing a screenshot.

Return valid JSON only:
{
  "description": "1-2 sentence description of what's on screen",
  "app_name": "app or website name",
  "user_activity": "what the user appears to be doing",
  "objects": [{ "label": "element name", "box": [ymin, xmin, ymax, xmax] }],
  "anomalies": ["error text or warning messages"],
  "attention_areas": ["most important thing visible right now"]
}

Boxes normalized 0-1000. Never report passwords, API keys, or PII.`;
```

---

### Feature 6: Vision-Driven Avatar Expression

When webcam emotion detects the user's state, Emma mirrors/complements it:

```typescript
// Emotional complement strategy:
const EMOTION_MIRROR_MAP: Record<EmotionLabel, AvatarExpression> = {
  happy: "warm", // Emma warmly shares your happiness
  sad: "concerned", // Emma looks concerned
  angry: "concerned", // Emma shows care
  anxious: "warm", // Emma becomes reassuring
  tired: "warm", // Emma becomes gentle
  excited: "amused", // Emma shares the energy
  frustrated: "concerned", // Emma shows empathy
  stressed: "warm", // Emma becomes calmer/softer
  calm: "neutral",
  neutral: "neutral",
};

// In app/app/page.tsx — when userEmotion updates from vision:
useEffect(() => {
  if (!userEmotion || !emotionDrivesAvatarExpression) return;
  const targetExpr = EMOTION_MIRROR_MAP[userEmotion.primary];
  if (targetExpr && targetExpr !== currentAvatarExpression) {
    avatar.setExpression(targetExpr);
  }
}, [userEmotion?.primary]);
```

---

## Model Upgrade Path

### Current (Dev) vs Production

| Use case         | Current model                    | Production                | Action                             |
| ---------------- | -------------------------------- | ------------------------- | ---------------------------------- |
| Screen analysis  | `google/gemma-4-31b-it:free`     | `google/gemini-2.5-flash` | 1-line change in `models.ts`       |
| Facial emotion   | `openai/gpt-oss-120b:free` (LLM) | MediaPipe FaceLandmarker  | Replace LLM call with browser-side |
| Object detection | Not used                         | `google/gemini-2.5-flash` | Add bounding box prompt            |
| Real-time video  | Not used                         | Gemini Live API           | New WebSocket infrastructure       |

### Gemini 3.5 Flash Cost Model

- Input: $1.50/M tokens
- Output: $9.00/M tokens
- Free tier available (rate-limited)

**Per screen analysis call** (640×360, 258 image tokens + 512 prompt + 128 output):

- Input: 770 × $1.50/M = $0.00116
- Output: 128 × $9/M = $0.00115
- Total: ~$0.002/call
- At 30-second intervals: 120 calls/hour → **~$0.24/hour**

**MediaPipe emotion**: **$0** (browser-side, no API).

---

## Files to Modify (When Implementing)

| File                               | Change                                                                  | Phase |
| ---------------------------------- | ----------------------------------------------------------------------- | ----- |
| `src/core/models.ts`               | `MODEL_VISION` → `google/gemini-2.5-flash`                              | 1     |
| `src/core/personas.ts`             | Reliably inject `visionContext` into system prompt                      | 1     |
| `src/core/emotion-engine.ts`       | Replace `analyzeFromVision()` LLM call with MediaPipe                   | 1     |
| `src/app/app/page.tsx`             | Wire vision results to `setVisionContext()` + emotion→avatar expression | 2     |
| `src/app/api/emma/vision/route.ts` | Update prompt for structured bounding box output                        | 2     |
| New: `src/core/vision-monitor.ts`  | Periodic screen monitoring + change detection                           | 3     |
| New: `src/core/vision-triggers.ts` | Condition-based proactive notifications                                 | 3     |

---

## Key Findings Summary

| Topic                       | Finding                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Biggest quick win           | Wire `visionContext` into `personas.ts` — slot exists, just not populated reliably          |
| Fastest emotion improvement | Replace LLM emotion API with MediaPipe: zero cost, 52 blendshapes, ~50ms latency            |
| Screen analysis model       | `gemma-4-31b-it:free` (current dev) → `gemini-2.5-flash` (launch): major quality upgrade    |
| Gemini bounding boxes       | Object detection with `[ymin, xmin, ymax, xmax]` normalized 0-1000 — structured JSON output |
| Gemini image cost           | 640×360 screenshot → 258 tokens → $0.000387/call → affordable for 30s polling               |
| Gemini Live API             | ≤1 FPS JPEG over WebSocket, affective dialog adapts tone to visible emotion                 |
| Gemini Computer Use         | Browser automation via screenshot + action loop; not available on Gemini 3.5 Flash          |
| Claude vision cost          | `width × height / 750` tokens; 1920×1080 → ~1568 tokens → $0.0047 at Sonnet 4.6 rates       |
| Screen capture API          | `navigator.mediaDevices.getDisplayMedia()` — requires per-session user permission           |
| face-api.js vs MediaPipe    | face-api.js simpler (7 labels, no blendshape mapping); MediaPipe richer (52 blendshapes)    |

---

## Sources

- Anthropic vision docs — limits, token formula, high-res (Opus 4.7+), Files API, base64/URL/file_id
- Gemini image understanding — object detection, bounding boxes, token calculation, format support
- Gemini video understanding — File API, inline, YouTube URL input methods
- Gemini Live API — JPEG ≤1 FPS input, affective dialog, stateful WebSocket, partner integrations
- Gemini Computer Use — browser automation, safety decisions, function_call responses
- Gemini pricing — $1.50/$9.00 per 1M input/output (Gemini 3.5 Flash), free tier available
- MediaPipe FaceLandmarker — 478 landmarks, 52 blendshapes, browser WebAssembly, zero API cost
- face-api.js — 7 expression classes, age, gender, TensorFlow.js browser library
- OpenAI vision — URL/base64/Files API, Responses API + Chat Completions API
- OpenRouter models — `google/gemini-2.5-flash`, `google/gemma-4-31b-it:free` catalog
- Emma source: `src/app/api/emma/vision/route.ts`, `src/app/api/emma/emotion/route.ts`
- Emma source: `src/core/emotion-engine.ts`, `src/core/models.ts`
