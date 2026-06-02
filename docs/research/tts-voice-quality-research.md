# TTS Voice Quality Research: Emotion, Tone, Age, Style, Texture & Seductiveness

> **Status: RESEARCH ONLY — do not implement until instructed.**
> Sources: ElevenLabs docs, OpenAI TTS API, EmotiVoice, StyleTTS2 — live-browsed 2026-05-31.

---

## Emma's Current TTS State

Emma uses ElevenLabs `eleven_turbo_v2_5` (`src/app/api/emma/tts/route.ts`).

**What Emma passes to ElevenLabs**: text only. No `voice_settings` override, no audio tags, no emotional context. Every response sounds identical regardless of expression (`warm`, `flirty`, `sad`, etc.).

**The gap**: Emma selects expressions for the avatar, but none of those signals reach the TTS layer. Fixing this is the entire scope of this research.

---

## ElevenLabs: Full Voice Control System

### Voice Settings — 5 Parameters

```typescript
interface VoiceSettings {
  stability: number; // 0–1, default 0.5
  similarity_boost: number; // 0–1, default 0.75
  style: number; // 0–1, default 0
  speed: number; // 0.7–1.2, default 1.0
  use_speaker_boost: boolean; // default true
}
```

#### `stability` — The Most Important Lever

| Value   | Eleven v3 label | Character                                   | Best for                       |
| ------- | --------------- | ------------------------------------------- | ------------------------------ |
| 0.0–0.2 | Creative        | Broadest emotional range, variable delivery | Dramatic, expressive scenes    |
| 0.3–0.5 | Natural         | Balanced, closest to original voice         | Warm, intimate, conversational |
| 0.6–0.8 | Robust          | Controlled, consistent                      | Professional, informational    |
| 0.9–1.0 | Monotonous      | Minimal variation                           | Robotic delivery               |

**For Emma**: `flirty`/`smirk`/`amused` → 0.2–0.3. `warm`/`listening` → 0.4–0.5. `neutral` → 0.55.

For audio tags (Eleven v3) to work well, stability must be **≤ 0.5**. Robust mode ignores directional tags.

#### `style` — Style Exaggeration

Amplifies the speaker's baseline character. A naturally breathy voice becomes breathier. A lively voice becomes more animated.

- `0.0` — neutral, no exaggeration
- `0.3` — mild emphasis on the voice's character
- `0.5–0.8` — strong amplification (ideal for seductive/intimate voices)

Increases compute and latency when > 0.

#### `speed` — Pace

- `0.70` — slow, deliberate, intimate, contemplative
- `0.85` — warm conversational pace
- `1.00` — default
- `1.20` — energetic (maximum)

Slower pace is one of the most effective levers for seductiveness and emotional weight.

#### `similarity_boost`

How closely the AI adheres to the original reference voice. Default `0.75` is usually fine. Lower for more freedom to diverge.

#### `use_speaker_boost`

Sharpens identity to the original speaker. Adds ~50ms latency. More useful for voice-cloned voices.

---

### Eleven v3 Audio Tags — Complete System

**Model requirement**: `eleven_v3` only. Not compatible with `eleven_turbo_v2_5` or other models.

Audio tags are placed inline in text and fire at the exact point they appear:

```
[whispers] Come closer. I'll tell you a secret.
[sighs] I've been waiting for this moment.
[mischievously] You have no idea what you're in for.
[excited] I can't believe you actually came!
[laughing] Stop, you're making it impossible to stay serious.
```

#### Official Voice-Related Tags

```
[laughs]          [laughs harder]   [starts laughing]   [wheezing]
[whispers]        [sighs]           [exhales]
[sarcastic]       [curious]         [excited]           [crying]
[snorts]          [mischievously]
```

#### Official Emotion/Direction Tags (from Enhance prompt system)

```
[happy]       [sad]         [excited]     [angry]
[whisper]     [annoyed]     [appalled]    [thoughtful]
[surprised]
```

#### Non-Verbal Tags

```
[laughing]        [chuckles]          [sighs]
[clears throat]   [short pause]       [long pause]
[exhales sharply] [inhales deeply]
```

#### Accent Tags

```
[strong French accent]     [strong Italian accent]
[strong British accent]    [strong Southern accent]
```

#### Inferrable Custom Tags

The ElevenLabs Enhance system explicitly states "You can infer similar, contextually appropriate audio tags." The model understands descriptive emotional/delivery states beyond the official list:

```
[seductively]    [intimately]     [breathily]
[softly]         [warmly]         [flirtatiously]
[dreamily]       [playfully]      [teasingly]
[nervously]      [confidently]    [shyly]
[intensely]      [gently]         [provocatively]
```

**Usage**:

```
[softly] I've been thinking about you all day.
[breathily] Come here... let me show you something.
[teasingly] You think you know me? You don't know the half of it.
[seductively] Stay a little longer.
```

---

### Emotion via Narrative Context (All Models)

This works on **all ElevenLabs models** — no v3 required.

```
// Dialogue tag — most predictable
"You're late," she said, her voice low and amused.

// Narrative style
Her voice dropped to a whisper as she leaned in closer.
"I've been looking forward to this all week," she breathed.

// Explicit emotional setup
"Why don't you come a little closer?" she asked, her voice silk-smooth.
```

ElevenLabs will speak the dialogue tag text aloud (can be post-processed out). This is the recommended fallback for models where v3 audio tags aren't available.

---

### Model Comparison for Emotional Range

| Model                    | Latency     | Emotional Range | Audio Tags | Recommendation                       |
| ------------------------ | ----------- | --------------- | ---------- | ------------------------------------ |
| `eleven_v3`              | ~800ms–1.5s | Highest         | Yes        | Expressive, drama, intimate delivery |
| `eleven_multilingual_v2` | ~500ms      | High            | No         | Stable, diverse language             |
| `eleven_turbo_v2_5`      | ~300ms      | Medium          | No         | **Emma's current** — fast, limited   |
| `eleven_flash_v2_5`      | ~150ms      | Low             | No         | Ultra-fast, minimal emotion          |

**Emma's trade-off**: `eleven_turbo_v2_5` is fast but flat. `eleven_v3` gives full emotional range. Hybrid approach: upgrade high-emotion expressions (`flirty`, `smirk`, `sad`, `amused`) to v3; keep turbo for `neutral`/`listening`.

---

## OpenAI gpt-4o-mini-tts: Free-Text Instructions

OpenAI's newest TTS supports a free-text `instructions` parameter (up to 4096 chars). Controls the voice completely. **Does NOT work** with `tts-1` or `tts-1-hd`.

```typescript
const speech = await openai.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "coral",
  input: "Come closer. I have something to tell you.",
  instructions: `Speak in a soft, intimate whisper with a slightly breathless quality.
Your tone is warm and slightly teasing — like sharing a secret.
Speak slowly. Let each word land. Rising inflection on the last word.`,
  speed: 0.85,
});
```

### Controllable Aspects via `instructions`

| Aspect        | Example                                                     |
| ------------- | ----------------------------------------------------------- |
| Tone          | "Speak in a warm, slightly husky tone"                      |
| Emotion       | "Convey barely-contained excitement mixed with nervousness" |
| Intonation    | "Slow, descending melody at phrase ends"                    |
| Pace          | "Speak slowly and deliberately — no rush"                   |
| Style         | "Like speaking intimately to one person, not a crowd"       |
| Whisper       | "Whisper the last sentence"                                 |
| Accent        | "Speak with a light French accent"                          |
| Age vibe      | "Sound like a confident woman in her late 20s"              |
| Breathiness   | "Add a slight breathiness to your voice"                    |
| Seductiveness | "Low, sultry register with deliberate pacing"               |
| Impression    | "Channel the voice style of a late-night jazz singer"       |

### OpenAI Voice Character Guide (13 voices)

| Voice       | Character                     | Best for Emma                   |
| ----------- | ----------------------------- | ------------------------------- |
| **marin**   | Warm, expressive, clear       | Recommended for Emma — balanced |
| **cedar**   | Deep, resonant, authoritative | Strong character, confident     |
| **coral**   | Warm, conversational          | Friendly, intimate              |
| **nova**    | Upbeat, energetic, younger    | Playful, excited states         |
| **shimmer** | Light, clear, warm            | Soft, gentle delivery           |
| **onyx**    | Deep, smooth, confident       | Authoritative, calm             |
| **ballad**  | Melodic, expressive           | Emotional, lyrical              |
| **echo**    | Soft, contemplative           | Introspective                   |
| **fable**   | Expressive, storytelling      | Narrative, character            |
| **verse**   | Dynamic, adaptable            | Varied emotional delivery       |
| **alloy**   | Neutral, clear                | Narration, default              |
| **ash**     | Warm, professional            | Workplace-appropriate           |
| **sage**    | Calm, wise                    | Reassuring                      |

For Emma's persona (playful, warm, slightly teasing): `nova`, `coral`, or `marin`.

---

## Acoustic Science: What Makes a Voice Sound the Way It Does

### Fundamental Frequency (F0) — "Pitch"

F0 = rate of vocal fold vibration. The dominant perceptual cue for age, gender, and arousal.

| F0 Range   | Perceived quality                                |
| ---------- | ------------------------------------------------ |
| 80–120 Hz  | Deep, masculine, authoritative, mature           |
| 120–160 Hz | Low-mid, calm, confident, slightly mature female |
| 160–200 Hz | Mid-range, conversational, neutral               |
| 200–250 Hz | Higher, younger-sounding, energetic              |
| 250+ Hz    | Youthful, bright, child-like                     |

For **seductive voices**: Lower F0 within the speaker's natural range — not unnaturally deep, just toward the bottom of comfortable speaking range.

### Breathiness — Voice Texture

Breathiness = aspiration noise mixed with phonation. Acoustically: H1-H2 (first minus second harmonic amplitude).

| Voice quality        | H1-H2             | Percept                             |
| -------------------- | ----------------- | ----------------------------------- |
| **Breathy**          | > 6 dB            | Soft, intimate, seductive, youthful |
| **Modal**            | 0–6 dB            | Normal, clear, neutral              |
| **Creaky/Vocal Fry** | < 0 dB            | Cool, languid, casual, detached     |
| **Harsh**            | High noise energy | Strained, aggressive, rough         |

Choosing a voice with natural breathiness + `style > 0.3` amplifies that quality. The `[breathily]` custom tag in Eleven v3 explicitly targets this.

### Voice Texture Vocabulary

| Term        | What it means                     | Instruction example            |
| ----------- | --------------------------------- | ------------------------------ |
| **Breathy** | Air audible through the voice     | "Add a slight breathy quality" |
| **Husky**   | Slight roughness + lower register | "Speak in a low, husky tone"   |
| **Sultry**  | Slow + husky + low F0             | "Sultry, unhurried delivery"   |
| **Velvety** | Smooth + low F0 + no roughness    | "Smooth and velvety, no edges" |
| **Raspy**   | Pronounced roughness              | "A raspy, lived-in quality"    |
| **Crisp**   | Clean, clearly articulated        | "Crisp and precise"            |
| **Warm**    | Lower overtones, rounded vowels   | "Warm, resonant, rounded"      |
| **Bright**  | Emphasized higher harmonics       | "Bright and forward-placed"    |
| **Dark**    | Emphasized lower harmonics        | "Dark and rich in the low end" |

### Speaking Rate and Intimacy

| Rate      | Syllables/min | Perception                         |
| --------- | ------------- | ---------------------------------- |
| Very fast | 250–300+      | Excited, nervous, young            |
| Fast      | 200–250       | Energetic, animated                |
| Normal    | 150–200       | Conversational, neutral            |
| Slow      | 100–150       | Deliberate, intimate, confident    |
| Very slow | < 100         | Dramatic, seductive, contemplative |

ElevenLabs `speed: 0.7–0.85` covers intimate-to-conversational. OpenAI `speed: 0.5–0.8` for similar effect.

### Prosody Patterns by Emotion

| Emotion              | F0 pattern                        | Rate        | Intensity   | Texture         |
| -------------------- | --------------------------------- | ----------- | ----------- | --------------- |
| **Excited**          | High, wide range, rising          | Fast        | High        | Clear, bright   |
| **Happy**            | Mid-high, variable                | Fast-medium | Medium-high | Bright          |
| **Warm/Loving**      | Mid, smooth, gradual falls        | Slow-medium | Low-medium  | Smooth, rounded |
| **Sad**              | Lower, narrow, falling            | Slow        | Low         | Soft, breathy   |
| **Seductive/Flirty** | Low-mid, narrow, deliberate falls | Slow        | Low-medium  | Breathy, husky  |
| **Authoritative**    | Mid, controlled, falling          | Medium      | High        | Clear, modal    |
| **Playful/Teasing**  | Variable, frequent rises          | Medium-fast | Medium      | Bright, light   |
| **Bored**            | Low, flat, minimal variation      | Slow        | Low         | Modal-creaky    |

---

## Age Vibe — Acoustic Signatures

| Age Perception        | F0                      | Rate           | Texture                  | Other                           |
| --------------------- | ----------------------- | -------------- | ------------------------ | ------------------------------- |
| **Teen/Early 20s**    | Higher F0, uptalk       | Fast, variable | Clear, bright            | Disfluencies, rising intonation |
| **Mid-20s–Early 30s** | Mid-range, confident    | Medium-fast    | Warm, modal              | Energetic, expressive           |
| **30s–40s**           | Stable mid-low          | Measured       | Warm, full resonance     | Deliberate                      |
| **40s–50s**           | Lower, more variation   | Slower         | Darker, possibly hoarser | Gravelly edges                  |
| **60s+**              | Lower with irregularity | Slower         | Rougher, breathier       | Longer phrase durations         |

Emma's persona (playful, warm, teasing) = mid-20s to early 30s: mid-range F0, energetic-but-controlled, warm texture, capable of intimate slowdowns.

**In OpenAI instructions**:

```
"Sound like a confident woman in her late twenties — warm and expressive with
energy that's controlled rather than girlish."
```

---

## Seductiveness in Voice — The Full Picture

Seductiveness is a specific combination of six acoustic features:

### The 6 Ingredients

1. **Lower F0** — toward the bottom of the comfortable speaking range. Creates calm, maturity, physical presence.

2. **Breathiness** — aspiration mixed with phonation. Signals closeness and effort — as if speaking very near someone.

3. **Slow rate** — 0.75–0.85× of default pace. Signals intentionality. Every word was chosen.

4. **Narrow but precise pitch range** — the voice doesn't sweep dramatically, but lands on specific notes. A slight rise on invitations, a full fall into closeness.

5. **Elongated vowels** — words stretched, not clipped. "Come _here_" not "Come here". Vowel lengthening is the primary intimacy cue.

6. **Soft onsets and endings** — words begin gently (no hard glottal stops) and trail off softly. Creates ease and flow.

### What Kills Seductiveness in TTS

- `stability > 0.6` — voice becomes mechanical, loses emotional micro-variation
- High speed — urgency undermines intimacy
- Bright, forward-placed voice — energetic/youthful, not sultry
- Hard consonant attacks — breaks the softness
- Monotone delivery — seductiveness needs subtle inflection, not flatness

### Practical Recipe

**ElevenLabs eleven_v3**:

```typescript
voice_settings: {
  stability: 0.25,      // Creative mode — emotional micro-variation
  similarity_boost: 0.70,
  style: 0.50,          // Amplify voice's natural character
  speed: 0.82,          // Slightly slower
  use_speaker_boost: true,
}
// Text:
text: "[softly] I've been waiting for you to say that. [breathily] Come sit with me."
```

**OpenAI gpt-4o-mini-tts**:

```typescript
model: "gpt-4o-mini-tts",
voice: "nova",
speed: 0.85,
instructions: `Speak softly and intimately, as if whispering to one person.
Your voice is warm and slightly husky — slow down just a little, let the words breathe.
Slight breathiness in the tone. Falling melody at phrase ends.`
```

---

## Emma Expression → TTS Mapping

### ElevenLabs voice_settings per expression

```typescript
const EXPRESSION_VOICE_SETTINGS: Record<AvatarExpression, VoiceSettings> = {
  neutral: { stability: 0.55, similarity_boost: 0.75, style: 0.0, speed: 1.0 },
  warm: { stability: 0.4, similarity_boost: 0.75, style: 0.2, speed: 0.9 },
  flirty: { stability: 0.2, similarity_boost: 0.75, style: 0.5, speed: 0.82 },
  amused: { stability: 0.25, similarity_boost: 0.75, style: 0.3, speed: 0.95 },
  smirk: { stability: 0.25, similarity_boost: 0.75, style: 0.3, speed: 0.95 },
  concerned: { stability: 0.45, similarity_boost: 0.75, style: 0.1, speed: 0.88 },
  sad: { stability: 0.3, similarity_boost: 0.75, style: 0.1, speed: 0.8 },
  skeptical: { stability: 0.5, similarity_boost: 0.75, style: 0.1, speed: 1.0 },
  listening: { stability: 0.55, similarity_boost: 0.75, style: 0.0, speed: 0.92 },
  idle_bored: { stability: 0.3, similarity_boost: 0.75, style: 0.0, speed: 0.78 },
};
```

Works on `eleven_turbo_v2_5` today. Zero other changes needed. This alone makes a significant difference.

### Eleven v3 Audio Tags per expression

```typescript
// Only prefix when using eleven_v3
const EXPRESSION_TAG: Partial<Record<AvatarExpression, string>> = {
  flirty: "[mischievously] ",
  smirk: "[sarcastic] ",
  amused: "[chuckles] ",
  sad: "[sighs] ",
  concerned: "[sighs] ",
  warm: "", // narrative context works better for warm
};
```

### OpenAI instructions per expression

```typescript
const EXPRESSION_INSTRUCTIONS: Record<AvatarExpression, string> = {
  neutral: "Speak clearly and warmly, conversational pace. Neutral affect.",
  warm: "Warm, nurturing, close. Like speaking to someone you care about. Medium pace, soft.",
  flirty:
    "Gently flirtatious and playful. Slow down slightly. Let words carry a light smile. Teasing without aggression.",
  amused:
    "Lightly amused — a smile audible in the voice. Slightly faster. Light emphasis on funny words.",
  smirk: "Gently dry, slightly knowing. Like you find this mildly entertaining. Don't oversell it.",
  concerned: "Softer, slower. Genuine care or worry. Deliberate pacing, falling melody.",
  sad: "Quieter and slower than usual. Subdued warmth. Phrases trail off softly. Not dramatic.",
  skeptical:
    "A touch dry. Controlled and even-toned. Slight emphasis on the word being questioned.",
  listening: "Present and attentive. Moderate pace. Slightly warmer than neutral.",
  idle_bored: "Languid and relaxed. Minimal emphasis. Slow without being sad — drifting slightly.",
};
```

---

## Voice Design — Creating Emma's Ideal Voice

### ElevenLabs Voice Design API

Generate a voice from a text description:

```python
voice = elevenlabs.voice_design.create(
  voice_description="""A 29-year-old woman with a warm, slightly breathy voice.
  American accent, playful energy, capable of going soft and intimate.
  Natural huskiness — not deep, but with warmth and texture.
  The kind of voice that feels close when she leans in.""",
  text="I've been waiting for you. What took you so long?"
)
```

Key description elements for Emma's ideal voice:

- Age: "29-year-old woman" → late-20s energy
- Texture: "slightly breathy", "natural huskiness"
- Resonance: "warm", "has depth without being deep"
- Character: "intimate", "close-sounding"
- Accent: American
- Range: "playful energy, capable of going soft and intimate"

### ElevenLabs Voice Remixing

Transform existing voices via prompt:

```
// Remix prompts:
"Make the voice slightly breathier and slower — more intimate-sounding."
"Shift to a slightly lower register, keep the warmth."
"Add a light husky quality while preserving the voice's character."
```

Prompt Strength: Low (subtle) → Medium → High → Max (full transformation).

---

## Voice Continuity for Multi-Sentence Responses

```typescript
await elevenlabs.textToSpeech.convert(voiceId, {
  text: currentSentence,
  previous_text: previousSentence, // helps prosody carry over
  next_text: nextSentence, // helps anticipate next phrase's rhythm
  voice_settings: EXPRESSION_VOICE_SETTINGS[expression],
});
```

Or use `previous_request_ids` (up to 3) for better stitch quality:

```typescript
await elevenlabs.textToSpeech.convert(voiceId, {
  text: currentSentence,
  previous_request_ids: [previousRequestId],
  voice_settings: EXPRESSION_VOICE_SETTINGS[expression],
});
```

---

## Implementation Priority

| Change                                                 | Effort                       | Impact    | Works with current model |
| ------------------------------------------------------ | ---------------------------- | --------- | ------------------------ |
| Expression-mapped `voice_settings`                     | Low (10 lines in `route.ts`) | High      | Yes                      |
| Model switch to `eleven_v3` for expressive expressions | Medium                       | Very High | Requires new model ID    |
| Audio tags `[mischievously]`/`[sighs]`/`[chuckles]`    | Low (text prefix)            | High      | `eleven_v3` only         |
| Switch to OpenAI `gpt-4o-mini-tts` + `instructions`    | Medium                       | Very High | New backend              |
| Custom Emma voice via Voice Design API                 | Medium                       | Very High | Any model                |
| `previous_request_ids` continuity                      | Low                          | Medium    | Yes                      |

**Recommended first step**: Expression-mapped `voice_settings`. Zero model change, immediate audible improvement.

---

## Key Findings Summary

| Topic                               | Key Finding                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Most impactful ElevenLabs lever** | `stability` — 0.2–0.3 for expressive, 0.55 for neutral                                                  |
| **Style amplification**             | `style: 0.3–0.5` amplifies breathiness/character; 0 = neutral                                           |
| **Speed for intimacy**              | `speed: 0.80–0.85` — slow is sultry                                                                     |
| **Audio tags**                      | `[whispers]`, `[sighs]`, `[mischievously]`, `[breathily]`, `[seductively]` — v3 only, stability < 0.5   |
| **Narrative context**               | Works on all models — dialogue tags and narrative descriptions steer delivery                           |
| **OpenAI instructions param**       | 4096-char free text on `gpt-4o-mini-tts` — extremely expressive, includes age/breathiness/seductiveness |
| **Seductive acoustics**             | Lower F0 + breathiness + slow rate + soft onsets + elongated vowels                                     |
| **Age vibe**                        | Mid-20s: mid-range F0, warm-energetic. 30s: controlled, darker. Older: lower, slower, rougher           |
| **What kills seductiveness**        | High stability, bright voice, fast rate, hard consonant attacks                                         |
| **Emma's gap**                      | No `voice_settings` override, no audio tags, no expression-to-TTS mapping                               |

---

## Sources

- ElevenLabs TTS API — `voice_settings` (stability, similarity_boost, style, speed, use_speaker_boost)
- ElevenLabs best practices — audio tags, Eleven v3 stability modes, narrative emotion, full Enhance system prompt
- ElevenLabs voice remixing — prompt-based attribute modification, prompt strength levels
- OpenAI `gpt-4o-mini-tts` API — `instructions` parameter (4096 chars), 13 voices, speed 0.25–4.0
- EmotiVoice (netease-youdao, 2023) — open-source emotion-tagged TTS `<speaker>|<emotion>|text` format
- StyleTTS2 (yl4579) — style diffusion via WavLM discriminator for human-level synthesis
- Acoustic phonetics: F0/breathiness/H1-H2/speaking rate correlates with perceived emotion and seductiveness
