/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Chat UI — chat.js
   Renders messages, handles auto-scroll, and typing indicators
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  class ChatManager {
    constructor() {
      this.messagesEl = document.getElementById('chat-messages');
      this.typingEl = document.getElementById('typing-indicator');
      this.messages = [];

      this._renderWelcome();
    }

    _renderWelcome() {
      if (!this.messagesEl) return;
      const welcome = document.createElement('div');
      welcome.className = 'welcome-message';
      welcome.innerHTML = `
        <div class="welcome-icon">◇</div>
        <div class="welcome-title">SYSTEM ONLINE</div>
        <div class="welcome-subtitle">
          J.A.R.V.I.S. is ready. Speak or type a command to begin.
        </div>
      `;
      this.messagesEl.appendChild(welcome);
    }

    _getTimeString() {
      return new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }

    _scrollToBottom() {
      if (this.messagesEl) {
        requestAnimationFrame(() => {
          this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
      }
    }

    _clearWelcome() {
      const welcome = this.messagesEl?.querySelector('.welcome-message');
      if (welcome) welcome.remove();
    }

    addUserMessage(text) {
      this._clearWelcome();
      const time = this._getTimeString();
      this.messages.push({ role: 'user', content: text, time });

      const el = document.createElement('div');
      el.className = 'message user';
      el.innerHTML = `
        <div class="message-bubble">${this._escapeHtml(text)}</div>
        <div class="message-meta">
          <span class="message-sender">YOU</span>
          <span class="message-time">${time}</span>
        </div>
      `;
      this.messagesEl?.appendChild(el);
      this._scrollToBottom();
    }

    addJarvisMessage(text, toolsUsed = []) {
      this._clearWelcome();
      const time = this._getTimeString();
      this.messages.push({ role: 'assistant', content: text, time, toolsUsed });

      const el = document.createElement('div');
      el.className = 'message jarvis';

      let toolBadgesHtml = '';
      if (toolsUsed.length > 0) {
        const badges = toolsUsed.map(t =>
          `<span class="tool-badge">${this._formatToolName(t.name)}</span>`
        ).join('');
        toolBadgesHtml = `<div class="tool-badges">${badges}</div>`;
      }

      el.innerHTML = `
        <div class="message-bubble">${this._escapeHtml(text)}</div>
        ${toolBadgesHtml}
        <div class="message-meta">
          <span class="message-sender">JARVIS</span>
          <span class="message-time">${time}</span>
        </div>
      `;
      this.messagesEl?.appendChild(el);
      this._scrollToBottom();
    }

    showTyping() {
      if (this.typingEl) {
        this.typingEl.classList.remove('hidden');
        this._scrollToBottom();
      }
    }

    hideTyping() {
      if (this.typingEl) {
        this.typingEl.classList.add('hidden');
      }
    }

    getHistory() {
      // Return conversation history for context
      return this.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));
    }

    _formatToolName(name) {
      return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    _escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  window.JarvisChat = new ChatManager();
})();
