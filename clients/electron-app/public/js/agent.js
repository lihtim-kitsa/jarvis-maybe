/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Agent — agent.js
   Communicates with the Express backend, manages conversation context
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  class AgentManager {
    constructor() {
      this.isProcessing = false;
      this.onToolUse = null;      // callback(toolName)
      this.onResponse = null;     // callback(text, toolsUsed)
      this.onError = null;        // callback(error)
      this.onReminder = null;     // callback(reminder)
    }

    async sendMessage(message, history = [], image = null) {
      if (this.isProcessing) return null;
      this.isProcessing = true;

      try {
        const payload = { message, history };
        if (image) payload.image = image;

        const response = await fetch(window.API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        // Handle tool usage notification
        if (data.toolsUsed && data.toolsUsed.length > 0 && this.onToolUse) {
          for (const tool of data.toolsUsed) {
            this.onToolUse(tool.name, tool.args);
          }
        }

        // Handle reminder
        if (data.reminder && this.onReminder) {
          this.onReminder(data.reminder);
        }

        // Notify response
        if (this.onResponse) {
          this.onResponse(data.response, data.toolsUsed || []);
        }

        return data;

      } catch (error) {
        console.error('[Agent] Error:', error);
        if (this.onError) {
          this.onError(error.message);
        }
        return null;
      } finally {
        this.isProcessing = false;
      }
    }

    async checkHealth() {
      try {
        const response = await fetch(window.API_BASE + '/api/health');
        return await response.json();
      } catch {
        return { status: 'offline', hasApiKey: false };
      }
    }

    async saveApiKey(apiKey) {
      try {
        const response = await fetch(window.API_BASE + '/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey })
        });
        return await response.json();
      } catch (error) {
        console.error('[Agent] Failed to save API key:', error);
        return { success: false, error: error.message };
      }
    }
  }

  window.JarvisAgent = new AgentManager();
})();
