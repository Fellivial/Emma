# STT (Speech-to-Text) Bug Diagnosis

**Date:** 2026-05-31  
**Component:** Microphone button in InputBar  
**Files:** `src/core/voice-engine.ts`, `src/components/InputBar.tsx`, `src/app/app/page.tsx`  
**Status:** Not yet fixed — awaiting implementation instructions

---

## Summary

Four distinct bugs. Bug 1 is the primary reason it feels broken — the transcript is sent immediately without ever appearing in the textarea, so users see nothing happen in the input field and think the mic did nothing.

---

## Bug 1 — Critical: Transcript bypasses the textarea

**File:** `src/app/app/page.tsx:670-673`

```typescript
const handleVoice = useCallback(async () => {
  const transcript = await voice.listen();
  if (transcript) sendMessage(transcript); // sends immediately, never fills input
}, [voice, sendMessage]);
```

When the user speaks, the transcript goes directly to `sendMessage()` and never populates the textarea. The user sees:

1. Mic button lights up (pink)
2. They speak
3. Mic button goes dark
4. Nothing appears in the input field
5. Emma responds (if they notice)

Expected behavior: transcript populates the textarea so the user can review and edit before sending.

**Root cause of the architectural gap:** `InputBar` owns its own `input` state internally — there is no prop to push text into it from outside. The parent has no way to set the textarea value.

**Fix requires:**

- Add a `transcript?: string` prop to `InputBar`
- On `transcript` prop change, merge value into internal `input` state
- Change `handleVoice` in `page.tsx` to pass transcript up to a state variable instead of calling `sendMessage()`

---

## Bug 2 — Mic button cannot stop or toggle listening

**Files:** `src/components/InputBar.tsx:188`, `src/core/voice-engine.ts:231-237`

`InputBar` always calls `onVoice` on every click regardless of `listening` state. `handleVoice` always calls `voice.listen()`. When `listening === true` and the user clicks mic again:

1. `voice.listen()` is called
2. `r.start()` throws `InvalidStateError: recognition has already started`
3. Caught silently at `voice-engine.ts:232-237`, promise resolves `null`
4. `handleVoice` receives null, does nothing

**Result:** second click silently fails. The user cannot cancel — they are stuck waiting the full 5-second silence timeout. There is no way to abort mid-session.

**Root cause:** The voice engine exposes `setMode` but not a `stopListening` or `abort` method. `recognitionRef` is internal to the hook and cannot be accessed from `handleVoice`.

**Fix requires:**

- Add `stopListening()` to `useVoice` return value: calls `recognitionRef.current?.abort()` + `setMode("idle")`
- Change `handleVoice` to check `voice.listening` — if true, call `stopListening()`; if false, call `listen()`

---

## Bug 3 — All failure modes are silent

**File:** `src/core/voice-engine.ts:208-220`

```typescript
r.onerror = (e: Event) => {
  const errEvent = e as unknown as { error: string };
  if (errEvent.error === "not-allowed") {
    console.warn("[EMMA Voice] Microphone permission denied"); // console only
  } else if (errEvent.error === "no-speech") {
    console.warn("[EMMA Voice] No speech detected"); // console only
  }
  resolve(null);
};
```

Every failure — mic permission denied, no speech detected, hardware error, browser policy block — resolves `null` with only a `console.warn`. The mic button goes dark with no UI feedback.

**Specific scenario:** A user who previously denied mic permission in Chrome will see the mic button (since `supported` is still `true`), click it, and nothing happens. Chrome's sticky permission block means the prompt never re-appears. The user has no idea why.

**Fix requires:**

- Expose an `error` state from `useVoice` (type: `"not-allowed" | "no-speech" | "hardware" | null`)
- In `InputBar` or via toast, show a message on error (e.g., "Microphone access was denied — check browser permissions")
- Clear the error on next successful `listen()` call

---

## Bug 4 — `supported` detection shows button in Firefox where recognition silently fails

**File:** `src/core/voice-engine.ts:157-158`

```typescript
const w = window as Window & { webkitSpeechRecognition?: unknown };
setSupported(!!(window.SpeechRecognition || w.webkitSpeechRecognition));
```

Firefox 100+ has `window.SpeechRecognition` in its type definitions, so `supported` is set to `true`. But Firefox ships Web Speech API disabled by default (`media.webspeech.recognition.enable` in `about:config` is `false`). The mic button renders, the user clicks it, recognition starts, immediately throws `service-not-allowed` — silent fail (Bug 3 applies).

**Fix:** Treat Firefox as unsupported, or catch `service-not-allowed` on first failure and set `supported` to `false`.

---

## Fix Plan (not yet implemented)

### Files to change

| File                          | What changes                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `src/core/voice-engine.ts`    | Add `stopListening()` to return value; expose `error` state                          |
| `src/components/InputBar.tsx` | Add `transcript?: string` prop; merge into internal state on change; show error hint |
| `src/app/app/page.tsx`        | `handleVoice` toggles on/off; passes transcript to state, not `sendMessage()`        |

### Change detail

**`voice-engine.ts`**

- Add `error: "not-allowed" | "no-speech" | "hardware" | null` state
- Set error in `r.onerror` based on `errEvent.error`
- Clear error at start of `listen()`
- Add `stopListening(): void` — calls `recognitionRef.current?.abort()` + `setMode("idle")`
- Export `stopListening` and `error` in return object

**`InputBar.tsx`**

- Add `transcript?: string` to `InputBarProps`
- `useEffect(() => { if (transcript) setInput(transcript); }, [transcript])`
- Add `voiceError?: string | null` prop; render inline hint below textarea when set

**`page.tsx`**

- Add `const [voiceTranscript, setVoiceTranscript] = useState("")`
- Change `handleVoice`:
  ```typescript
  const handleVoice = useCallback(async () => {
    if (voice.listening) {
      voice.stopListening();
      return;
    }
    const transcript = await voice.listen();
    if (transcript) setVoiceTranscript(transcript);
  }, [voice]);
  ```
- Pass `transcript={voiceTranscript}` to `InputBar`
- Clear `voiceTranscript` when `onSend` fires
- Pass `voiceError={voice.error}` to `InputBar`
