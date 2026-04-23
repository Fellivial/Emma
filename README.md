# EMMA L5 — Visual Embodiment (Live2D Avatar)

46 source files, 6 API routes, 6 pillars online. Emma now has a face.

## Architecture

```
src/
├── app/
│   ├── api/emma/
│   │   ├── route.ts              # Brain — NLU + all context + expression output
│   │   ├── vision/route.ts       # Vision — webcam → Claude Vision
│   │   ├── memory/route.ts       # Memory — CRUD + extraction
│   │   ├── tts/route.ts          # TTS — ElevenLabs → Web Speech
│   │   ├── mqtt/route.ts         # MQTT — IoT bridge
│   │   └── emotion/route.ts      # Emotion — facial expression via Claude Vision
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # L5 Shell — avatar layout modes (side/overlay/pip)
├── components/
│   ├── AvatarCanvas.tsx           # Live2D canvas + CSS placeholder + expression indicator + layout controls
│   ├── ChatMessage.tsx / ChatPanel.tsx / InputBar.tsx
│   ├── Dashboard.tsx              # 5-pillar status view
│   ├── DeviceCard.tsx / DevicePanel.tsx (9 tabs)
│   ├── Header.tsx                 # All status indicators
│   ├── MemoryPanel.tsx / MqttPanel.tsx / NotificationToast.tsx
│   ├── RoutineBuilder.tsx / RoutinePanel.tsx / SchedulePanel.tsx
│   ├── TimelinePanel.tsx / UserPanel.tsx / VisionPanel.tsx
│   └── ActionLog.tsx
├── core/
│   ├── avatar-engine.ts           # Live2D controller: expressions, lip sync, idle, layout
│   ├── autonomy-engine.ts / command-parser.ts / device-graph.ts
│   ├── emotion-engine.ts / memory-engine.ts / memory-shared.ts
│   ├── mqtt-bridge.ts / mqtt-client.ts / multi-user-engine.ts
│   ├── notifications-engine.ts / personas.ts / routines-engine.ts
│   ├── scheduler-engine.ts / timeline-engine.ts
│   ├── vision-engine.ts / voice-engine.ts
│   └── (17 core engines total)
├── lib/utils.ts
├── types/emma.ts + speech.d.ts
└── public/live2d/emma/            # Live2D model files go here
```

## Setup

```bash
tar -xzf emma-l5.tar.gz && cd emma-l1
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY required
npm run dev
```

## Pillar 6 — Live2D Avatar

### How It Works

1. **System prompt** instructs Emma to append `[emotion: <expression>]` to every response
2. **Command parser** extracts the tag alongside `[EMMA_CMD]` and `[EMMA_ROUTINE]` blocks
3. **Avatar engine** receives the expression → transitions the Live2D model
4. **Lip sync** animates mouth open/close based on response text length
5. **Idle system** switches to `idle_bored` after 30s inactivity
6. **Auto-neutral** returns to `neutral` 3s after each expression peak

### 10 Expressions

| Expression | Trigger | Emoji (placeholder) |
|---|---|---|
| `neutral` | Default / idle | 😌 |
| `smirk` | Teasing, "mmm" lines | 😏 |
| `warm` | Genuine care, "baby" approval | 🥰 |
| `concerned` | User distress detected | 😟 |
| `amused` | "Ahh", user did something clever | 😄 |
| `skeptical` | Calling out deflection | 🤨 |
| `listening` | While waiting for response | 👂 |
| `flirty` | Peak persona energy (sparingly) | 😘 |
| `sad` | Deep empathy | 😢 |
| `idle_bored` | 30s inactivity | 🙄 |

### 3 Layout Modes

**Side** — Avatar panel (280px) left of chat. Full visibility, non-intrusive.

**Overlay** — Avatar behind chat at 30% opacity. Immersive, mobile-friendly.

**PiP** — Floating 144x176px card in bottom-right corner. Minimal footprint.

Switch between modes via layout buttons on the avatar canvas.

### Placeholder Mode

If no Live2D model files are in `public/live2d/emma/`, the avatar runs in **placeholder mode** — an animated emoji face that still reacts to all 10 expressions. No model files needed to test the full pipeline.

### Adding a Real Live2D Model

1. Get a Cubism 4 model (free samples at https://www.live2d.com/en/learn/sample/)
2. Place files in `public/live2d/emma/`
3. Ensure entry point is `emma.model3.json`
4. Add expression files (`expressions/*.exp3.json`) named to match the 10 expression IDs
5. Add motion files (`motions/Idle/`, `motions/Talk/`, etc.)
6. Refresh — the avatar engine auto-detects and loads the model

See `public/live2d/emma/README.md` for full file structure.

### Expression Transition Timing

| Expression | Fade Duration |
|---|---|
| neutral | 600ms |
| smirk | 400ms (left corner leads) |
| warm | 500ms (slow bloom) |
| concerned | 300ms (quick shift) |
| amused | 250ms (quick pop) |
| flirty | 700ms (slow, deliberate) |
| sad | 600ms (gradual) |
| skeptical | 350ms (one brow leads) |

## All 6 Pillars

| Pillar | Status | Key |
|--------|--------|-----|
| P1 — Voice | ✅ | ElevenLabs TTS + Web Speech STT |
| P2 — Vision | ✅ | Webcam + Claude Vision scene analysis |
| P3 — Brain | ✅ | Device graph + MQTT bridge + command parser |
| P4 — Personality | ✅ | Mommy persona + memory + emotion + multi-user |
| P5 — Proactive | ✅ | Scheduler + autonomy tiers + notifications + timeline |
| P6 — Avatar | ✅ | Live2D / placeholder + expression pipeline + lip sync |

## Full Pipeline (L5)

```
User input
  → text emotion analysis → EmotionState
  → avatar.setListening()
  → POST /api/emma (all context: devices + memory + vision + user + emotion)
    → System prompt includes [emotion: X] instruction
    → Claude response: persona text + [EMMA_CMD] + [EMMA_ROUTINE] + [emotion: X]
  ← parseEmmaResponse() extracts: text, commands, routineId, expression
  → avatar.setExpression(expression)  ← Live2D transitions
  → avatar.startTalking(text)         ← lip sync animation
  → voice.speak(text)                 ← ElevenLabs/Web Speech TTS
  → applyCommands()                   ← device graph + MQTT publish
  → timeline.log()                    ← audit trail
  → auto-return to neutral after 3s + fade duration
  → idle_bored after 30s inactivity
```
