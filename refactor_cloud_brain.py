import re
import os

filepath = r'c:\Users\astik\OneDrive\Desktop\JARVIS\cloud-brain\server.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add WS import
content = content.replace("import express from 'express';", "import express from 'express';\nimport { WebSocketServer } from 'ws';")

# 2. Remove dev_tools and clipboardy imports
content = re.sub(r"import clipboardy from 'clipboardy';\n", "", content)
content = re.sub(r"import \{ gitStatus, gitDiff, gitCommit, runPython, searchCodebase, compile_latex, edit_latex_section \} from '\./dev_tools\.js';\n", "", content)

# 3. Inject WS Logic and forwardToLocalHands after Express setup
ws_logic = """
let localHandsWs = null;
const pendingToolCalls = new Map();
let toolCallIdCounter = 1;

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
    const id = toolCallIdCounter++;
    pendingToolCalls.set(id, resolve);
    localHandsWs.send(JSON.stringify({ type: 'tool_call', id, tool: toolName, args }));
    setTimeout(() => {
      if (pendingToolCalls.has(id)) {
        pendingToolCalls.delete(id);
        resolve({ error: 'Tool execution timed out.' });
      }
    }, 60000);
  });
}
"""
content = content.replace("const app = express();", "const app = express();\n" + ws_logic)

# 4. Bind wss to the server instance
listen_logic = """const server = app.listen(PORT, () => {"""
content = content.replace("app.listen(PORT, () => {", listen_logic)

upgrade_logic = """  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/local-hands') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});"""
content = content.replace("""  });\n});""", upgrade_logic)

# 5. Redefine toolExecutors to use forwardToLocalHands for laptop-only tools
# We'll just replace the whole toolExecutors block up to "const JARVIS_SYSTEM_PROMPT"
executor_block_start = content.find("const toolExecutors = {")
executor_block_end = content.find("const JARVIS_SYSTEM_PROMPT =")

old_executors = content[executor_block_start:executor_block_end]

# We don't want to replace everything, just map the local hands tools to forwardToLocalHands
# Let's write a regex that replaces the specific executor definitions
tools_to_forward = [
    ("compile_latex", "compile_latex"),
    ("edit_latex_section", "executeEditLatexSection"),
    ("get_clipboard", "executeGetClipboard"),
    ("set_clipboard", "executeSetClipboard"),
    ("list_directory", "executeListDirectory"),
    ("read_file", "executeReadFile"),
    ("write_file", "executeWriteFile"),
    ("run_terminal_command", "executeRunTerminalCommand"),
    ("confirm_action", "executeConfirmAction"),
    ("git_status", "gitStatus"),
    ("git_diff", "gitDiff"),
    ("git_commit", "executeGitCommit"),
    ("run_python", "(args) => runPython(args.code)"),
    ("search_codebase", "(args) => searchCodebase(args.query, args.path || '.')"),
    ("open_application", "executeOpenApplication"),
    ("watch_log", "executeWatchLog"),
    ("mouse_action", "executeComputerControl"),
    ("keyboard_action", "executeComputerControl"),
    ("get_screen_elements", "() => executeComputerControl({ action: 'get_screen_elements' })"),
    ("take_snapshot", "executeTakeSnapshot")
]

for tool, old_val in tools_to_forward:
    content = content.replace(f"  {tool}: {old_val},", f"  {tool}: (args) => forwardToLocalHands('{tool}', args),")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("cloud-brain/server.js refactored successfully.")
