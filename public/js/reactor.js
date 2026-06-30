/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Reactor State Manager — reactor.js
   Controls arc reactor CSS state transitions (idle/listening/thinking/speaking)
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STATES = ['idle', 'listening', 'thinking', 'speaking'];

  const STATE_LABELS = {
    idle: 'ONLINE',
    listening: 'LISTENING',
    thinking: 'PROCESSING',
    speaking: 'TRANSMITTING'
  };

  class ReactorManager {
    constructor() {
      this.core = document.getElementById('reactor-core');
      this.label = document.getElementById('reactor-label');
      this.waveform = document.getElementById('waveform');
      this.statusIndicator = document.getElementById('status-indicator');
      this.statusText = document.getElementById('status-text');
      this.currentState = 'idle';
    }

    setState(state) {
      if (!STATES.includes(state)) {
        console.warn(`[Reactor] Unknown state: ${state}`);
        return;
      }

      if (this.currentState === state) return;

      const prev = this.currentState;
      this.currentState = state;

      // Update reactor core CSS classes
      if (this.core) {
        STATES.forEach(s => this.core.classList.remove(s));
        if (state !== 'idle') {
          this.core.classList.add(state);
        }
      }

      // Update label
      if (this.label) {
        this.label.textContent = STATE_LABELS[state];
      }

      // Update waveform visibility
      if (this.waveform) {
        if (state === 'listening' || state === 'speaking') {
          this.waveform.classList.remove('hidden');
        } else {
          this.waveform.classList.add('hidden');
        }
      }

      // Update status bar
      if (this.statusIndicator) {
        STATES.forEach(s => this.statusIndicator.classList.remove(s));
        this.statusIndicator.classList.add(state);
      }

      if (this.statusText) {
        this.statusText.textContent = STATE_LABELS[state];
      }

      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('jarvis-state-change', {
        detail: { state, previousState: prev }
      }));
    }

    getState() {
      return this.currentState;
    }
  }

  window.JarvisReactor = new ReactorManager();
})();
