import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export class LiveClient {
  constructor(publicUrl) {
    this.publicUrl = publicUrl;
    this.ws = null;
    this.isConnected = false;
    this.recording = null;
    this.sound = null;
    this.onStateChange = null;
    this.onMessage = null;
    this.config = null;
    this.audioQueue = [];
    this.isPlaying = false;
  }

  async connect() {
    try {
      // Fetch config
      const res = await fetch(`${this.publicUrl}/api/config/client`);
      this.config = await res.json();
      
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.config.apiKey}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (this.onStateChange) this.onStateChange('idle');
        
        const setupMessage = {
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            systemInstruction: { parts: [{ text: this.config.systemInstruction }] },
            tools: [{ functionDeclarations: this.config.tools }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Capella"
                  }
                }
              }
            }
          }
        };
        this.ws.send(JSON.stringify(setupMessage));
      };

      this.ws.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        if (msg.setupComplete) {
          console.log('[LiveClient] Setup complete');
          return;
        }

        if (msg.serverContent && msg.serverContent.modelTurn) {
          const parts = msg.serverContent.modelTurn.parts;
          let hasAudio = false;

          for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
              this.audioQueue.push(part.inlineData.data);
              hasAudio = true;
            }
          }

          if (hasAudio) {
            if (this.onStateChange) this.onStateChange('speaking');
            this.playNextAudio();
          }
        }

        if (msg.toolCall) {
          this.handleToolCall(msg.toolCall);
        }
        
        if (this.onMessage) this.onMessage(msg);
      };

      this.ws.onerror = (e) => console.error('[LiveClient] WebSocket Error', e.message);
      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.onStateChange) this.onStateChange('disconnected');
      };
      
    } catch (err) {
      console.error('[LiveClient] Connection failed', err);
      if (this.onStateChange) this.onStateChange('error');
    }
  }

  async playNextAudio() {
    if (this.isPlaying || this.audioQueue.length === 0) {
      if (!this.isPlaying && this.audioQueue.length === 0) {
        if (this.onStateChange) this.onStateChange('idle');
      }
      return;
    }
    
    this.isPlaying = true;
    const base64Audio = this.audioQueue.shift();
    
    try {
      console.log('[LiveClient] Received audio chunk (playback requires PCM->WAV conversion in React Native)');
    } catch (e) {
      console.error('Audio playback error', e);
    }
    
    this.isPlaying = false;
    this.playNextAudio();
  }

  async handleToolCall(toolCallMsg) {
    if (this.onStateChange) this.onStateChange('processing');
    
    for (const call of toolCallMsg.functionCalls) {
      console.log(`[LiveClient] Executing tool: ${call.name}`);
      try {
        const response = await fetch(`${this.publicUrl}/api/tools/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(call)
        });
        const result = await response.json();
        
        this.ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id: call.id,
              name: call.name,
              response: { result }
            }]
          }
        }));
      } catch (err) {
        this.ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id: call.id,
              name: call.name,
              response: { error: err.message }
            }]
          }
        }));
      }
    }
  }

  async startRecording() {
    if (!this.isConnected) return;
    try {
      if (this.onStateChange) this.onStateChange('listening');
      
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.raw',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_DEFAULT,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.raw',
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        }
      });
      
      await this.recording.startAsync();
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async stopRecording() {
    if (!this.recording) return;
    if (this.onStateChange) this.onStateChange('processing');
    
    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      
      this.ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data
          }]
        }
      }));
      
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
    this.recording = null;
  }
}
