/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Clap Detector — clap.js
   Web Audio API — Impulsive Noise Detection
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  class ClapDetector {
    constructor() {
      this.audioContext = null;
      this.analyser = null;
      this.microphone = null;
      this.dataArray = null;
      
      this.isListening = false;
      this.clapHistory = [];
      
      this.onDoubleClap = null;
      
      this.cooldown = false;
    }

    async init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        
        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.microphone.connect(this.analyser);
        
        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        
        this.isListening = true;
        this.detect();
        return true;
      } catch (e) {
        console.error('[Clap] Failed to initialize audio:', e);
        return false;
      }
    }

    detect() {
      if (!this.isListening) return;
      requestAnimationFrame(() => this.detect());

      this.analyser.getByteTimeDomainData(this.dataArray);
      
      let maxVal = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const val = Math.abs(this.dataArray[i] - 128); // 128 is silence in 8-bit
        if (val > maxVal) maxVal = val;
      }
      
      // Clap threshold (sharp volume spike)
      if (maxVal > 50 && !this.cooldown) {
        this.registerClap();
        this.cooldown = true;
        setTimeout(() => { this.cooldown = false; }, 250); // 250ms debounce between claps
      }
    }

    registerClap() {
      const now = Date.now();
      this.clapHistory.push(now);
      
      // Keep only claps from the last 1.5 seconds
      this.clapHistory = this.clapHistory.filter(time => now - time < 1500);
      
      // Instantly trigger on 2nd clap
      if (this.clapHistory.length >= 2) {
        if (this.onDoubleClap) {
           this.onDoubleClap();
        }
        this.clapHistory = []; // Reset
      }
    }
    
    stop() {
       this.isListening = false;
       if (this.audioContext) {
           this.audioContext.close();
       }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.JarvisClap = new ClapDetector();
  });
})();
