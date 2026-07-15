/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Live API Core — live.js
   Handles real-time WebSocket connection to Gemini Multimodal Live API
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
   'use strict';

   class LiveAPI {
      constructor() {
         this.ws = null;
         this.isConnected = false;

         this.audioContext = null;
         this.audioWorklet = null;
         this.microphone = null;
         this.mediaStream = null;

         this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
         this.nextPlaybackTime = 0;

         this.onStateChange = null;

         this.alertSource = new EventSource('/api/alerts');
         this.alertSource.onmessage = (e) => {
            const data = JSON.parse(e.data);
            console.log('[Live] Received System Alert:', data.message);
            if (this.ws && this.isConnected) {
               this.ws.send(JSON.stringify({
                  clientContent: {
                     turns: [{
                        role: 'user',
                        parts: [{ text: `[SYSTEM ALERT] ${data.message}. Acknowledge this alert to the user proactively immediately.` }]
                     }],
                     turnComplete: true
                  }
               }));
            }
         };
      }

      async connect() {
         if (this.isConnected) return;

         try {
            const configRes = await fetch('/api/config/client');
            const config = await configRes.json();

            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${config.apiKey}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
               this.isConnected = true;
               if (this.onStateChange) this.onStateChange(true);

               this.ws.send(JSON.stringify({
                  setup: {
                     model: 'models/gemini-3.1-flash-live-preview',
                     systemInstruction: { parts: [{ text: config.systemInstruction }] },
                     tools: [{ functionDeclarations: config.tools }],
                     generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                           voiceConfig: {
                              prebuiltVoiceConfig: {
                                 voiceName: "Puck"
                              }
                           }
                        }
                     }
                  }
               }));

               // Wait for setupComplete before starting capture
            };

            this.ws.onmessage = async (e) => {
               let msg;
               if (e.data instanceof Blob) {
                  const text = await e.data.text();
                  msg = JSON.parse(text);
               } else {
                  msg = JSON.parse(e.data);
               }

               if (msg.error) {
                  const activityLog = document.getElementById('activity-log');
                  if (activityLog) {
                     const entry = document.createElement('div');
                     entry.className = 'activity-entry';
                     entry.innerHTML = `<span class="activity-text error">API Error: ${msg.error.message || JSON.stringify(msg.error)}</span>`;
                     activityLog.appendChild(entry);
                     activityLog.scrollTop = activityLog.scrollHeight;
                  }
               }

               this.handleMessage(msg);
            };

            this.ws.onclose = (e) => {
               console.log('[Live] WebSocket closed', e.code, e.reason);
               if (e.code !== 1000 && e.code !== 1005) {
                  const activityLog = document.getElementById('activity-log');
                  if (activityLog) {
                     const entry = document.createElement('div');
                     entry.className = 'activity-entry';
                     entry.innerHTML = `<span class="activity-text error">Socket Closed [${e.code}]: ${e.reason || 'Unknown Protocol Error'}</span>`;
                     activityLog.appendChild(entry);
                     activityLog.scrollTop = activityLog.scrollHeight;
                  }
               }
               this.disconnect();
            };

         } catch (e) {
            console.error('[Live] Connection failed', e);
         }
      }

      disconnect() {
         this.isConnected = false;
         if (this.ws) {
            this.ws.close();
            this.ws = null;
         }
         if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
         }
         if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
         }
         if (this.onStateChange) this.onStateChange(false);
      }

      handleMessage(msg) {
         if (msg.setupComplete) {
            console.log('[Live] Setup complete received');
            this.startAudioCapture();
            return;
         }

         if (msg.serverContent && msg.serverContent.modelTurn) {
            const parts = msg.serverContent.modelTurn.parts;
            for (const part of parts) {
               if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                  this.playAudioChunk(part.inlineData.data);
               }
            }
         }

         if (msg.toolCall) {
            this.handleToolCall(msg.toolCall);
         }
      }

      playAudioChunk(base64) {
         if (this.playbackContext.state === 'suspended') {
            this.playbackContext.resume();
         }

         const binary = atob(base64);
         const pcm16 = new Int16Array(binary.length / 2);
         for (let i = 0; i < binary.length; i += 2) {
            pcm16[i / 2] = binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8);
         }

         const buffer = this.playbackContext.createBuffer(1, pcm16.length, 24000);
         const channelData = buffer.getChannelData(0);
         for (let i = 0; i < pcm16.length; i++) {
            channelData[i] = pcm16[i] / 32768.0;
         }

         const source = this.playbackContext.createBufferSource();
         source.buffer = buffer;
         source.connect(this.playbackContext.destination);

         if (this.nextPlaybackTime < this.playbackContext.currentTime) {
            this.nextPlaybackTime = this.playbackContext.currentTime;
         }
         source.start(this.nextPlaybackTime);
         this.nextPlaybackTime += buffer.duration;
      }

      async handleToolCall(toolCall) {
         const functionResponses = [];
         for (const fc of toolCall.functionCalls) {
            console.log(`[Live] Executing tool: ${fc.name}`);

            if (fc.name === 'start_camera') {
               const vision = window.JarvisVision;
               if (vision && (!vision.isActive || vision.isScreen)) {
                  const btn = document.getElementById('camera-button');
                  if (btn) btn.click();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Camera initialized' } } });
               continue;
            }
            if (fc.name === 'stop_camera') {
               const vision = window.JarvisVision;
               if (vision && vision.isActive && !vision.isScreen) {
                  const btn = document.getElementById('camera-button');
                  if (btn) btn.click();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Camera stopped' } } });
               continue;
            }
            if (fc.name === 'start_screen_capture') {
               const vision = window.JarvisVision;
               if (vision && (!vision.isActive || !vision.isScreen)) {
                  const btn = document.getElementById('screen-button');
                  if (btn) btn.click();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Screen capture initialized' } } });
               continue;
            }
            if (fc.name === 'stop_screen_capture') {
               const vision = window.JarvisVision;
               if (vision && vision.isActive && vision.isScreen) {
                  const btn = document.getElementById('screen-button');
                  if (btn) btn.click();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Screen capture stopped' } } });
               continue;
            }
            if (fc.name === 'take_snapshot') {
               const vision = window.JarvisVision;
               if (vision && vision.isActive) {
                  const snapshot = vision.takeSnapshot();
                  if (snapshot) {
                     this.sendImageFrame(snapshot);
                     functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Snapshot taken and frame sent successfully' } } });
                  } else {
                     functionResponses.push({ id: fc.id, name: fc.name, response: { result: { error: 'Failed to take snapshot' } } });
                  }
               } else {
                  functionResponses.push({ id: fc.id, name: fc.name, response: { result: { error: 'No camera or screen capture is currently active' } } });
               }
               continue;
            }

            // Flash UI tool capability
            const toolMap = {
               get_current_time: 'time', get_weather: 'weather', search_web: 'search',
               calculate: 'calculate', set_reminder: 'reminder', get_news: 'news',
               tell_joke: 'joke', system_status: 'system', open_website: 'website'
            };
            const toolKey = toolMap[fc.name];
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

            const res = await fetch('/api/tools/execute', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ name: fc.name, args: fc.args })
            });
            const result = await res.json();
            functionResponses.push({
               id: fc.id,
               name: fc.name,
               response: { result }
            });
         }

         this.ws.send(JSON.stringify({
            toolResponse: {
               functionResponses
            }
         }));
      }

      async startAudioCapture() {
         try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            await this.audioContext.audioWorklet.addModule('js/pcm-processor.js');

            this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.audioWorklet = new AudioWorkletNode(this.audioContext, 'pcm-processor');

            this.audioWorklet.port.onmessage = (e) => {
               if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                  const buffer = e.data;
                  const base64 = this.arrayBufferToBase64(buffer);
                  this.ws.send(JSON.stringify({
                     realtimeInput: {
                        audio: {
                           mimeType: 'audio/pcm;rate=16000',
                           data: base64
                        }
                     }
                  }));
               }
            };

            // Prevent feedback by muting output
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0;
            this.microphone.connect(this.audioWorklet);
            this.audioWorklet.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

         } catch (e) {
            console.error('[Live] Failed to capture audio', e);
         }
      }

      sendImageFrame(base64Jpeg) {
         if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
               realtimeInput: {
                  video: {
                     mimeType: 'image/jpeg',
                     data: base64Jpeg.replace(/^data:image\/\w+;base64,/, '')
                  }
               }
            }));
         }
      }

      sendClientContent(text) {
         if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
               clientContent: {
                  turns: [{
                     role: 'user',
                     parts: [{ text }]
                  }],
                  turnComplete: true
               }
            }));
         }
      }

      arrayBufferToBase64(buffer) {
         let binary = '';
         const bytes = new Uint8Array(buffer);
         for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
         }
         return btoa(binary);
      }
   }

   window.JarvisLive = new LiveAPI();
})();
