class WebRTCManager {
    constructor(deviceName, remoteVideoElementId) {
        this.deviceName = deviceName;
        this.remoteVideoElement = document.getElementById(remoteVideoElementId);
        this.signalingWs = null;
        this.peerConnection = null;
        this.localStream = null;
        this.isConnected = false;
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
    }

    async initSignaling() {
        const apiBase = window.API_BASE || 'http://localhost:3000';
        
        try {
            const res = await fetch(`${apiBase}/api/config/webrtc`);
            if (res.ok) {
                const data = await res.json();
                if (data.iceServers) this.configuration.iceServers = data.iceServers;
            }
        } catch (e) {
            console.warn('[WebRTC] Failed to fetch ICE servers, using defaults');
        }

        const wsUrl = apiBase.replace('http', 'ws') + '/signal';
        this.signalingWs = new WebSocket(wsUrl);

        this.signalingWs.onopen = () => {
            console.log(`[WebRTC] Signaling connected as ${this.deviceName}`);
            this.sendSignal({ type: 'presence', device: this.deviceName });
        };

        this.signalingWs.onmessage = async (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (e) { return; }

            if (message.type === 'presence') {
                console.log(`[WebRTC] Presence detected: ${message.device}`);
                // If a new device comes online, let's initiate a call if we are the laptop
                if (this.deviceName === 'laptop' && message.device === 'mobile') {
                    await this.startCall();
                }
            } else if (message.type === 'offer') {
                console.log('[WebRTC] Received offer');
                await this.handleOffer(message.offer);
            } else if (message.type === 'answer') {
                console.log('[WebRTC] Received answer');
                await this.handleAnswer(message.answer);
            } else if (message.type === 'candidate') {
                console.log('[WebRTC] Received ICE candidate');
                await this.handleCandidate(message.candidate);
            }
        };

        this.signalingWs.onclose = () => {
            console.log('[WebRTC] Signaling disconnected');
        };
    }

    sendSignal(message) {
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify(message));
        }
    }

    setupPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({ type: 'candidate', candidate: event.candidate });
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTC] Remote stream received');
            if (this.remoteVideoElement && event.streams[0]) {
                this.remoteVideoElement.srcObject = event.streams[0];
            }
        };

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
    }

    async startLocalStream(useScreen = true) {
        try {
            if (useScreen) {
                // Electron's setDisplayMediaRequestHandler handles this
                this.localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            } else {
                this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            }
            console.log('[WebRTC] Local stream started');
        } catch (err) {
            console.error('[WebRTC] Failed to get local stream', err);
        }
    }

    async startCall() {
        if (!this.peerConnection) this.setupPeerConnection();

        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.sendSignal({ type: 'offer', offer });
        } catch (e) {
            console.error('[WebRTC] Failed to start call', e);
        }
    }

    async handleOffer(offer) {
        if (!this.peerConnection) this.setupPeerConnection();

        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.sendSignal({ type: 'answer', answer });
        } catch (e) {
            console.error('[WebRTC] Failed to handle offer', e);
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection.signalingState === 'stable') {
                console.warn('[WebRTC] Ignored answer because signaling state is already stable');
                return;
            }
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
            console.error('[WebRTC] Failed to handle answer', e);
        }
    }

    async handleCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('[WebRTC] Failed to add ICE candidate', e);
        }
    }
}

window.WebRTCManager = WebRTCManager;
