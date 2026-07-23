import os

filepath = r'c:\Users\astik\OneDrive\Desktop\JARVIS\cloud-brain\server.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add http import if not present
if "import http from 'http';" not in content:
    content = content.replace("import express from 'express';", "import express from 'express';\nimport http from 'http';")

# 2. Add const server = http.createServer(app);
if "const server = http.createServer(app);" not in content:
    content = content.replace("const app = express();", "const app = express();\nconst server = http.createServer(app);")

# 3. Remove existing server.on('upgrade') blocks using string replacement or regex
import re
content = re.sub(r"server\.on\('upgrade',\s*\(request, socket, head\)\s*=>\s*\{[\s\S]*?\}\);", "", content)

# 4. Change const server = app.listen(...) to server.listen(...) at the bottom
content = content.replace("const server = app.listen(PORT", "server.listen(PORT")

# 5. Insert new Upgrade Handler right before the listen call
upgrade_handler = """
// ─── WebRTC Signaling WebSocket ──────────────────────────────────────────────
import { WebSocketServer as WSS2 } from 'ws';
export const signalingWss = new WSS2({ noServer: true });
const clients = new Set();

signalingWss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[Signaling] Client connected. Total:', clients.size);
  
  ws.on('message', (message) => {
    // Broadcast to all other clients
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) { // 1 = OPEN
        client.send(message.toString());
      }
    }
  });
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('[Signaling] Client disconnected. Total:', clients.size);
  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/local-hands') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (request.url === '/signal') {
    signalingWss.handleUpgrade(request, socket, head, (ws) => {
      signalingWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
"""

if "signalingWss" not in content:
    content = content.replace("server.listen(PORT", upgrade_handler + "\nserver.listen(PORT")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("cloud-brain/server.js fixed and upgraded with signaling.")
