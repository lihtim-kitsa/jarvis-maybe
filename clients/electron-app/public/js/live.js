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

         // Push-to-talk state
         this.pushToTalk = false;
         this.pttActive = false;    // true while Space is held in PTT mode
         this.micMuted = false;     // true when audio streaming is paused

         this.onStateChange = null;

         this.alertSource = new EventSource(window.API_BASE + '/api/alerts');
         this.alertSource.onmessage = (e) => {
            const data = JSON.parse(e.data);
            console.log('[Live] Received System Alert:', data.message);
            
            if (data.message.startsWith('[REASONING]')) {
               try {
                  const payload = JSON.parse(data.message.replace('[REASONING] ', ''));
                  if (window.appendMessage) {
                     let html = `<strong>🤖 ORCHESTRATION PLAN:</strong> ${payload.plan}<br/><ul>`;
                     for (const step of payload.steps) {
                        html += `<li>⏳ ${step}</li>`;
                     }
                     html += `</ul>`;
                     window.appendMessage('system', html);
                  }
               } catch(err) {
                  console.error('Failed to parse reasoning payload', err);
               }
               // Do not echo the reasoning back to the model
               return;
            }

            if (data.message.startsWith('DRY RUN PENDING')) {
               // Render the payload to the UI
               if (window.appendMessage) {
                  window.appendMessage('system', '⚠️ ' + data.message);
               }
               // Set widget state to awaiting_auth
               if (window.setWidgetState) {
                  window.setWidgetState('awaiting_auth');
               }
            }

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
            const configRes = await fetch(window.API_BASE + '/api/config/client');
            const config = await configRes.json();

            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${config.apiKey}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
               this.isConnected = true;
               if (this.onStateChange) this.onStateChange(true);

               const setupMessage = {
                  setup: {
                     model: 'models/gemini-3.1-flash-live-preview',
                     systemInstruction: { parts: [{ text: config.systemInstruction }] },
                     tools: [{ functionDeclarations: config.tools }],
                     generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                           voiceConfig: {
                              prebuiltVoiceConfig: {
                                 voiceName: config.voice || "Aoede"
                              }
                           }
                        }
                     }
                  }
               };
               console.log("SENDING SETUP:", JSON.stringify(setupMessage));
               this.ws.send(JSON.stringify(setupMessage));

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
         if (this.visionInterval) {
            clearInterval(this.visionInterval);
            this.visionInterval = null;
         }
         if (this.onStateChange) this.onStateChange(false);
      }

      handleMessage(msg) {
         this.lastInteractionTime = Date.now();
         if (msg.setupComplete) {
            console.log('[Live] Setup complete received');
            this.startAudioCapture();

            // Start vision frame loop (send 1 frame per second if vision is active)
            this.lastInteractionTime = Date.now();
            this.visionInterval = setInterval(() => {
               if (window.JarvisVision && window.JarvisVision.isActive) {
                  // ATTENTION GATING: Auto-timeout after 5 minutes of silence/inactivity
                  if (Date.now() - this.lastInteractionTime > 5 * 60 * 1000) {
                     console.log('[Vision Gate] Pausing stream due to 5 minutes of inactivity.');
                     return;
                  }
                  
                  const base64Frame = window.JarvisVision.captureFrameBase64();
                  if (base64Frame && this.isConnected) {
                     this.ws.send(JSON.stringify({
                        realtimeInput: {
                           video: {
                              mimeType: 'image/jpeg',
                              data: base64Frame
                           }
                        }
                     }));
                  }
               }
            }, 1000);

            return;
         }

         if (msg.serverContent && msg.serverContent.modelTurn) {
            const parts = msg.serverContent.modelTurn.parts;
            let hasAudio = false;
            let textBuffer = '';

            for (const part of parts) {
               if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                  this.playAudioChunk(part.inlineData.data);
                  hasAudio = true;
               }
               if (part.text) {
                  textBuffer += part.text;
               }
            }

            if (textBuffer.trim().length > 0) {
               window.appendMessage('jarvis', textBuffer);
               this.showCaption(textBuffer);
            }
            if (hasAudio && window.setWidgetState) {
               window.setWidgetState('speaking');
               clearTimeout(this.idleTimeout);
               this.idleTimeout = setTimeout(() => {
                  window.setWidgetState('idle');
               }, 3000);
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
               if (vision) {
                  await vision.startCamera();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Camera initialized' } } });
               continue;
            }
            if (fc.name === 'display_subtitle') {
               if (fc.args && fc.args.text) {
                  window.appendMessage('jarvis', fc.args.text);
                  this.showCaption(fc.args.text);
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Subtitle displayed' } } });
               continue;
            }
            if (fc.name === 'stop_camera') {
               const vision = window.JarvisVision;
               if (vision) {
                  vision.stopCamera();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Camera stopped' } } });
               continue;
            }
            if (fc.name === 'start_screen_capture') {
               const vision = window.JarvisVision;
               if (vision) {
                  await vision.startScreenCapture();
               }
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'Screen capture initialized' } } });
               continue;
            }
            if (fc.name === 'stop_screen_capture') {
               const vision = window.JarvisVision;
               if (vision) {
                  vision.stopScreenCapture();
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

            if (fc.name === 'open_file') {
               const viewFile = window.viewFile || (() => { });
               viewFile(fc.args.path);
               functionResponses.push({ id: fc.id, name: fc.name, response: { result: { status: 'File opened in editor view' } } });
               continue;
            }

            // Flash UI tool capability
            const toolMap = {
               get_current_time: 'time', get_weather: 'weather', search_web: 'search',
               calculate: 'calculate', set_reminder: 'memory', list_reminders: 'memory', cancel_reminder: 'memory',
               remember: 'memory', recall: 'memory', get_news: 'search',
               tell_joke: 'system', system_status: 'system', open_website: 'computer',
               mouse_action: 'computer', keyboard_action: 'computer', get_screen_elements: 'computer',
               take_snapshot: 'vision', start_camera: 'vision', stop_camera: 'vision',
               start_screen_capture: 'vision', stop_screen_capture: 'vision'
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

            window.setWidgetState && window.setWidgetState('processing');
            const res = await fetch(window.API_BASE + '/api/tools/execute', {
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
               if (this.isConnected && this.ws.readyState === WebSocket.OPEN && !this.micMuted) {
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
                  window.setWidgetState && window.setWidgetState('listening');
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
            window.setWidgetState && window.setWidgetState('error');
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
            window.setWidgetState && window.setWidgetState('processing');
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

      showCaption(text) {
         const captionContainer = document.getElementById('caption-container');
         const captionText = document.getElementById('caption-text');
         if (captionContainer && captionText) {
            captionText.textContent = text;
            captionContainer.classList.remove('hidden');
            captionContainer.style.opacity = '1';

            clearTimeout(this.captionTimeout);
            this.captionTimeout = setTimeout(() => {
               captionContainer.style.opacity = '0';
               setTimeout(() => captionContainer.classList.add('hidden'), 400); // Wait for transition
            }, 5000); // Show caption for 5 seconds
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

      // ─── Push-to-Talk Controls ──────────────────────────────────────────

      togglePushToTalk() {
         this.pushToTalk = !this.pushToTalk;
         if (this.pushToTalk) {
            // Entering PTT mode: mute mic until Space is held
            this.micMuted = true;
            this.pttActive = false;
            this.updateMicIndicator();
            console.log('[Live] Push-to-Talk ENABLED — hold Space to talk');
         } else {
            // Leaving PTT mode: unmute mic, back to always-listening
            this.micMuted = false;
            this.pttActive = false;
            this.updateMicIndicator();
            console.log('[Live] Push-to-Talk DISABLED — always listening');
         }
      }

      handlePttKeyDown(e) {
         if (!this.pushToTalk || !this.isConnected) return;
         if (e.code === 'Space' && !e.repeat && !this.isInputFocused()) {
            e.preventDefault();
            this.pttActive = true;
            this.micMuted = false;
            this.updateMicIndicator();
         }
      }

      handlePttKeyUp(e) {
         if (!this.pushToTalk || !this.isConnected) return;
         if (e.code === 'Space' && !this.isInputFocused()) {
            e.preventDefault();
            this.pttActive = false;
            this.micMuted = true;
            this.updateMicIndicator();
         }
      }

      isInputFocused() {
         const active = document.activeElement;
         return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      }

      updateMicIndicator() {
         const indicator = document.getElementById('mic-mode-indicator');
         if (!indicator) return;

         if (this.pushToTalk) {
            indicator.classList.add('ptt-mode');
            indicator.classList.remove('hidden');
            if (this.pttActive) {
               indicator.textContent = '🎙️ TRANSMITTING';
               indicator.classList.add('transmitting');
            } else {
               indicator.textContent = '🔇 PUSH-TO-TALK';
               indicator.classList.remove('transmitting');
            }
         } else {
            indicator.classList.remove('ptt-mode', 'transmitting');
            indicator.classList.add('hidden');
         }

         // Also update the widget state label
         const stateLabel = document.getElementById('state-label');
         if (stateLabel && this.pushToTalk && !this.pttActive) {
            stateLabel.textContent = 'PTT';
         }
      }
   }

   const liveInstance = new LiveAPI();
   window.JarvisLive = liveInstance;

   // Global keyboard handlers for PTT
   document.addEventListener('keydown', (e) => {
      // Ctrl+M toggles push-to-talk mode
      if (e.ctrlKey && e.code === 'KeyM') {
         e.preventDefault();
         liveInstance.togglePushToTalk();
         return;
      }
      liveInstance.handlePttKeyDown(e);
   });

   document.addEventListener('keyup', (e) => {
      liveInstance.handlePttKeyUp(e);
   });
})();
