# TTS ↔ Live2D Sync Research

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: GitHub repos, ElevenLabs docs, pixi-live2d-display issues, direct source code review.

---

## Emma's Current State

### What exists today (`src/core/avatar-engine.ts`)

| Method                        | Mechanism                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `startTalkingWithAudio(blob)` | Web Audio API `AnalyserNode` → FFT 256 → averages first 16 bins → `ParamMouthOpenY` |
| `startTalking(text)`          | Sinusoidal fallback, duration estimated from word count (250ms/word)                |
| `startTalkingContinuous()`    | Continuous sine wave, no audio analysis                                             |

### What the TTS route does (`src/app/api/emma/tts/route.ts`)

- Calls ElevenLabs `/v1/text-to-speech/{voice_id}` (non-streaming)
- Waits for full MP3 buffer before responding
- Client receives blob → passes to `startTalkingWithAudio(blob)`

### Current problems

1. **Latency**: Full audio must be generated and transferred before playback starts. ~800ms–2s delay typical for a short sentence.
2. **Sync quality**: Volume-averaging is a rough approximation. Mouth opens when loud, not when specific phonemes occur.
3. **`smoothingTimeConstant = 0.5`** — moderate smoothing. The quintic easing used in reference implementations (see Approach A below) gives a more natural feel.
4. **FFT bins**: Averaging first 16 bins of a 256-FFT anchors to the lowest frequency range (~0–1.7 kHz at 44.1 kHz). Speech intelligibility lives in 200 Hz–4 kHz — reasonable overlap but not optimized.

---

## Approaches Found

### Approach A — Improved Volume-Based (Web Audio API)

**What it is**: Refine the existing analyzer rather than replacing it.

**Reference**: `zhao896632126/Live2d-TTS-Audio-LipSync`, `aidanleong0807/browser_live2D_TTS`

**Core of the Three.js / Cubism 5 implementation** (most polished):

```typescript
// GenericAudioFileHandler.ts — from aidanleong0807/browser_live2D_TTS
const fftSize = 128;
const listener = new THREE.AudioListener();
const audio = new THREE.Audio(listener);
const analyser = new THREE.AudioAnalyser(audio, fftSize);

// In update loop (called each rAF):
const easeInQuint = (x: number) => x ** 5;
const normalize = (value: number, min = 0, max = 100) => {
  const normalized = (value - min) / (max - min);
  return easeInQuint(normalized);
};
const mouthValue = normalize(analyser.getAverageFrequency());
model.addParameterValueById(lipSyncIds[i], mouthValue, 0.8); // weight 0.8
```

**Key differences from Emma's current approach**:

|               | Emma now                    | Reference                             |
| ------------- | --------------------------- | ------------------------------------- |
| FFT size      | 256                         | 128                                   |
| Bins averaged | First 16                    | All bins (`getAverageFrequency`)      |
| Normalization | `avg * 2.5`                 | `(value/100)^5` quintic easing        |
| Smoothing     | `smoothingTimeConstant 0.5` | THREE.js default                      |
| Apply method  | `setParameterValueById`     | `addParameterValueById` w/ weight 0.8 |

**`addParameterValueById` vs `setParameterValueById`**: The `add` form adds to the current parameter value (clamped to range), while `set` overrides it. Using `add` with weight `0.8` means the lip sync blends with whatever the motion/expression system has already applied — more natural during Talk motions.

**Improvements to make** (without changing architecture):

1. Use `addParameterValueById(id, value, 0.8)` instead of `setParameterValueById`
2. Apply `easeInQuint` (x^5) normalization instead of linear scaling
3. Lerp toward target instead of snapping: `current = lerp(current, target, 0.3)` each frame
4. The 16-bin average covers ~2.7 kHz at 256 FFT/44.1 kHz — acceptable but narrowing to bins 2–20 (skipping DC bin) is cleaner

**Complexity**: Low — ~20 line change in `avatar-engine.ts`.

---

### Approach B — ElevenLabs Streaming (Low Latency)

**What it is**: Switch TTS route to use the streaming endpoint and play audio as it arrives, reducing Time To First Audio from ~1-2s to ~200-400ms.

**Reference**: ElevenLabs `/v1/text-to-speech/{voice_id}/stream`

**How it works**:

```
Client                 Server (Next.js)          ElevenLabs
  │                        │                         │
  │──── POST /api/emma/tts ─▶│                         │
  │                        │──── POST /stream ────────▶│
  │◀─── ReadableStream ────-│◀─── audio chunks ────────│
  │ [play chunk 1]          │                         │
  │ [lip sync active]       │                         │
  │ [play chunk 2]          │◀─── more chunks ─────────│
```

**Option B1: Collect chunks → play when first arrives** (simplest, significant latency win)

```typescript
// Route: pipe response.body directly to client
return new NextResponse(res.body, {
  status: 200,
  headers: { "Content-Type": "audio/mpeg", "Transfer-Encoding": "chunked" },
});

// Client: collect stream, play as soon as complete
const chunks: Uint8Array[] = [];
const reader = response.body!.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
const blob = new Blob(chunks, { type: "audio/mpeg" });
startTalkingWithAudio(blob);
```

This still waits for the full audio but eliminates the Supabase/decrypt overhead from the transfer start.

**Option B2: MediaSource API** (true streaming, complex)

```typescript
const mediaSource = new MediaSource();
const audio = new Audio(URL.createObjectURL(mediaSource));
mediaSource.addEventListener("sourceopen", () => {
  const sb = mediaSource.addSourceBuffer("audio/mpeg");
  // As chunks arrive from stream:
  sb.appendBuffer(chunk);
});
audio.play();
// Wire up AnalyserNode to audio while it plays
```

**Browser gotcha**: `MediaSource` + MP3 has inconsistent codec support. `output_format=pcm_16000` (raw PCM) or an Opus/WebM container is more reliable for true streaming. ElevenLabs `mp3_44100_128` works in Chromium but has edge cases in Firefox.

**Complexity**: Medium (B1) or High (B2).

---

### Approach C — ElevenLabs Stream With Timestamps (Best Audio Sync)

**What it is**: Use `/v1/text-to-speech/{voice_id}/stream/with-timestamps` to get character-level timing data alongside audio.

**Reference**: ElevenLabs API docs (verified at elevenlabs.io/docs/api-reference)

**Response format** (NDJSON stream — one JSON object per line):

```json
{
  "audio_base64": "<base64 mp3 chunk>",
  "alignment": {
    "characters": ["H", "e", "l", "l", "o"],
    "character_start_times_seconds": [0.0, 0.05, 0.1, 0.12, 0.15],
    "character_end_times_seconds": [0.05, 0.1, 0.12, 0.15, 0.2]
  }
}
```

Also returns `normalized_alignment` for normalized text.

**How to use for lip sync**:

```typescript
// 1. Collect all alignment data from stream
const timeline: Array<{ char: string; start: number; end: number }> = [];
const audioChunks: Uint8Array[] = [];

// Parse NDJSON stream...
for (const line of ndjsonLines) {
  const { audio_base64, alignment } = JSON.parse(line);
  audioChunks.push(base64ToUint8(audio_base64));
  for (let i = 0; i < alignment.characters.length; i++) {
    timeline.push({
      char: alignment.characters[i],
      start: alignment.character_start_times_seconds[i],
      end: alignment.character_end_times_seconds[i],
    });
  }
}

// 2. Vowel→mouth shape map
const VOWEL_MAP: Record<string, number> = {
  a: 0.9,
  e: 0.7,
  i: 0.6,
  o: 0.85,
  u: 0.75,
  A: 0.9,
  E: 0.7,
  I: 0.6,
  O: 0.85,
  U: 0.75,
  " ": 0.0,
};
const getMouthValue = (char: string) => VOWEL_MAP[char.toLowerCase()] ?? 0.35;

// 3. Schedule mouth movements using AudioContext timing
const ctx = audioContextRef.current;
const startTime = ctx.currentTime;
for (const { char, start } of timeline) {
  // AudioContext scheduling — subsecond precision
  const fireAt = startTime + start;
  // Can't call setParameterValueById from a scheduled event directly,
  // so poll against ctx.currentTime in rAF loop instead.
}
```

**Practical rAF approach** (simpler than AudioContext scheduling):

```typescript
// In animate loop:
const elapsed = ctx.currentTime - playbackStartTime;
const currentChar = timeline.find((t) => elapsed >= t.start && elapsed < t.end);
const mouthTarget = currentChar ? getMouthValue(currentChar.char) : 0;
// lerp + apply
```

**Key advantage**: Vowels drive maximum mouth opening (a, o, u → wide), consonants drive partial opening, silence closes. Matches how natural speech looks.

**Limitation**: Character timing ≠ phoneme timing precisely. English "th" = 2 chars, 1 phoneme. Still much better than volume-based.

**Complexity**: High — requires route to return NDJSON (or buffer alignment alongside audio), client to parse, and a timeline scheduler.

---

### Approach D — Live2D MotionSync (Official, Highest Quality)

**What it is**: Live2D's official MotionSync SDK. Analyzes audio for vowel states (A, I, U, E, O, Silence) in real time and maps them to model blend-shape parameters.

**Reference**: `liyao1520/live2d-motionSync` (npm: `live2d-motionsync`, published Jan 2025, updated Aug 2025, 101 stars, 14 forks)

```bash
npm install live2d-motionsync
```

```typescript
import { MotionSync } from "live2d-motionsync";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";

const model = await Live2DModel.from("model.model3.json");
const motionSync = new MotionSync(model.internalModel); // same internalModel Emma already uses

// Load motionsync config — model-specific
await motionSync.loadMotionSyncFromUrl("model.motionsync3.json");
// OR use default if no config file:
await motionSync.loadDefaultMotionSync();

// Play (accepts URL string or AudioBuffer):
await motionSync.play("/audio/response.mp3");
// Promise resolves when audio ends

// Stop:
motionSync.reset();
```

**MediaStream support** (microphone / live audio):

```typescript
import { MotionSync } from "live2d-motionsync/stream";
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
motionSync.play(stream);
```

**API surface**:

- `new MotionSync(internalModel)` — init
- `play(src: string | AudioBuffer): Promise<void>` — play and sync
- `reset()` — stop + reset mouth
- `loadMotionSync(buffer, samplesPerSec?)` — load from ArrayBuffer
- `loadDefaultMotionSync(samplesPerSec?)` — load built-in config
- `loadMotionSyncFromUrl(url, samplesPerSec?)` — load from URL

**Requirements**:

- Cubism 4 model (Emma's model ✓)
- Model ideally has a `.motionsync3.json` config (defines A/I/U/E/O→parameter mapping)
- Falls back to default config if file not present
- Only supports `AudioBuffer` input (resolved async issue in Aug 2025 update)

**Integration with Emma's existing code**: Uses `model.internalModel` — same path Emma's `avatar-engine.ts` already accesses for `coreModel`.

**To check if Emma's model supports it**:

```
public/live2d/emma/Design_genius_White/*.motionsync3.json
```

**Complexity**: Low to install (~10 lines replacing the analyzer loop), but requires verifying model config.

---

### Approach E — WAV File Handler (Official Cubism Demo Pattern)

**What it is**: Official Live2D approach from Cubism Web Samples (`lappwavfilehandler.ts`). Parses WAV PCM data directly, reads RMS amplitude at each frame.

**Reference**: `Live2D/CubismWebSamples` — `lappwavfilehandler.ts`

```typescript
// Official pattern from lappmodel.ts:
this._wavFileHandler.update(deltaTimeSeconds);
value = this._wavFileHandler.getRms(); // 0-1 RMS amplitude
model.addParameterValueById(lipSyncId, value, 0.8);
```

**Why limited for Emma**: Requires WAV format. ElevenLabs returns MP3. Would need server-side format conversion (ffmpeg) or client decode.

**Complexity**: High relative to benefit — `AnalyserNode` approach already captures equivalent data from any format.

---

## Comparison Table

| Approach                | Latency Reduction     | Sync Accuracy | Complexity | New Deps              |
| ----------------------- | --------------------- | ------------- | ---------- | --------------------- |
| A: Improved Volume      | None                  | Low+          | Low        | None                  |
| B: ElevenLabs Streaming | High (–700ms+)        | Low+          | Medium     | None                  |
| C: Timestamps           | High                  | Medium-High   | High       | None                  |
| D: Live2D MotionSync    | High (if + streaming) | High          | Low-Medium | `live2d-motionsync`   |
| E: WAV Handler          | None                  | Low+          | High       | ffmpeg or transcoding |

---

## Recommended Implementation Order

### Step 1 — Quick Win: Improve Current Analyzer (Approach A)

Change in `src/core/avatar-engine.ts`, `startTalkingWithAudio` (~line 497):

```typescript
// Current:
const avg = sum / speechBins / 255;
const mouthOpen = Math.min(1, avg * 2.5);
core.setParameterValueById("ParamMouthOpenY", mouthOpen);

// Improved:
let prevMouth = 0; // captured in closure, reset when audio starts
const easeInQuint = (x: number) => Math.min(1, x ** 5);
// In animate():
const avg = sum / speechBins / 255;
const target = easeInQuint(Math.min(1, avg * 3));
prevMouth = prevMouth * 0.7 + target * 0.3; // lerp smoothing
core.addParameterValueById("ParamMouthOpenY", prevMouth, 0.8);
// Note: switch from set → add w/ weight 0.8
```

Also increase `analyzer.fftSize` from 256 to 512.

### Step 2 — Latency: ElevenLabs Streaming (Approach B1)

In `src/app/api/emma/tts/route.ts`, change endpoint and pipe response body:

```typescript
const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}/stream`, { ... });
return new NextResponse(res.body, {
  status: 200,
  headers: { "Content-Type": "audio/mpeg" },
});
```

Client side: read the streaming response body into chunks, play as blob. No change to `startTalkingWithAudio` needed.

### Step 3 — Best Quality: Live2D MotionSync (Approach D)

1. Check `public/live2d/emma/Design_genius_White/` for `.motionsync3.json`
2. `npm install live2d-motionsync`
3. In `avatar-engine.ts`, add `MotionSync` instance alongside `modelRef`
4. Replace analyzer loop in `startTalkingWithAudio` with `motionSync.play(audioBuffer)`
5. Convert received blob to `AudioBuffer` via `audioCtx.decodeAudioData(await blob.arrayBuffer())`

---

## Key Parameters Reference

### Live2D Parameters Used for Mouth

| Parameter ID      | Range | Purpose                                     |
| ----------------- | ----- | ------------------------------------------- |
| `ParamMouthOpenY` | 0–1   | Mouth open height — primary lip sync target |
| `ParamMouthForm`  | -1–1  | Smile/frown shape — can vary per vowel      |

Emma's model already uses `ParamMouthOpenY` — confirmed in `avatar-engine.ts`.

### ElevenLabs Endpoints Summary

| Endpoint                                      | TTFA                 | Returns                                          |
| --------------------------------------------- | -------------------- | ------------------------------------------------ |
| `/text-to-speech/{id}`                        | Full generation wait | MP3 buffer (current)                             |
| `/text-to-speech/{id}/stream`                 | ~200-400ms           | Streaming MP3                                    |
| `/text-to-speech/{id}/stream/with-timestamps` | ~200-400ms           | Streaming NDJSON (`audio_base64` + char timings) |

Current model in Emma: `eleven_turbo_v2_5` — already optimized. `optimize_streaming_latency` param is deprecated. Check ElevenLabs dashboard for `eleven_flash_v2_5` availability for further latency reduction.

---

## Files to Modify When Implementing

| File                            | Change                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `src/core/avatar-engine.ts`     | Analyzer params, easing, `add` vs `set` (Step 1); MotionSync integration (Step 3) |
| `src/app/api/emma/tts/route.ts` | Switch to `/stream` endpoint, pipe response body (Step 2)                         |
| `src/app/app/page.tsx`          | Client fetch to handle streaming response (Step 2)                                |
| `package.json`                  | Add `live2d-motionsync` (Step 3)                                                  |

---

## Sources

- `aidanleong0807/browser_live2D_TTS` — Cubism 5 + Three.js AudioAnalyser + REST TTS (TypeScript, Jun 2025)
- `zhao896632126/Live2d-TTS-Audio-LipSync` — pixi-live2d-display + iFlytek TTS (Feb 2024)
- `liyao1520/live2d-motionSync` — Live2D MotionSync npm package (Aug 2025, 101 stars)
- `guansss/pixi-live2d-display` issue #78 — lip sync discussion + `beforeModelUpdate` hook
- ElevenLabs API docs — `/stream` and `/stream/with-timestamps` endpoints
- `Live2D/CubismWebSamples` — `lappwavfilehandler.ts`, `lappmodel.ts` (official reference)
