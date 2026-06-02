# STT Fallback Research

**Date:** 2026-05-31
**Scope:** Web Speech API platform reality + server-side STT alternatives + in-browser WASM options + architecture recommendation for Emma
**Status:** Research only — no implementation

---

## 1. Web Speech API — Platform Reality

### 1.1 Browser Support Matrix

| Browser              | Support                          | Notes                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome 25+ (desktop) | Full (`webkitSpeechRecognition`) | Requires network — audio sent to Google's server. No offline. Works reliably.                                                                                                                                                                                                                                                                         |
| Edge 87+             | Full                             | Same Chromium stack as Chrome, same Google server dependency.                                                                                                                                                                                                                                                                                         |
| Firefox              | No (flag only)                   | `window.SpeechRecognition` exists in the type system from Firefox 22+ but `media.webspeech.recognition.enable` is `false` by default in every release build. Calling `.start()` returns `service-not-allowed` error immediately and silently. This is the root cause of Bug 4 in `stt-bug-diagnosis.md`. Mozilla has no stated timeline to enable it. |
| Safari macOS (14.1+) | Partial                          | Uses Apple's on-device recognition service. Requires a real user gesture to call `.start()` — auto-start on page load fails. Must be called from inside a synchronous event handler (click/keydown). Each new recognition session requires a new gesture; you cannot restart recognition programmatically after it ends.                              |
| Safari iOS (14.5+)   | Partial                          | Same gesture requirement as macOS Safari. Exposed under `webkitSpeechRecognition`. Routes audio to Apple's cloud service (not on-device). Works in practice but the same "one gesture per session" constraint applies.                                                                                                                                |
| Samsung Internet 4+  | Partial                          | Routes to Google's recognition service on Galaxy devices. Ships the API but some users report intermittent `service-not-allowed` on older firmware.                                                                                                                                                                                                   |
| Chrome Android       | Full                             | Works identically to Chrome desktop. Network required. `webkitSpeechRecognition` prefix.                                                                                                                                                                                                                                                              |
| Firefox Android      | No                               | Same flag situation as desktop Firefox.                                                                                                                                                                                                                                                                                                               |
| Opera                | No                               | Never shipped.                                                                                                                                                                                                                                                                                                                                        |

**Current global support estimate:** roughly 70% of browser sessions reach a functional Web Speech API implementation. The uncovered 30% is predominantly Firefox users and iOS users on non-Safari browsers.

### 1.2 Known Stability Issues

**Network dependency (Chrome/Edge/Samsung):** Chrome's `SpeechRecognition` sends audio packets to Google's speech-api endpoint over WebSocket. Any network interruption — a VPN change, proxy, or mobile signal dip — silently kills the recognition session. `onerror` fires with a `network` error code in some cases; in others, `onend` fires with no result and no error, leaving the caller to guess what happened. Emma's current code resolves `null` in both cases, which is correct behavior, but the user receives no feedback.

**Recognition stopping mid-sentence:** Chrome's Web Speech API has a documented issue where continuous recognition (`continuous: true`) stops unpredictably after 30–60 seconds. Emma uses `continuous: false` (one-shot mode) which avoids this specific failure, but each utterance is a new recognition session, and calling `.start()` again too quickly after a result sometimes throws `InvalidStateError` if the previous session has not fully torn down.

**`onend` not firing:** Multiple Chromium bug reports confirm that `onend` intermittently fails to fire when the network request fails before the recognition engine returns a response. This can leave the state machine stuck in `listening` mode. Emma's 5-second silence timer is the only recovery path in that scenario.

**Service worker interference:** Pages served under a service worker that intercepts `fetch` events can inadvertently block Chrome's internal speech recognition requests. Rare in practice but relevant if Emma ships a PWA with a service worker in the future.

**Safari "gesture per session" limitation:** Each `recognition.start()` call must originate from a user gesture. Designs that restart recognition automatically after a result (any kind of "always listening" mode) are not possible on Safari without the user clicking a button again. This is a deliberate Apple privacy gate, not a bug.

---

## 2. Fallback Options: Server-Side STT

### 2.1 OpenAI Whisper API

**Endpoint:** `POST https://api.openai.com/v1/audio/transcriptions`

**Model options (as of May 2026):**

- `whisper-1` — the original Whisper v2 model. $0.006/minute, billed to the nearest second.
- `gpt-4o-transcribe` — newer, higher accuracy. Also $0.006/minute.
- `gpt-4o-mini-transcribe` — lower cost, good accuracy. $0.003/minute.

**Supported input formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm. Max file size 25 MB. A 10-second clip at typical MediaRecorder bitrates (~128 kbps) is roughly 160 KB — well within limits.

**Capturing audio in the browser:** `MediaRecorder` API records mic audio into a Blob. The Blob is POSTed as `multipart/form-data` to a Next.js API route. The route forwards it to OpenAI, hiding the API key server-side. The route returns the transcript as JSON.

**Typical round-trip latency for ~10s of speech:** `whisper-1` and `gpt-4o-transcribe` are batch-only — upload the full file, then wait. Measured round-trips for a 10-second clip are typically 1.5–4 seconds depending on OpenAI server load. This is noticeably slower than Web Speech API's in-stream results (~0.5–1s) but acceptable for Emma's push-to-talk model.

**Streaming and word-level timestamps:**

- `whisper-1` does not support streaming. It is file-upload-only; there is no streaming parameter. The Whisper decoder was not designed for it and the endpoint is unlikely to gain streaming.
- `gpt-4o-transcribe` supports `stream=True`, which delivers partial transcripts as the server processes the uploaded file. First delta still lands ~1–2 seconds in because the full file must arrive before processing begins.
- Word-level timestamps (`timestamp_granularities=["word"]`) are available in whisper-1, but OpenAI notes the timing is approximate since Whisper was not trained for word-level alignment.
- For true real-time word-by-word transcription during live microphone input, the OpenAI Realtime API (WebSocket, `gpt-4o-realtime-preview`) is the right tool — but it is significantly more expensive and is overkill for Emma's current use case.

**Cost for Free-tier Emma users:** At $0.003/minute (gpt-4o-mini-transcribe), a user speaking 1 minute per day costs roughly $0.09/month. Low but nonzero. For a free tier, this cost either needs to be subsidized, rate-limited, or handled via BYOK (user supplies their own OpenAI key).

**Privacy note:** Audio is sent to OpenAI's servers. Acceptable for Emma's personal AI use case, but worth disclosing in a privacy policy.

### 2.2 Deepgram

**Free tier:** $200 credit on sign-up, no credit card required.

**Pricing (pay-as-you-go, May 2026):**

- Nova-3 Monolingual streaming: $0.0048/minute
- Nova-3 Monolingual pre-recorded (REST): $0.0048/minute
- Nova-3 Multilingual: $0.0058/minute
- Flux English (voice-agent model with turn detection): $0.0065/minute
- Nova-2 (legacy, more languages): lower price, check current rates

Deepgram does not charge a premium for streaming vs batch — same per-minute rate for both.

**Models:**

- `nova-3` — Deepgram's highest-accuracy general-purpose model. Deepgram's internal benchmarks claim a 54% reduction in WER versus competitors for streaming and 47% for batch. 45+ languages.
- `nova-2` — slightly lower accuracy but supports languages not yet in nova-3, and filler word detection. Recommended for non-English use cases.
- `flux-general-en` — first-generation voice-agent model with built-in turn detection and ultra-low latency. Useful if Emma ever goes "always-listening".

**WebSocket streaming vs REST batch:**
Deepgram's main differentiator is real-time WebSocket streaming (`wss://api.deepgram.com/v1/listen`). You open a WebSocket, stream raw audio bytes from `MediaRecorder`, and receive partial + final transcripts in real time as the user speaks. Latency from speech to first word: 300–500ms. This is the path that gives Web-Speech-API-level responsiveness.

**Browser → Deepgram connection pattern and security:**
Direct browser connection to Deepgram's WebSocket would expose the API key in client-side code. Deepgram explicitly warns against this. Their recommendation is a server-side proxy: browser sends audio to your server, server opens an authenticated connection to Deepgram, server forwards transcripts back.

The critical constraint for Emma: **standard Next.js API routes on Vercel are serverless (Lambda). They cannot hold a persistent WebSocket connection**. Proxying the Deepgram WebSocket stream through a Vercel serverless function is not architecturally viable. True real-time Deepgram streaming on Vercel would require a persistent Node server (not compatible with the current deployment).

The practical Deepgram path for Emma on Vercel is **REST batch**: record the full utterance client-side, POST the blob to a Next.js route, route calls Deepgram's REST endpoint, route returns the transcript. This is functionally identical to the Whisper API path. Real-time streaming is a future option if Emma moves to a persistent backend.

**CORS:** Deepgram REST calls cannot be made directly from the browser due to CORS restrictions. A Next.js route proxy is required.

**Accuracy vs Whisper:** Nova-3 is generally considered more accurate than `whisper-1` for conversational English, particularly with background noise and accents. It is roughly comparable to `gpt-4o-transcribe` on clean speech.

### 2.3 AssemblyAI

**Free tier:** $50 credit, no credit card required. Credits do not expire. At Universal-2 pricing ($0.0025/min), this covers approximately 185 hours of pre-recorded transcription and 333 hours of streaming. The free credit is large enough to run Emma's free tier users through a beta period without incurring STT cost.

**Pricing (pay-as-you-go, May 2026):**

- Universal-2 (pre-recorded): $0.15/hour ($0.0025/minute) — cheapest of the three options researched
- Universal-3 Pro (pre-recorded): $0.21/hour ($0.0035/minute) — highest accuracy
- Universal-Streaming (real-time WebSocket): $0.15/hour ($0.0025/minute)
- Universal-3 Pro Streaming: $0.45/hour ($0.0075/minute)
- Whisper-Streaming (hosted Whisper): $0.30/hour ($0.005/minute)

**Real-time streaming:** AssemblyAI offers a Universal Streaming WebSocket API. Same Vercel serverless constraint applies as Deepgram — true real-time streaming proxying through Next.js API routes is not viable. REST batch is the applicable path.

**Features:** Word-level timestamps are included by default in all transcription responses. Speaker diarization is available as an add-on ($0.02/hour). Universal-2 supports 99 languages.

**Privacy:** Audio sent to AssemblyAI servers. HIPAA compliant for enterprise plans.

---

## 3. Browser-Native Alternatives (In-Browser Whisper)

These approaches run the Whisper model entirely in the browser via WebAssembly or WebGPU. No audio leaves the device.

### 3.1 whisper.cpp / whisper.wasm

**Project:** `ggml-org/whisper.cpp` — a C/C++ port of OpenAI's Whisper, compilable to WebAssembly via Emscripten.

**Model sizes:**

| Model    | Full (GGML) | Q5_1 quantized |
| -------- | ----------- | -------------- |
| tiny.en  | 75 MB       | 31 MB          |
| tiny     | 75 MB       | 31 MB          |
| base.en  | 142 MB      | 57 MB          |
| base     | 142 MB      | 57 MB          |
| small.en | 466 MB      | ~190 MB        |
| small    | 466 MB      | ~190 MB        |

Models larger than `small` have unsatisfactory memory requirements and performance in WASM. The whisper.cpp demo caps at `small`.

**Latency (after model is loaded):** Uses WASM SIMD 128-bit intrinsics, supported by all modern browsers. Inference runs at 2–3x real-time on a modern desktop CPU:

- tiny model: a 10-second clip takes ~3–5 seconds to transcribe
- base model: ~4–8 seconds
- small model: ~8–15 seconds

On a mid-range mobile CPU, expect 2–4x slower. The 10-second clip → 10–20 second transcription on mobile is not acceptable for conversational UX.

**First load:** Requires downloading 31–466 MB on first use, then cached by the browser.

**Browser support:** All modern browsers support WASM SIMD. No GPU acceleration in the WASM build — purely CPU-bound.

### 3.2 transformers.js (HuggingFace) + Whisper ONNX

**Project:** `@huggingface/transformers` — runs ONNX models in-browser via ONNX Runtime Web, with optional WebGPU acceleration.

**Usage for ASR:**

```js
import { pipeline } from "@huggingface/transformers";
const transcriber = await pipeline(
  "automatic-speech-recognition",
  "onnx-community/whisper-tiny.en",
  { device: "webgpu" } // or 'wasm' for CPU fallback
);
const result = await transcriber(audioBlob);
```

**Effective download size at runtime (quantized int8 variant):**

- whisper-tiny.en q8: ~77–90 MB (encoder + decoder combined)
- whisper-small q8: ~250–280 MB

The HuggingFace model repos show large total sizes (whisper-tiny.en: 1.42 GB total, whisper-small: 6.34 GB total), but that is the sum of all ONNX variants. transformers.js only downloads the selected quantized variant.

**WebGPU acceleration:**

- Chrome 113+, Edge 113+: WebGPU available by default.
- Firefox: behind a flag (`dom.webgpu.enabled`).
- Safari macOS 18+: WebGPU available in production.
- Safari iOS: Limited WebGPU support, falls back to WASM.
- Global WebGPU availability as of late 2024: approximately 70% of sessions (dominated by Chrome/Edge).

With WebGPU on a modern desktop GPU, whisper-tiny is near real-time. Without WebGPU (WASM fallback), inference is 3–5 seconds for a 10-second clip on a mid-range laptop, and significantly slower on mobile.

**Verdict:** Technically impressive and fully private. The ~80–100 MB first-load and mobile CPU/battery cost make it unsuitable as a default fallback. Suitable as an opt-in "private mode" for Pro tier desktop users. Not viable for Free tier or mobile.

---

## 4. Architecture Recommendation for Emma

### 4.1 Comparison Table

| Option                                  | Cost to Emma        | First result latency | Browser coverage      | Vercel compatible | Audio privacy       |
| --------------------------------------- | ------------------- | -------------------- | --------------------- | ----------------- | ------------------- |
| Web Speech API (current)                | Free                | ~0.5–1s              | ~70% (Chrome-centric) | Yes               | Audio to Google     |
| gpt-4o-mini-transcribe (via route)      | $0.003/min          | 1.5–4s               | 100%                  | Yes               | Audio to OpenAI     |
| Deepgram Nova-3 REST (via route)        | $0.0048/min         | 1.5–3s               | 100%                  | Yes               | Audio to Deepgram   |
| AssemblyAI Universal-2 REST (via route) | $0.0025/min         | 1.5–3s               | 100%                  | Yes               | Audio to AssemblyAI |
| Deepgram WebSocket streaming            | $0.0048/min         | ~300ms live          | 100%                  | No (serverless)   | Audio to Deepgram   |
| transformers.js in-browser              | Free (compute only) | 3–30s + 80MB dl      | ~70% (GPU)            | Yes               | Fully private       |

### 4.2 Recommended Tiered Strategy

**Free tier — Web Speech API with improved detection and graceful degradation:**

Keep Web Speech API as the only voice input path (zero cost). Fix the four known bugs from `stt-bug-diagnosis.md`. Add the following browser-specific handling:

1. **Firefox:** Treat as unsupported. Do not show the mic button, or show it with a tooltip: "Voice input requires Chrome or Safari." The current `supported` detection incorrectly shows the button in Firefox because `window.SpeechRecognition` is defined.
2. **Safari iOS / macOS:** Show the button. The gesture requirement is already satisfied by the user clicking the mic button. Handle the fact that each session requires a new button click — no auto-restart after a result.
3. **`service-not-allowed` on first attempt:** On any browser where recognition fires `service-not-allowed` immediately, set `supported` to `false`, hide the mic button, and store this in `localStorage` so the button stays hidden for the rest of the session.

No server-side STT for Free tier — cost is nonzero, and Free tier should not subsidize voice for all users.

**Starter and Pro tiers — server-side STT as a fallback:**

When Web Speech API is unavailable (Firefox, `service-not-allowed`, persistent network errors), provide a server-side path:

1. Record audio via `MediaRecorder` with dynamic MIME type detection:
   - `audio/webm;codecs=opus` on Chrome/Firefox/Edge
   - `audio/mp4` on Safari iOS/macOS
   - Use `MediaRecorder.isTypeSupported()` to detect
2. POST the audio blob to a new route `/api/emma/stt` with the detected MIME type.
3. The route forwards to `gpt-4o-mini-transcribe` at $0.003/minute (Starter) or `gpt-4o-transcribe` at $0.006/minute (Pro, for higher accuracy).
4. Return `{ transcript: string }` to the client.

Latency is 1.5–4s vs Web Speech API's ~0.5–1s. Acceptable for push-to-talk. The `listen()` function's returned `Promise<string | null>` API surface is unchanged — the client cannot tell which path ran.

**AssemblyAI as an alternative to OpenAI Whisper:**
AssemblyAI Universal-2 at $0.0025/min is cheaper than gpt-4o-mini-transcribe at $0.003/min, and AssemblyAI's $50 free credit (no expiry) could fund a beta. The integration pattern is identical: POST blob to a Next.js route, route calls AssemblyAI REST, return transcript.

**Pro tier "private mode" (future consideration):**
transformers.js with whisper-tiny q8. Gate behind an opt-in toggle in Settings → Voice → "Private transcription (no audio leaves your device)". Download happens on first toggle. Suitable only for desktop + GPU (WebGPU). Not suitable as a default path.

### 4.3 MediaRecorder Constraints for Whisper Compatibility

Safari does not produce `audio/webm;codecs=opus`. It produces `audio/mp4` (AAC). Both formats are accepted by the OpenAI Whisper API and by Deepgram/AssemblyAI. The recommended detection pattern:

```ts
function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}
```

When sending to the Whisper API, pass the MIME type explicitly or name the file with the correct extension (`.webm` for webm/opus, `.m4a` or `.mp4` for AAC). Whisper's format detection uses both the file extension and content-type header.

For Deepgram, set the `encoding` parameter dynamically: `encoding=opus&container=webm` for webm/opus, or omit for mp4 (Deepgram auto-detects AAC in mp4 containers).

### 4.4 How `voice-engine.ts` Could Be Extended

The `listen()` function in `src/core/voice-engine.ts` currently returns `Promise<string | null>` and relies entirely on Web Speech API. The cleanest extension pattern adds a second implementation behind the same interface:

1. Keep the existing Web Speech API path as the primary implementation.
2. Export a flag (`hasSttFallback: boolean`) from `useVoice` reflecting whether the user's tier supports server-side STT.
3. If `supported` is `false` and `hasSttFallback` is `true`, call a new `listenViaServer()` function from within `listen()`.
4. `listenViaServer()` internals:
   - Calls `navigator.mediaDevices.getUserMedia({ audio: true })`
   - Creates a `MediaRecorder` with the detected MIME type, collecting chunks in an array
   - Monitors silence using `AudioContext` + `AnalyserNode` (same approach as the current 5-second timer)
   - On silence or a tap of the stop button, calls `recorder.stop()`
   - Collects all chunks into a final `Blob`
   - POSTs to `/api/emma/stt`
   - Returns the transcript string
5. The new route `/api/emma/stt`:
   - Receives `multipart/form-data` with `file` and `mimeType`
   - Checks user tier from the Supabase session
   - Calls the configured STT provider
   - Returns `{ transcript: string }`

No changes to `InputBar.tsx` or `page.tsx` — the `listen()` return type stays `Promise<string | null>`.

---

## 5. Key Constraints Specific to Emma

- **Vercel serverless deployment:** Rules out Deepgram and AssemblyAI real-time WebSocket streaming proxying. REST batch is the only viable server-side STT path unless Emma adds a persistent Node server.
- **OpenRouter for LLM:** Emma routes all LLM calls through OpenRouter. OpenRouter does not currently expose OpenAI's Whisper/transcription endpoints. A direct OpenAI API key (`OPENAI_API_KEY`) would be a separate credential for STT, or use Deepgram/AssemblyAI which have no overlap with existing credentials.
- **Usage metering:** The 5-hour rolling window in `usage-enforcer.ts` meters token counts. Audio minutes are not currently metered. If server-side STT is added, decide whether STT minutes count against the usage budget or are treated as a flat cost of the plan.
- **BYOK pattern precedent:** ElevenLabs TTS is already BYOK — users provide their own key via Settings → Integrations. The same pattern could apply to STT (user provides their own OpenAI or Deepgram key) to eliminate Emma's per-minute cost entirely. Suitable if STT adoption is uncertain.

---

## 6. Open Questions for Implementation Decision

1. What percentage of Emma's current active users are on Firefox or non-Chrome browsers? (Check Vercel analytics or Supabase session data before prioritizing the fallback.)
2. Should server-side STT for Starter/Pro be subsidized by Emma per-minute, or BYOK like ElevenLabs?
3. Is the 1.5–4s additional latency acceptable for the target user persona on Starter/Pro?
4. For Firefox Free tier users, should the mic button be hidden entirely (cleanest), or shown with a "requires Chrome or Safari" tooltip (more informative)?
5. AssemblyAI vs OpenAI Whisper as the provider: AssemblyAI is cheaper per-minute and has a large free credit, but adds a new vendor relationship. OpenAI is already in the stack via OpenRouter (familiar billing). Recommend OpenAI for simplest integration, AssemblyAI as a cost-optimization swap later.

---

## Sources

- MDN SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- MDN Using the Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- Caniuse Speech Recognition: https://caniuse.com/speech-recognition
- Chromium issue — recognition stops mid-session: https://groups.google.com/a/chromium.org/g/chromium-html5/c/AQbwcktdQ3g/m/9gCk-48SBAAJ
- Firefox SpeechRecognition not supported — MDN compat data: https://github.com/mdn/browser-compat-data/issues/23812
- TestMu Speech Recognition API browser support: https://www.testmuai.com/learning-hub/speech-recognition-api-browser-support/
- Safari SpeechRecognition iOS (Apple Discussions): https://discussions.apple.com/thread/255492924
- OpenAI Whisper-1 pricing (OpenRouter): https://openrouter.ai/openai/whisper-1
- OpenAI Whisper pricing 2026: https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/
- Streaming STT with OpenAI 2026 (gpt-4o-transcribe vs whisper-1): https://dev.to/tahosin/streaming-speech-to-text-with-openai-in-2026-moving-beyond-whisper-2968
- OpenAI word-level timestamps discussion: https://community.openai.com/t/whisper-api-word-level-time-stamping/123199
- Deepgram pricing: https://deepgram.com/pricing
- Deepgram models overview: https://developers.deepgram.com/docs/models-overview
- Deepgram live streaming getting started: https://developers.deepgram.com/docs/live-streaming-audio
- Deepgram API key protection in browser: https://deepgram.com/learn/protecting-api-key
- Deepgram CORS discussion: https://github.com/orgs/deepgram/discussions/686
- AssemblyAI pricing: https://www.assemblyai.com/pricing
- AssemblyAI free tier FAQ: https://www.assemblyai.com/docs/faq/can-i-sign-up-for-free
- HuggingFace transformers.js: https://huggingface.co/docs/transformers.js/index
- transformers.js WebGPU guide: https://huggingface.co/docs/transformers.js/en/guides/webgpu
- whisper-tiny.en ONNX model files: https://huggingface.co/onnx-community/whisper-tiny.en/tree/main
- whisper.cpp WASM README: https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md
- Whisper model sizes explained: https://openwhispr.com/blog/whisper-model-sizes-explained
- MediaRecorder + Safari iOS cross-browser compatibility: https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription
- MDN MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
