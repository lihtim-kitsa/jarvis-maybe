# J.A.R.V.I.S. 🤖

An advanced, agentic AI Assistant powered by Google's Gemini, built with Electron and Node.js. JARVIS is designed to be a highly capable, always-on-top companion that can interact with your computer, manage your memory, run developer tasks, and seamlessly help you throughout your day.

## ✨ Features

*   **Always-On-Top Widget Interface**: A sleek, transparent, and frameless Electron UI that floats above your workspace. Toggle visibility instantly anywhere using the global shortcut (`Ctrl+Alt+Shift+J`).
*   **Computer Control**: Python-powered system integration allowing JARVIS to control the mouse, type text, and inspect on-screen UI elements (via `pyautogui` and `pywinauto`).
*   **Persistent Vector Memory**: JARVIS remembers you! Built with `better-sqlite3`, it stores conversations and facts as vector embeddings, instantly recalling relevant context using cosine similarity.
*   **Developer Mode Tools**: Built-in capabilities to assist developers, including interacting with Git (status, diffs, commits), running Python code snippets on the fly, and searching local codebases.
*   **Research & Drafting**: Search academic papers (arXiv, Semantic Scholar), generate citation graphs, and utilize an automated LaTeX drafting and review pipeline.
*   **Third-Party Integrations**: Built-in connections to Google Calendar (for event management) and Spotify (for playback control).
*   **Extensible Tool Calling**: Connects natively with Gemini's function calling abilities to fetch the weather, browse the web, calculate math expressions, manage local reminders, and more.

## 🛠️ Tech Stack

*   **Frontend/Desktop App**: Electron
*   **Backend Server**: Node.js + Express
*   **AI Engine**: `@google/genai` (Gemini API)
*   **Database**: `better-sqlite3` (for persistent memory and embeddings)
*   **System Automation**: Python (`pyautogui`, `pywinauto`, `pywin32`)

## 🚀 Getting Started

Since JARVIS has been refactored into a scalable cloud-local architecture, you can start the components independently based on your needs.

### Prerequisites
*   Node.js (v18+)
*   Python 3.8+ (for Local Hands)
*   A Google Gemini API key

### 1. Environment Setup

Create a `.env` file in the `cloud-brain` directory (and optionally copy it to `local-hands` and the root if needed) with the following variables:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
GEMINI_MODEL=gemini-3.1-flash-lite
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

### 2. Installation & Running

You can install dependencies for each component and run them in separate terminal windows.

#### Cloud Brain (Backend)
The core intelligence hub handling Gemini interactions and signaling.
```bash
cd cloud-brain
npm install
npm start
```

#### Local Hands (System Daemon)
Executes local PC commands and automations. Requires Python packages for OS control.
```bash
cd local-hands
npm install
pip install pyautogui pywinauto pywin32
npm start
```

#### Desktop Client (Electron)
The transparent, always-on-top widget UI.
```bash
# Run from the root directory of the project
npm install
npm run electron-start
```

## ⌨️ Shortcuts & Controls

*   **Toggle J.A.R.V.I.S UI**: `Ctrl + Alt + Shift + J`

## 🧠 Architecture Overview (Cloud Brain + Local Hands)

JARVIS has been refactored into a scalable cloud-local architecture, supporting live video streaming and shared state across your desktop environment.

*   **Cloud Brain (`cloud-brain/`)**: The core intelligence hub. Deployable to a VPS or cloud container.
    *   `server.js`: Orchestrates the Gemini API, routes WebRTC signaling (`/signal`), and manages WebSocket connections from clients.
    *   `database.js`: The central SQLite memory store for all clients.
    *   `google_calendar.js`, `research_tools.js`, `drafting_pipeline.js`: Cloud-compatible integrations.
*   **Local Hands (`local-hands/`)**: A background daemon running on your PC. It connects to the Cloud Brain via WebSocket and executes local commands (Git, Python, File System, OS control).
    *   `daemon.js`: Listens for tool calls and forwards results back to the Cloud Brain.
    *   `dev_tools.js`, `computer_control.py`: Executed locally.
*   **Clients (`clients/`)**:
    *   **Electron Desktop App (`clients/electron-app/`)**: Always-on-top transparent UI. Includes `live.js` for Gemini Multimodal Live API audio/video streaming, and `webrtc.js` for P2P video sharing.
## 📄 License

This project is licensed under the MIT License.
