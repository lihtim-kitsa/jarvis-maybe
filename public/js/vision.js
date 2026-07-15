const visionPopup = document.getElementById('vision-popup');
const visionClose = document.getElementById('vision-close');
const videoElement = document.getElementById('vision-video');
const snapshotContainer = document.getElementById('vision-snapshot-container');
const snapshotImg = document.getElementById('vision-snapshot');
const statusText = document.getElementById('vision-status');

const camBtn = document.getElementById('camera-button');
const screenBtn = document.getElementById('screen-button');

let currentStream = null;
let currentMode = null;

visionClose.addEventListener('click', () => {
  stopVision();
  visionPopup.classList.add('hidden');
});

function showVisionPopup() {
  visionPopup.classList.remove('hidden');
}

async function startVision(mode) {
  try {
    if (currentStream) stopVision();
    
    showVisionPopup();
    statusText.textContent = `INITIALIZING ${mode.toUpperCase()}...`;
    
    if (mode === 'camera') {
      currentStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } else {
      currentStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    }
    
    videoElement.srcObject = currentStream;
    currentMode = mode;
    snapshotContainer.classList.add('hidden');
    statusText.textContent = `${mode.toUpperCase()} ACTIVE`;
    
    // Update button states
    camBtn.classList.toggle('active', mode === 'camera');
    screenBtn.classList.toggle('active', mode === 'screen');
    
    window.appendLog(`Vision system online: ${mode}`);
    return true;
  } catch (err) {
    statusText.textContent = 'ERROR';
    window.appendLog(`Vision error: ${err.message}`);
    return false;
  }
}

function stopVision() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  videoElement.srcObject = null;
  currentMode = null;
  camBtn.classList.remove('active');
  screenBtn.classList.remove('active');
  statusText.textContent = 'OFFLINE';
}

camBtn.addEventListener('click', () => {
  if (currentMode === 'camera') stopVision();
  else startVision('camera');
});

screenBtn.addEventListener('click', () => {
  if (currentMode === 'screen') stopVision();
  else startVision('screen');
});

// Exposed globally for JARVIS
window.JarvisVision = {
  get isActive() { return currentStream !== null; },
  get isScreen() { return currentMode === 'screen'; },
  startCamera: async () => { if (currentMode !== 'camera') return await startVision('camera'); return true; },
  stopCamera: () => { if (currentMode === 'camera') stopVision(); },
  startScreenCapture: async () => { if (currentMode !== 'screen') return await startVision('screen'); return true; },
  stopScreenCapture: () => { if (currentMode === 'screen') stopVision(); },
  takeSnapshot: function() {
    if (!currentStream) return null;
    showVisionPopup();
    
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    snapshotImg.src = dataUrl;
    snapshotContainer.classList.remove('hidden');
    statusText.textContent = 'SNAPSHOT CAPTURED';
    
    setTimeout(() => {
      snapshotContainer.classList.add('hidden');
      statusText.textContent = `${currentMode ? currentMode.toUpperCase() : ''} ACTIVE`;
    }, 1000);
    
    return dataUrl.split(',')[1];
  }
};

window.isVisionActive = () => currentStream !== null;
window.startCamera = () => startVision('camera');
window.startScreen = () => startVision('screen');
window.stopVision = stopVision;
