const chatPopup = document.getElementById('chat-popup');
const chatClose = document.getElementById('chat-close');
const chatMessages = document.getElementById('chat-messages');
const activityLog = document.getElementById('activity-log');
const chatInput = document.getElementById('chat-input');
const micButton = document.getElementById('mic-button');

// Close button
chatClose.addEventListener('click', () => {
  chatPopup.classList.add('hidden');
});

window.showChatPopup = function() {
  chatPopup.classList.remove('hidden');
};

// Global functions for other modules to use
window.appendMessage = function(role, text) {
  window.showChatPopup();
  const div = document.createElement('div');
  div.className = `message ${role}-message`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

window.appendLog = function(text) {
  window.showChatPopup();
  const entry = document.createElement('div');
  entry.className = 'activity-entry';
  
  const time = document.createElement('span');
  time.className = 'activity-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ';
  
  const msg = document.createElement('span');
  msg.className = 'activity-text';
  msg.textContent = text;
  
  entry.appendChild(time);
  entry.appendChild(msg);
  
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;
};

// Handle Enter key for text input
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    const text = chatInput.value.trim();
    chatInput.value = '';
    window.appendMessage('user', text);
    
    // Trigger global text send function (defined in live.js)
    if (window.sendTextMessage) {
      window.sendTextMessage(text);
    }
  }
});
