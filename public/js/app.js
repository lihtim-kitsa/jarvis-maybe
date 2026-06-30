/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Main Application — app.js
   Orchestrator that wires together Voice, Chat, Agent, and Reactor modules
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Module references (set by IIFE pattern in other scripts)
  const voice = window.JarvisVoice;
  const chat = window.JarvisChat;
  const agent = window.JarvisAgent;
  const reactor = window.JarvisReactor;

  // DOM references
  const micBtn = document.getElementById('mic-button');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-button');
  const apiKeyModal = document.getElementById('api-key-modal');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeySubmit = document.getElementById('api-key-submit');
  const clockEl = document.getElementById('hud-clock');
  const dateEl = document.getElementById('hud-date');
  const activityLog = document.getElementById('activity-log');

  let isInitialized = false;
  let lastError = null;  // Stores the most recent error message from the agent

  // ─── Clock ─────────────────────────────────────────────────────────────

  function updateClock() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).toUpperCase();
    }
  }

  // ─── Activity Log ──────────────────────────────────────────────────────

  function logActivity(text, type = '') {
    if (!activityLog) return;
    const time = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const entry = document.createElement('div');
    entry.className = 'activity-entry';
    entry.innerHTML = `
      <span class="activity-time">${time}</span>
      <span class="activity-text ${type}">${text}</span>
    `;

    activityLog.appendChild(entry);
    activityLog.scrollTop = activityLog.scrollHeight;

    // Keep max 50 entries
    while (activityLog.children.length > 50) {
      activityLog.removeChild(activityLog.firstChild);
    }
  }

  // ─── Send Message Flow ─────────────────────────────────────────────────

  async function handleSendMessage(text) {
    if (!text.trim() || agent.isProcessing) return;
    lastError = null;  // Reset error state

    // Add user message to chat
    chat.addUserMessage(text);
    logActivity(`User: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`, '');

    // Show thinking state
    reactor.setState('thinking');
    chat.showTyping();

    // Get conversation history (last 10 messages for context)
    const history = chat.getHistory().slice(-10);

    // Send to agent
    const response = await agent.sendMessage(text, history);

    // Hide typing
    chat.hideTyping();

    if (response) {
      // Add JARVIS response to chat
      chat.addJarvisMessage(response.response, response.toolsUsed || []);
      logActivity('JARVIS responded', 'success');

      // Speak the response
      reactor.setState('speaking');
      voice.speak(response.response);

      // Handle reminders
      if (response.reminder) {
        const reminder = response.reminder;
        setTimeout(() => {
          const msg = `Reminder: ${reminder.message}`;
          chat.addJarvisMessage(msg, []);
          voice.speak(msg);
          logActivity(`Reminder triggered: ${reminder.message}`, 'tool');
        }, (reminder.seconds || 60) * 1000);
        logActivity(`Reminder set for ${reminder.seconds}s`, 'tool');
      }

      // Handle URLs to open in new tabs
      if (response.urlsToOpen) {
        for (const item of response.urlsToOpen) {
          try {
            window.open(item.url, '_blank', 'noopener,noreferrer');
            logActivity(`Opened: ${item.name || item.url}`, 'success');
          } catch (e) {
            logActivity(`Failed to open: ${item.url}`, 'error');
          }
        }
      }
    } else {
      // Use the actual error message from the server if available
      const errorMsg = lastError || "I'm experiencing a temporary disruption, sir. Please try again.";
      chat.addJarvisMessage(errorMsg);
      logActivity('Response error', 'error');
      reactor.setState('idle');
    }
  }

  // ─── Voice Callbacks ───────────────────────────────────────────────────

  function setupVoice() {
    if (!voice) return;

    voice.onStart = () => {
      reactor.setState('listening');
      micBtn?.classList.add('active');
      logActivity('Listening...', '');
    };

    voice.onEnd = () => {
      micBtn?.classList.remove('active');
      if (reactor.getState() === 'listening') {
        reactor.setState('idle');
      }
    };

    voice.onResult = (transcript) => {
      // Check for wake word
      const lower = transcript.toLowerCase();
      if (lower.startsWith('hey jarvis') || lower.startsWith('jarvis')) {
        // Strip wake word from the command
        let command = transcript.replace(/^(hey\s+)?jarvis[,.\s]*/i, '').trim();
        if (command) {
          handleSendMessage(command);
        }
      } else {
        handleSendMessage(transcript);
      }
    };

    voice.onSpeakStart = () => {
      reactor.setState('speaking');
    };

    voice.onSpeakEnd = () => {
      reactor.setState('idle');
    };
  }

  // ─── Agent Callbacks ───────────────────────────────────────────────────

  function setupAgent() {
    if (!agent) return;

    agent.onError = (errorMessage) => {
      lastError = errorMessage;
      logActivity(`Error: ${errorMessage.substring(0, 60)}`, 'error');
    };

    agent.onToolUse = (toolName, args) => {
      const toolMap = {
        get_current_time: 'time',
        get_weather: 'weather',
        search_web: 'search',
        calculate: 'calculate',
        set_reminder: 'reminder',
        get_news: 'news',
        tell_joke: 'joke',
        system_status: 'system',
        open_website: 'website'
      };

      const toolKey = toolMap[toolName];
      logActivity(`Tool: ${toolName.replace(/_/g, ' ')}`, 'tool');

      // Flash the capability item
      if (toolKey) {
        const capItem = document.querySelector(`.capability-item[data-tool="${toolKey}"]`);
        if (capItem) {
          const status = capItem.querySelector('.cap-status');
          if (status) {
            status.textContent = 'ACTIVE';
            status.classList.remove('online');
            status.classList.add('active');
            setTimeout(() => {
              status.textContent = 'READY';
              status.classList.remove('active');
              status.classList.add('online');
            }, 3000);
          }
        }
      }
    };
  }

  // ─── Event Listeners ───────────────────────────────────────────────────

  function setupEventListeners() {
    // Mic button
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        if (voice.isListening) {
          voice.stopListening();
        } else {
          // Stop speaking if JARVIS is talking
          voice.stopSpeaking();
          voice.startListening();
        }
      });
    }

    // Text input
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = chatInput.value.trim();
          if (text) {
            chatInput.value = '';
            handleSendMessage(text);
          }
        }
      });
    }

    // Send button
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const text = chatInput?.value.trim();
        if (text) {
          chatInput.value = '';
          handleSendMessage(text);
        }
      });
    }

    // API Key modal
    if (apiKeySubmit) {
      apiKeySubmit.addEventListener('click', async () => {
        const key = apiKeyInput?.value.trim();
        if (!key) return;

        apiKeySubmit.textContent = 'INITIALIZING...';
        apiKeySubmit.disabled = true;

        const result = await agent.saveApiKey(key);

        if (result.success) {
          apiKeyModal?.classList.add('hidden');
          initializeJarvis();
        } else {
          apiKeySubmit.textContent = 'INITIALIZE';
          apiKeySubmit.disabled = false;
          alert('Failed to save API key. Please try again.');
        }
      });

      apiKeyInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') apiKeySubmit.click();
      });
    }
  }

  // ─── Initialization ────────────────────────────────────────────────────

  async function initializeJarvis() {
    if (isInitialized) return;
    isInitialized = true;

    logActivity('J.A.R.V.I.S. online', 'success');
    logActivity('All systems operational', 'success');

    reactor.setState('idle');

    // Send initial greeting
    setTimeout(async () => {
      reactor.setState('thinking');
      chat.showTyping();

      const greeting = await agent.sendMessage(
        "The user just opened the JARVIS interface. Greet them briefly and let them know you're ready. Be characteristically JARVIS — witty and concise.",
        []
      );

      chat.hideTyping();

      if (greeting) {
        chat.addJarvisMessage(greeting.response, []);
        reactor.setState('speaking');
        voice.speak(greeting.response);
      } else {
        const fallback = "Good day. All systems are operational and at your disposal.";
        chat.addJarvisMessage(fallback, []);
        reactor.setState('speaking');
        voice.speak(fallback);
      }
    }, 1500);
  }

  // ─── Boot Sequence ─────────────────────────────────────────────────────

  async function boot() {
    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Setup modules
    setupVoice();
    setupAgent();
    setupEventListeners();

    logActivity('System boot sequence', '');

    // Check if API key is configured
    const health = await agent.checkHealth();

    if (health.hasApiKey) {
      // API key already configured — hide modal, start JARVIS
      apiKeyModal?.classList.add('hidden');
      initializeJarvis();
    } else {
      // Show API key modal
      logActivity('Awaiting API key configuration...', '');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
