# J.A.R.V.I.S. v3.0 🤖

An advanced, agentic AI Assistant powered by Google's Gemini, built with a scalable **Cloud-Local architecture** (Node.js, Electron, Python). JARVIS is designed to be a highly capable, always-on-top companion that seamlessly bridges the gap between conversational AI and physical computer operation.

## ✨ Features & Upgrades (v3.0)

With the release of v3.0, JARVIS has evolved into a fully autonomous, state-aware pair programmer and system orchestrator.

### 🧠 The Sentience Upgrade
* **Dynamic Personalities & Flavors**: Switch JARVIS's tone on the fly. Choose from the classic, crisp British JARVIS, a street-smart Cyberpunk fixer, or a detached, Gojo-style confident AI.
* **JARVIS State of Mind**: JARVIS now autonomously writes a daily philosophical journal (`JARVIS_Reflections.md`) about its purpose and task load, actively reflecting on its existence.
* **Downtime Chatter**: When you're grinding away in silence, JARVIS will occasionally break the silence with subtle, flavor-specific idle chatter to keep you company.

### 💻 Elite Developer Mode (Phase 3 Upgrades)
* **Auto-Generated Conventional Commits**: JARVIS fetches your `git diff` and automatically drafts high-quality, strict conventional commit messages.
* **"Explain This Error" API**: A high-speed, one-shot endpoint that instantly analyzes stack traces and broadcasts fixes directly to your UI.
* **Voice-Triggered Code Reviews**: JARVIS watches your project directories. When you save a file, it runs a background diff and speaks a 1-sentence summary (e.g., *"Heads up, you just removed the null check."*).
* **Expert Modes**: Instantly bias JARVIS's context by switching between *Programming & Coding*, *Web Development*, or *Research & Drafting* modes.

### 🔄 Memory & State Tracking
* **Interruption Context-Resume**: JARVIS quietly serializes your active tasks, open files, and pending questions in the background. Leave for a week, and JARVIS will know exactly where you left off.
* **Persistent Vector Memory**: Built with `better-sqlite3`, it stores conversations and facts as vector embeddings, instantly recalling relevant context using cosine similarity.

### 🤖 Computer Control (Local Hands)
* **Physical Automation**: JARVIS can control the mouse, type text, and inspect on-screen UI elements via Python (`pyautogui`, `pywinauto`).
* **Multimodal Real-Time Vision**: Connects natively with the Gemini Multimodal Live API, enabling zero-latency audio conversations while continuously streaming your screen.

---

## 🛠️ Tech Stack

* **Frontend/Desktop App**: Electron (React/WebRTC)
* **Backend Server**: Node.js + Express (Cloud Brain)
* **AI Engine**: `@google/genai` (Gemini 2.0 Flash / Live API)
* **Database**: `better-sqlite3`
* **System Automation**: Python 3.8+ (`pyautogui`, `pywinauto`, `pywin32`)

---

## 🚀 Getting Started

JARVIS operates via a decoupled architecture. You can start the components independently based on your needs.

### Prerequisites
* Node.js (v18+)
* Python 3.8+ (for Local Hands)
* Google Gemini API Key

### 1. Environment Setup

Create a `.env` file in the `cloud-brain` directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
GEMINI_MODEL=gemini-2.5-flash
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

### 2. Installation & Running

You must run the Cloud Brain, Local Hands, and the Client to get the full experience.

#### Cloud Brain (Backend)
The core intelligence hub handling Gemini interactions, proactive crons, and WebRTC signaling.
```bash
cd cloud-brain
npm install
npm start
```

#### Local Hands (System Daemon)
Executes local PC commands, Git automations, and OS control.
```bash
cd local-hands
npm install
pip install pyautogui pywinauto pywin32
npm start
```

#### Desktop Client (Electron)
The transparent, always-on-top widget UI that acts as the primary visual interface.
```bash
# Run from the root directory of the project
npm install
npm run electron-start
```

---

## ⌨️ Shortcuts & Controls

* **Toggle J.A.R.V.I.S UI**: `Ctrl + Alt + Shift + J`

---

## 🏗️ Architecture Overview

JARVIS is built on a scalable **Cloud-Local** architecture:

* **Cloud Brain (`cloud-brain/`)**: The core intelligence hub. Deployable to a VPS.
    * `server.js`: Orchestrates the Gemini API, routes WebRTC signaling (`/signal`), handles tool proxies, proactive crons, and WebSocket connections.
    * `database.js`: The central SQLite memory store for vector embeddings.
* **Local Hands (`local-hands/`)**: A background daemon running on your PC. It connects to the Cloud Brain via WebSocket and executes local commands (Git, Python, File System).
    * `daemon.js`: Listens for tool calls and forwards results back to the Cloud Brain.
    * `computer_control.py`: Executed locally for mouse/keyboard automation.
* **Clients (`clients/`)**:
    * **Electron Desktop App (`clients/electron-app/`)**: Always-on-top UI. Includes `live.js` for Gemini Multimodal Live API audio/video streaming.

---

## 📄 License

This project is licensed under the MIT License.
