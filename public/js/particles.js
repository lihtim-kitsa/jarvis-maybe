/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Particle System — particles.js
   Canvas-based ambient floating particles with constellation connections
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animationId = null;
  let width, height;

  // Configuration
  const CONFIG = {
    particleCount: 60,
    maxSpeed: 0.3,
    particleSize: { min: 1, max: 2.5 },
    connectionDistance: 140,
    connectionOpacity: 0.08,
    particleColor: { r: 0, g: 212, b: 255 },       // JARVIS cyan
    particleSecondary: { r: 0, g: 119, b: 255 },    // JARVIS blue
    fadeEdge: 100 // pixels from edge to start fading
  };

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * CONFIG.maxSpeed;
      this.vy = (Math.random() - 0.5) * CONFIG.maxSpeed;
      this.size = CONFIG.particleSize.min + Math.random() * (CONFIG.particleSize.max - CONFIG.particleSize.min);
      this.opacity = 0.2 + Math.random() * 0.5;
      this.pulseSpeed = 0.005 + Math.random() * 0.01;
      this.pulseOffset = Math.random() * Math.PI * 2;
      this.useSecondary = Math.random() > 0.7;
    }

    update(time) {
      this.x += this.vx;
      this.y += this.vy;

      // Wrap around edges
      if (this.x < -10) this.x = width + 10;
      if (this.x > width + 10) this.x = -10;
      if (this.y < -10) this.y = height + 10;
      if (this.y > height + 10) this.y = -10;

      // Gentle pulse
      this.currentOpacity = this.opacity * (0.7 + 0.3 * Math.sin(time * this.pulseSpeed + this.pulseOffset));
    }

    draw() {
      const color = this.useSecondary ? CONFIG.particleSecondary : CONFIG.particleColor;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${this.currentOpacity})`;
      ctx.fill();

      // Glow effect for larger particles
      if (this.size > 2) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${this.currentOpacity * 0.1})`;
        ctx.fill();
      }
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.connectionDistance) {
          const opacity = CONFIG.connectionOpacity * (1 - dist / CONFIG.connectionDistance);
          const color = CONFIG.particleColor;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Adjust particle count based on screen size
    const targetCount = Math.max(30, Math.floor((width * height) / 25000));
    while (particles.length < targetCount) {
      particles.push(new Particle());
    }
    while (particles.length > targetCount) {
      particles.pop();
    }
  }

  function animate(time) {
    ctx.clearRect(0, 0, width, height);

    // Update & draw particles
    for (const p of particles) {
      p.update(time);
      p.draw();
    }

    // Draw connections
    drawConnections();

    animationId = requestAnimationFrame(animate);
  }

  function init() {
    resize();
    for (let i = 0; i < CONFIG.particleCount; i++) {
      particles.push(new Particle());
    }
    animate(0);
  }

  window.addEventListener('resize', resize);

  // Expose for cleanup if needed
  window.JarvisParticles = {
    init,
    destroy: () => {
      if (animationId) cancelAnimationFrame(animationId);
      particles = [];
    }
  };

  // Auto-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
