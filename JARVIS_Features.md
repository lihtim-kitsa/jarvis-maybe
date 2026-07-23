# J.A.R.V.I.S. Feature Overview

JARVIS is a highly advanced, agentic AI assistant powered by Google's Gemini. Built on a decoupled Cloud-Local architecture (Cloud Brain + Local Hands + Clients), it provides pervasive intelligence across your desktop environment.

Below is a perfect description of all the core features and capabilities of JARVIS.

---

## 1. Omnipresent User Interface
JARVIS is designed to be accessible instantly, blending naturally into your workflow without interrupting it.
* **Always-On-Top Electron Widget:** A transparent, frameless UI that floats on your desktop screen. It stays out of your way until you need it.
* **Global Shortcut Access:** Instantly toggle JARVIS's visibility from anywhere in your operating system using `Ctrl + Alt + Shift + J`.

## 2. Advanced Computer Control (Local Hands)
Through its `Local Hands` daemon, JARVIS bridges the gap between text generation and actual physical computer operation.
* **Mouse Automation:** Can autonomously move the cursor, click, drag, and interact with applications.
* **Keyboard Automation:** Capable of typing text, simulating key presses, and executing complex keyboard shortcuts.
* **UI Element Inspection:** Reads the screen natively (using PyWinAuto UIA) to understand button placements, menus, text fields, and document structures for accurate interaction.
* **Live Snapshot & Screen Recording:** Captures visual context on command to understand what you are currently looking at on your screen.
* **System Automation:** Can lock your PC, control media playback and volume, and extract selected text from any application into its context via the clipboard.
* **Offline Dictation:** Triggers native Windows dictation (`Win + H`) for hands-free offline input.

## 3. Persistent Vector Memory (Long-term Recall)
JARVIS isn't just a stateless chatbot; it learns and remembers over time.
* **Vector Embeddings Database:** Utilizes `better-sqlite3` and cosine similarity to store and instantly retrieve your preferences, past conversations, and facts.
* **Memory Management:** You can explicitly ask JARVIS to remember things (`remember`), recall specific events (`recall`), or it can autonomously store important context as it helps you.

## 4. Multimodal Real-time Processing
JARVIS connects directly to the Gemini Multimodal Live API, enabling zero-latency conversational experiences.
* **Audio Streaming:** You can speak directly to JARVIS, and it will process the raw PCM audio in real-time and reply with voice.
* **Continuous Vision Loop:** Streams your screen or webcam (video chunks) seamlessly to the Cloud Brain, allowing JARVIS to "see" your environment and screen as you talk to it.

## 5. Developer & Coding Tools
JARVIS acts as an autonomous pair programmer that can inspect and modify your development environment.
* **Git Integration:** Can fetch `git status`, view `git diffs`, and automatically draft and execute `git commits`.
* **Local Codebase Search:** Searches through your local files and projects to understand context, finding specific functions or variables.
* **Python Sandbox:** Can write and execute Python code snippets on the fly to test algorithms, manipulate data, or run automation scripts.

## 6. Academic Research & Drafting Pipeline
A robust suite of tools designed to assist in heavy research tasks and paper writing.
* **Literature Search:** Hooks into academic databases (such as arXiv or Semantic Scholar) to search for papers, authors, and topics.
* **Citation Graphs:** Generates relationship graphs between various research papers.
* **LaTeX Integration:** Can write, edit, and automatically compile LaTeX documents, handling the entire drafting and review pipeline.

## 7. Third-Party Integrations
JARVIS seamlessly integrates with standard third-party services to manage your digital life.
* **Google Calendar:** Can read your schedule, create new events, and inform you of upcoming meetings.
* **Gmail:** Fetches your latest emails, senders, and subjects.
* **GitHub:** Queries repositories directly to find code and projects.
* **Slack:** Sends messages directly to specific channels without leaving your workflow.
* **Notion:** Searches through your pages and databases to retrieve stored knowledge.
* **Spotify:** Controls your music playback directly from the interface.

## 8. General Assistant Utilities
Like any good digital assistant, JARVIS comes with standard quality-of-life tools dynamically executed via function calling.
* **Reminders:** Set, list, and cancel local reminders.
* **Web Search:** Perform live internet searches to fetch up-to-date information.
* **Calculations:** Evaluate complex math expressions.
* **Weather & News:** Fetch localized weather forecasts and top news headlines.
* **System Commands:** Check system status, tell jokes, or open specific websites and applications autonomously.

---

### Architectural Synergy
These features are tied together by a **Cloud Brain**, which handles LLM routing, memory, and API integrations, while the **Local Hands** daemon strictly handles OS-level execution (Python/Node.js). **Clients** (Electron) handle video streaming.
