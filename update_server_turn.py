import os
filepath = r'c:\Users\astik\OneDrive\Desktop\JARVIS\cloud-brain\server.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoint = """
app.get('/api/config/webrtc', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' }
  ];
  
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD
    });
  }
  
  res.json({ iceServers });
});
"""

if "/api/config/webrtc" not in content:
    content = content.replace("app.get('/api/config/client'", new_endpoint + "\napp.get('/api/config/client'")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated server.js')
else:
    print('Already updated')
