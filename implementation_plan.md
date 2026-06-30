# J.A.R.V.I.S. — Agentic AI Assistant Web App

Build a stunning, voice-enabled AI assistant web application inspired by Iron Man's JARVIS. The app features a futuristic HUD-style interface with an animated arc reactor core, glassmorphic panels, voice interaction via the Web Speech API, and an intelligent backend powered by Google's Gemini API with agentic function-calling capabilities.

## User Review Required

> [!IMPORTANT]
> **API Key Required**: You will need a **free Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey). The app will prompt you to enter it on first launch. No credit card needed.

> [!IMPORTANT]
> **Architecture Decision**: To keep this as a **portfolio-ready, self-contained project**, the app uses a lightweight Node.js/Express backend that proxies Gemini API calls (keeping your API key safe) and serves the frontend. No heavy frameworks — just vanilla HTML/CSS/JS for the frontend with maximum visual impact.

## Open Questions

> [!NOTE]
> **Voice Selection**: The app will use the browser's built-in Web Speech API for both speech recognition and text-to-speech. The TTS voice will be automatically selected to sound the most "JARVIS-like" (British English, male). If you'd prefer ElevenLabs integration for premium voice quality, that would require an additional paid API key.

---

## Proposed Changes

### Architecture Overview

```
jarvis-maybe/
├── server.js                  # Express backend — proxies Gemini API, serves frontend
├── package.json               # Project metadata & dependencies
├── .env                       # API key storage (gitignored)
├── .gitignore
└── public/                    # Frontend (served as static files)
    ├── index.html             # Main HTML — HUD layout structure
    ├── css/
    │   ├── index.css          # Design system tokens, resets, base styles
    │   ├── hud.css            # HUD panels, glassmorphism, layout
    │   ├── reactor.css        # Arc reactor animation (concentric rings, glow, pulse)
    │   └── chat.css           # Chat interface, message bubbles, scrolling
    ├── js/
    │   ├── app.js             # Main orchestrator — initializes all modules
    │   ├── voice.js           # Web Speech API — recognition & synthesis
    │   ├── chat.js            # Chat UI — render messages, auto-scroll
    │   ├── agent.js           # Agentic AI — sends prompts to backend, handles tool calls
    │   ├── tools.js           # Tool definitions & execution (weather, search, time, etc.)
    │   ├── reactor.js         # Arc reactor state management (listening/thinking/speaking)
    │   └── particles.js       # Ambient floating particle background effect
    └── assets/
        └── sounds/
            └── activate.mp3   # (optional) JARVIS activation chime
```

---

### Backend — Express Server

#### [NEW] [package.json](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/package.json)
- Project name: `jarvis-ai`
- Dependencies: `express`, `dotenv`, `@google/genai`
- Scripts: `dev` (nodemon), `start` (node)

#### [NEW] [server.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/server.js)
- Express server on port 3000
- Serves `public/` as static files
- **`POST /api/chat`** endpoint:
  - Accepts `{ message, history }` from frontend
  - Initializes Gemini client with `@google/genai` SDK
  - Configures model with JARVIS system prompt + function declarations
  - Handles the full tool-calling lifecycle:
    1. Send user message → model responds
    2. If model returns `functionCalls`, execute them server-side
    3. Send function results back → model generates final response
    4. Return `{ response, toolsUsed }` to frontend
- **`POST /api/config`** endpoint:
  - Accepts API key from frontend, saves to `.env`
- Environment variable loading via `dotenv`

#### [NEW] [.env](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/.env)
- `GEMINI_API_KEY=` (user fills in)

#### [NEW] [.gitignore](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/.gitignore)
- `.env`, `node_modules/`

---

### Frontend — Futuristic HUD Interface

#### [NEW] [index.html](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/index.html)
- Dark fullscreen viewport with no scrolling
- Google Fonts: **Orbitron** (headings/HUD labels) + **Rajdhani** (body/chat text)
- Semantic structure:
  - `#jarvis-hud` — full viewport container
  - `#particle-canvas` — background canvas for floating particles
  - `#reactor-core` — center arc reactor animation
  - `#status-bar` — top bar with JARVIS name, status indicator, time
  - `#chat-panel` — right-side glassmorphic chat panel
  - `#input-area` — bottom input bar with mic button + text input
  - `#system-panels` — left-side HUD widgets (system stats, capabilities)
  - `#api-key-modal` — first-run modal to enter Gemini API key

#### [NEW] [index.css](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/css/index.css)
Design system with CSS custom properties:
- **Colors**: Deep navy/black backgrounds (`#0a0e17`), JARVIS cyan (`#00d4ff`), accent gold (`#f0b429`), danger red, success green
- **Glassmorphism tokens**: `--glass-bg`, `--glass-border`, `--glass-blur`
- **Typography**: Orbitron for HUD elements, Rajdhani for readable text
- **Animations**: `@keyframes` for pulse, glow, fade-in, slide-up
- **Base resets**: Box-sizing, margin, font smoothing

#### [NEW] [hud.css](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/css/hud.css)
- Full viewport grid layout
- Glassmorphic panel styles with `backdrop-filter: blur()`
- Status bar with animated dots and live clock
- Side panels with HUD-style borders and scan-line effects
- Responsive breakpoints (collapses side panels on mobile)

#### [NEW] [reactor.css](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/css/reactor.css)
The centerpiece arc reactor animation:
- 4 concentric rings with different rotation speeds/directions
- Pulsing glow effect via `box-shadow` with cyan/blue gradient
- State-based classes: `.idle`, `.listening` (green pulse), `.thinking` (gold spin), `.speaking` (cyan wave)
- CSS-only — no JavaScript dependencies for the base animation
- Dashed/dotted borders on rings for mechanical look

#### [NEW] [chat.css](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/css/chat.css)
- Message bubbles: user (right-aligned, subtle glass) vs JARVIS (left-aligned, cyan-tinted glass)
- Typing indicator animation (three bouncing dots)
- Tool-use indicator (shows when JARVIS is executing a function)
- Auto-scroll behavior
- Input bar with glowing mic button and text field

---

### Frontend — JavaScript Modules

#### [NEW] [app.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/js/app.js)
- Entry point — initializes all modules on `DOMContentLoaded`
- Manages app state (idle/listening/thinking/speaking)
- Coordinates voice → agent → chat → reactor state flow
- Handles API key modal logic
- Updates live clock in status bar

#### [NEW] [voice.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/js/voice.js)
- **Speech Recognition** (`webkitSpeechRecognition`):
  - Continuous mode with interim results
  - "Hey JARVIS" wake word detection
  - Auto-restart on silence
  - Visual feedback during listening
- **Speech Synthesis** (`speechSynthesis`):
  - Auto-selects best British English voice
  - Queue management for long responses
  - Events: `onstart`, `onend` for reactor state sync

#### [NEW] [agent.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/js/agent.js)
- Sends messages to `POST /api/chat` with conversation history
- Maintains chat history array for context
- Handles streaming display of responses
- Parses `toolsUsed` from response to show in UI
- Error handling with retry logic

#### [NEW] [tools.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/js/tools.js)
Agentic tool definitions (Gemini function declarations):
| Tool | Description |
|------|-------------|
| `get_current_time` | Returns current date/time in any timezone |
| `get_weather` | Fetches weather for a location (Open-Meteo free API) |
| `search_web` | Web search via DuckDuckGo Instant Answer API (free) |
| `calculate` | Evaluates mathematical expressions |
| `set_reminder` | Sets a timed reminder (in-browser notification) |
| `get_news` | Fetches top headlines (free RSS/API) |
| `tell_joke` | Returns a random joke |
| `system_status` | Returns simulated system diagnostics |

Each tool has:
- A Gemini-compatible `functionDeclaration` schema
- A server-side execution function
- A UI display format for showing tool results

#### [NEW] [reactor.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/js/reactor.js)
- Manages arc reactor CSS state classes
- Smooth transitions between states
- Syncs with app state (idle → listening → thinking → speaking → idle)

#### [NEW] [particles.js](file:///c:/Users/astik/OneDrive/Desktop/jarvis-maybe/public/js/particles.js)
- Canvas-based floating particle system
- Subtle, ambient blue/cyan particles
- Connection lines between nearby particles (constellation effect)
- Responsive to window resize
- Low CPU usage (requestAnimationFrame, culling)

---

## Key Design Decisions

### Why Vanilla HTML/CSS/JS (No React/Vue)?
1. **Zero build step** — `npm start` and it runs immediately
2. **Maximum CSS control** — complex HUD animations are easier without framework abstractions
3. **Portfolio clarity** — demonstrates raw web fundamentals, which is impressive
4. **Tiny bundle** — instant load, no framework overhead

### Why Express Backend Instead of Direct Browser API Calls?
1. **Security** — API keys never touch the browser
2. **Tool execution** — Server-side fetch for weather/search APIs avoids CORS issues
3. **Extensibility** — Easy to add database, auth, or WebSocket later

### Why Gemini Flash?
1. **Free tier** — generous daily quota, no credit card
2. **Function calling** — native support for agentic tool use
3. **Speed** — Flash models are optimized for low-latency responses

---

## Verification Plan

### Automated Tests
```bash
# Start the server and verify it responds
npm start
# Visit http://localhost:3000
```

### Manual Verification
1. **Visual**: Confirm arc reactor animation, glassmorphic panels, particle background render correctly
2. **Voice**: Test mic button → speech recognition → JARVIS responds with TTS
3. **Chat**: Test text input → AI responds with contextual answers
4. **Tools**: Ask "What time is it?" → verify `get_current_time` tool fires
5. **Tools**: Ask "What's the weather in Tokyo?" → verify weather API integration
6. **State**: Confirm reactor changes state (listening → thinking → speaking)
7. **API Key Flow**: First-run modal appears, entering key enables JARVIS
