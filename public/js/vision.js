/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Vision Interface — vision.js
   WebRTC API — Webcam and Screen Capture
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  class VisionManager {
    constructor() {
      this.stream = null;
      this.videoEl = document.getElementById('vision-video');
      this.snapshotEl = document.getElementById('vision-snapshot');
      this.snapshotContainer = document.getElementById('vision-snapshot-container');
      this.overlayEl = document.getElementById('vision-overlay');
      this.closeBtn = document.getElementById('vision-close-btn');
      
      this.canvasEl = document.createElement('canvas');
      this.ctx = this.canvasEl.getContext('2d');
      this.isActive = false;
      this.isScreen = false;
      this.onStop = null;

      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', () => {
          this.stop();
          if (this.onStop) this.onStop();
        });
      }
    }

    async startCamera() {
      if (this.isActive) this.stop();
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        return this._bindStream(false);
      } catch (err) {
        console.error("[Vision] Camera access denied or error:", err);
        return false;
      }
    }

    async startScreen() {
      if (this.isActive) this.stop();
      try {
        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        return this._bindStream(true);
      } catch (err) {
        console.error("[Vision] Screen access denied or error:", err);
        return false;
      }
    }

    _bindStream(isScreen) {
      if (!this.stream || !this.videoEl) return false;
      
      this.videoEl.srcObject = this.stream;
      this.videoEl.play();
      this.isActive = true;
      this.isScreen = isScreen;
      
      if (this.overlayEl) {
        this.overlayEl.classList.remove('hidden');
      }
      if (this.snapshotContainer) {
        this.snapshotContainer.classList.add('hidden');
      }

      // Handle user stopping stream via browser UI (especially for screen share)
      const track = this.stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          this.stop();
          if (this.onStop) this.onStop();
        };
      }
      return true;
    }

    stop() {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      if (this.videoEl) {
        this.videoEl.srcObject = null;
      }
      if (this.overlayEl) {
        this.overlayEl.classList.add('hidden');
      }
      this.isActive = false;
    }

    takeSnapshot() {
      if (!this.isActive || !this.videoEl || this.videoEl.videoWidth === 0) return null;
      
      this.canvasEl.width = this.videoEl.videoWidth;
      this.canvasEl.height = this.videoEl.videoHeight;
      
      this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
      
      const base64Image = this.canvasEl.toDataURL('image/jpeg', 0.8);
      
      // Show snapshot in UI temporarily
      if (this.snapshotEl && this.snapshotContainer) {
        this.snapshotEl.src = base64Image;
        this.snapshotContainer.classList.remove('hidden');
        
        // Hide it after 4 seconds
        setTimeout(() => {
          this.snapshotContainer.classList.add('hidden');
        }, 4000);
      }
      
      return base64Image;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.JarvisVision = new VisionManager();
  });
})();
