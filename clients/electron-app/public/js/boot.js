document.addEventListener('DOMContentLoaded', () => {
  const apiKeyModal = document.getElementById('api-key-modal');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeySubmit = document.getElementById('api-key-submit');
  
  // Also hook up the Mic Button to connect if we dismiss the modal later
  const micBtn = document.getElementById('mic-button');
  if (micBtn) {
    micBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const live = window.JarvisLive;
      if (!live) return;
      if (live.isConnected) {
         live.disconnect();
      } else {
         await live.connect();
      }
    });
  }

  if (apiKeySubmit) {
    apiKeySubmit.addEventListener('click', async () => {
      const key = apiKeyInput?.value.trim();
      if (!key) return;
      
      apiKeySubmit.textContent = 'INITIALIZING...';
      apiKeySubmit.disabled = true;
      
      try {
        const response = await fetch(window.API_BASE + '/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: key })
        });
        const result = await response.json();
        
        if (result.success) {
          apiKeyModal?.classList.add('hidden');
          if (window.JarvisLive) window.JarvisLive.connect();
        } else {
          apiKeySubmit.textContent = 'BOOT';
          apiKeySubmit.disabled = false;
          alert('Failed to save API key. Please try again.');
        }
      } catch (error) {
        apiKeySubmit.textContent = 'BOOT';
        apiKeySubmit.disabled = false;
        alert('Failed to save API key. Please try again.');
      }
    });
    
    apiKeyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') apiKeySubmit.click();
    });
  }

  // Check if we need to show the modal on load
  async function checkHealth() {
    try {
      const response = await fetch(window.API_BASE + '/api/health');
      const data = await response.json();
      if (data.hasApiKey) {
        apiKeyModal?.classList.add('hidden');
        if (window.JarvisLive) window.JarvisLive.connect();
        
        // Initialize WebRTC
        if (window.WebRTCManager) {
          window.webrtc = new window.WebRTCManager('laptop', 'remoteVideo');
          window.webrtc.initSignaling();
          // We can optionally start local stream and wait for mobile
          window.webrtc.startLocalStream();
        }
      } else {
        apiKeyModal?.classList.remove('hidden');
      }
    } catch {
      apiKeyModal?.classList.remove('hidden');
    }
  }
  
  // Electron IPC for click-through background
  if (typeof require !== 'undefined') {
    const { ipcRenderer } = require('electron');
    let isIgnoringMouse = false;
    
    document.addEventListener('pointerover', (e) => {
      const shouldIgnore = (e.target === document.documentElement || e.target === document.body || e.target.id === 'desktop-container');
      if (shouldIgnore !== isIgnoringMouse) {
        isIgnoringMouse = shouldIgnore;
        ipcRenderer.send('set-ignore-mouse-events', shouldIgnore, { forward: true });
      }
    });
  }

  checkHealth();
});
