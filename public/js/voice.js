/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. Voice Interface — voice.js
   Web Speech API — Speech Recognition & Text-to-Speech
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechSynthesis = window.speechSynthesis;

  class VoiceManager {
    constructor() {
      this.recognition = null;
      this.isListening = false;
      this.isSupported = !!SpeechRecognition;
      this.isSpeaking = false;
      this.selectedVoice = null;
      this.onResult = null;    // callback(transcript)
      this.onStart = null;     // callback()
      this.onEnd = null;       // callback()
      this.onSpeakStart = null;
      this.onSpeakEnd = null;

      if (this.isSupported) {
        this._initRecognition();
      }
      this._loadVoices();
    }

    _initRecognition() {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        if (this.onStart) this.onStart();
      };

      this.recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript && this.onResult) {
          this.onResult(finalTranscript.trim());
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('[Voice] Recognition error:', event.error);
        // Don't stop on 'no-speech' — user may still be thinking
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          this.stopListening();
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.onEnd) this.onEnd();
      };
    }

    _loadVoices() {
      const selectBestVoice = () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length === 0) return;

        // Priority: British English male → any English male → any English
        const priorities = [
          v => v.lang.startsWith('en-GB') && /male/i.test(v.name),
          v => v.lang.startsWith('en-GB'),
          v => v.lang.startsWith('en') && /male/i.test(v.name),
          v => v.lang.startsWith('en') && /daniel|david|james|george|mark/i.test(v.name),
          v => v.lang.startsWith('en')
        ];

        for (const test of priorities) {
          const found = voices.find(test);
          if (found) {
            this.selectedVoice = found;
            console.log('[Voice] Selected voice:', found.name, found.lang);
            return;
          }
        }
        // Fallback to first voice
        this.selectedVoice = voices[0];
      };

      selectBestVoice();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = selectBestVoice;
      }
    }

    startListening() {
      if (!this.isSupported) {
        console.warn('[Voice] Speech recognition not supported');
        return false;
      }
      if (this.isListening) return true;

      try {
        this.recognition.start();
        return true;
      } catch (e) {
        console.error('[Voice] Failed to start recognition:', e);
        return false;
      }
    }

    stopListening() {
      if (!this.isSupported || !this.isListening) return;
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
    }

    speak(text) {
      if (!speechSynthesis) return;

      // Cancel any current speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 0.95;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.onSpeakStart) this.onSpeakStart();
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (this.onSpeakEnd) this.onSpeakEnd();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        if (event.error !== 'interrupted') {
          console.warn('[Voice] Speech error:', event.error);
        }
        if (this.onSpeakEnd) this.onSpeakEnd();
      };

      speechSynthesis.speak(utterance);
    }

    stopSpeaking() {
      if (speechSynthesis) {
        speechSynthesis.cancel();
        this.isSpeaking = false;
      }
    }
  }

  window.JarvisVoice = new VoiceManager();
})();
