import os
import re

filepath = r'c:\Users\astik\OneDrive\Desktop\JARVIS\cloud-brain\server.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Setup imports and server
if "import http from 'http';" not in content:
    content = content.replace("import express from 'express';", "import express from 'express';\nimport http from 'http';\nimport { WebSocketServer } from 'ws';")

if "const server = http.createServer(app);" not in content:
    content = content.replace("const app = express();", "const app = express();\nconst server = http.createServer(app);")

# 2. Add WebSocket setup for local-hands at the top
ws_setup = """
let localHandsWs = null;
const pendingToolCalls = new Map();

const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
  console.log('[Cloud Brain] Local Hands connected!');
  localHandsWs = ws;
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'tool_result') {
        const resolve = pendingToolCalls.get(data.id);
        if (resolve) {
          resolve(data.result);
          pendingToolCalls.delete(data.id);
        }
      }
    } catch (e) {
      console.error('Failed to parse WS message:', e);
    }
  });
  ws.on('close', () => {
    console.log('[Cloud Brain] Local Hands disconnected.');
    localHandsWs = null;
  });
});

async function forwardToLocalHands(toolName, args = {}) {
  if (!localHandsWs || localHandsWs.readyState !== 1) {
    return { error: 'No Local Hands instance is currently connected.' };
  }
  return new Promise((resolve) => {
    const id = Math.random().toString(36).substring(7);
    pendingToolCalls.set(id, resolve);
    localHandsWs.send(JSON.stringify({ type: 'tool_call', id, tool: toolName, args }));
    
    // Timeout after 60s
    setTimeout(() => {
      if (pendingToolCalls.has(id)) {
        pendingToolCalls.delete(id);
        resolve({ error: `Tool call ${toolName} timed out.` });
      }
    }, 60000);
  });
}
"""

if "function forwardToLocalHands" not in content:
    content = content.replace("const app = express();\nconst server = http.createServer(app);", "const app = express();\nconst server = http.createServer(app);\n" + ws_setup)

# 3. Add WebRTC Signaling at the end
upgrade_logic = """
const signalingWss = new WebSocketServer({ noServer: true });
const clients = new Set();

signalingWss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[Signaling] Client connected. Total:', clients.size);
  ws.on('message', (message) => {
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) {
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
    content = content.replace("app.listen(PORT", upgrade_logic + "\nserver.listen(PORT")

# 4. Modify toolExecutors dictionary to forward local actions
# Find the start of the toolExecutors dictionary and replace exactly what needs to be replaced.
# We will just parse out the existing values and replace them.
import textwrap

replacements = {
    'compile_latex: executeCompileLatex': 'compile_latex: (args) => forwardToLocalHands("compile_latex", args)',
    'edit_latex_section: executeEditLatexSection': 'edit_latex_section: (args) => forwardToLocalHands("edit_latex_section", args)',
    'get_clipboard: executeGetClipboard': 'get_clipboard: (args) => forwardToLocalHands("get_clipboard", args)',
    'set_clipboard: executeSetClipboard': 'set_clipboard: (args) => forwardToLocalHands("set_clipboard", args)',
    'list_directory: executeListDirectory': 'list_directory: (args) => forwardToLocalHands("list_directory", args)',
    'read_file: executeReadFile': 'read_file: (args) => forwardToLocalHands("read_file", args)',
    'write_file: executeWriteFile': 'write_file: (args) => forwardToLocalHands("write_file", args)',
    'run_terminal_command: executeRunTerminalCommand': 'run_terminal_command: (args) => forwardToLocalHands("run_terminal_command", args)',
    'confirm_action: executeConfirmAction': 'confirm_action: (args) => forwardToLocalHands("confirm_action", args)',
    'git_status: executeGitStatus': 'git_status: (args) => forwardToLocalHands("git_status", args)',
    'git_diff: executeGitDiff': 'git_diff: (args) => forwardToLocalHands("git_diff", args)',
    'git_commit: executeGitCommit': 'git_commit: (args) => forwardToLocalHands("git_commit", args)',
    'run_python: executeRunPython': 'run_python: (args) => forwardToLocalHands("run_python", args)',
    'search_codebase: executeSearchCodebase': 'search_codebase: (args) => forwardToLocalHands("search_codebase", args)',
    'open_application: executeOpenApplication': 'open_application: (args) => forwardToLocalHands("open_application", args)',
    'watch_log: executeWatchLog': 'watch_log: (args) => forwardToLocalHands("watch_log", args)',
    'mouse_action: executeComputerControl': 'mouse_action: (args) => forwardToLocalHands("mouse_action", args)',
    'keyboard_action: executeComputerControl': 'keyboard_action: (args) => forwardToLocalHands("keyboard_action", args)',
    'get_screen_elements: executeComputerControl': 'get_screen_elements: (args) => forwardToLocalHands("get_screen_elements", args)'
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactored cleanly.")
