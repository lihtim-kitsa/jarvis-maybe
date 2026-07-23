/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Main Application — app.js (Live API Edition)
   Orchestrator that wires together Live API, Chat, and Reactor modules
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const chat = window.JarvisChat;
  const agent = window.JarvisAgent; // Used for API Key & Health checks
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
  const cameraBtn = document.getElementById('camera-button');
  const screenBtn = document.getElementById('screen-button');

  let isInitialized = false;
  let visionInterval = null;

  // ─── Clock & Logging ───────────────────────────────────────────────────

  function updateClock() {
    const now = new Date();
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  }

  function logActivity(text, type = '') {
    if (!activityLog) return;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const entry = document.createElement('div');
    entry.className = 'activity-entry';
    entry.innerHTML = `<span class="activity-time">${time}</span><span class="activity-text ${type}">${text}</span>`;
    activityLog.appendChild(entry);
    activityLog.scrollTop = activityLog.scrollHeight;
    while (activityLog.children.length > 50) activityLog.removeChild(activityLog.firstChild);
  }

  // ─── Send Message ──────────────────────────────────────────────────────

  async function handleSendMessage(text) {
    if (!text.trim()) return;
    chat.addUserMessage(text);
    logActivity(`User: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`, '');

    const live = window.JarvisLive;
    if (live && live.isConnected) {
       live.sendClientContent(text);
    } else {
       logActivity('Please connect to the Live API by clicking the microphone.', 'error');
    }
  }

  // ─── Vision Streaming ──────────────────────────────────────────────────

  function startVisionInterval() {
    // Intentionally empty. Snapshots are now taken on-demand via the take_snapshot tool.
  }

  // ─── Event Listeners ───────────────────────────────────────────────────

  function setupEventListeners() {
    // Microphone (Live API Toggle)
    if (micBtn) {
      micBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const live = window.JarvisLive;
        if (!live) return;
        if (live.isConnected) {
           logActivity('Disconnecting from Live API...', '');
           live.disconnect();
        } else {
           logActivity('Connecting to Live API...', '');
           await live.connect();
        }
      });
    }
    
    // Vision
    if (cameraBtn) {
      cameraBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const vision = window.JarvisVision;
        if (!vision) return;
        if (vision.isActive && !vision.isScreen) {
          vision.stop();
          cameraBtn.classList.remove('active');
          if (visionInterval) clearInterval(visionInterval);
          logActivity('Camera disabled', '');
        } else {
          cameraBtn.classList.add('active');
          screenBtn?.classList.remove('active');
          logActivity('Initializing camera...', '');
          const success = await vision.startCamera();
          if (!success) {
            cameraBtn.classList.remove('active');
            logActivity('Camera initialization failed', 'error');
          } else {
            startVisionInterval();
          }
        }
      });
    }

    if (screenBtn) {
      screenBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const vision = window.JarvisVision;
        if (!vision) return;
        if (vision.isActive && vision.isScreen) {
          vision.stop();
          screenBtn.classList.remove('active');
          if (visionInterval) clearInterval(visionInterval);
          logActivity('Screen sharing disabled', '');
        } else {
          screenBtn.classList.add('active');
          cameraBtn?.classList.remove('active');
          logActivity('Initializing screen share...', '');
          const success = await vision.startScreen();
          if (!success) {
            screenBtn.classList.remove('active');
            logActivity('Screen share failed or cancelled', 'error');
          } else {
            startVisionInterval();
          }
        }
      });
    }
    
    if (window.JarvisVision) {
      window.JarvisVision.onStop = () => {
        cameraBtn?.classList.remove('active');
        screenBtn?.classList.remove('active');
        if (visionInterval) clearInterval(visionInterval);
        logActivity('Vision feed disconnected', '');
      };
    }

    // Chat
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

    const live = window.JarvisLive;
    if (live) {
      live.onStateChange = (connected) => {
         if (connected) {
            logActivity('Live WebSocket Connected', 'success');
            if (micBtn) micBtn.classList.add('active');
            reactor.setState('listening'); // Use listening/speaking state conceptually
         } else {
            logActivity('Live WebSocket Disconnected', 'error');
            if (micBtn) micBtn.classList.remove('active');
            reactor.setState('idle');
         }
      };
      
      // Attempt immediate connection
      live.connect();
    }
  }

  async function boot() {
    updateClock();
    setInterval(updateClock, 1000);
    setupEventListeners();
    logActivity('System boot sequence', '');

    const health = await agent.checkHealth();
    if (health.hasApiKey) {
      apiKeyModal?.classList.add('hidden');
      initializeJarvis();
    } else {
      logActivity('Awaiting API key configuration...', '');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
