import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, spawn } from 'child_process';
import clipboardy from 'clipboardy';
import { activeWindow } from 'active-win';
import { gitStatus, gitDiff, gitCommit, runPython, searchCodebase, compile_latex, edit_latex_section } from './dev_tools.js';
import { draftCode } from './drafting_pipeline.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CLOUD_BRAIN_URL = process.env.CLOUD_BRAIN_URL || 'ws://localhost:3000/local-hands';
const CLOUD_BRAIN_HTTP = CLOUD_BRAIN_URL.replace('ws://', 'http://').replace('wss://', 'https://').replace('/local-hands', '');
const RECONNECT_INTERVAL = 5000;

function connect() {
  console.log(`Connecting to Cloud Brain at ${CLOUD_BRAIN_URL}...`);
  const ws = new WebSocket(CLOUD_BRAIN_URL);

  ws.on('open', () => {
    console.log('Connected to Cloud Brain.');
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'tool_call') {
        console.log(`Executing forwarded tool: ${data.tool}`);
        const result = await executeTool(data.tool, data.args);
        ws.send(JSON.stringify({
          type: 'tool_result',
          id: data.id,
          result
        }));
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected. Reconnecting in 5 seconds...');
    setTimeout(connect, RECONNECT_INTERVAL);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

// Implement local execution functions
async function executeComputerControl(args) {
  return new Promise((resolve) => {
    // Assuming root JARVIS is still the parent directory containing .venv
    const pythonExe = process.platform === 'win32' 
      ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', '.venv', 'bin', 'python');
      
    const cmd = fs.existsSync(pythonExe) ? pythonExe : 'python';
    
    const pyProcess = spawn(cmd, [path.join(__dirname, 'computer_control.py')]);
    
    let stdoutData = '';
    let stderrData = '';
    
    pyProcess.stdout.on('data', (data) => { stdoutData += data.toString(); });
    pyProcess.stderr.on('data', (data) => { stderrData += data.toString(); });
    
    pyProcess.on('close', (code) => {
      try {
        if (stdoutData) {
          resolve(JSON.parse(stdoutData));
        } else {
          resolve({ error: `Python script failed with code ${code}`, stderr: stderrData });
        }
      } catch (e) {
        resolve({ error: 'Failed to parse python output', output: stdoutData, stderr: stderrData });
      }
    });
    
    pyProcess.stdin.write(JSON.stringify(args));
    pyProcess.stdin.end();
  });
}

function executeListDirectory(args) {
  try {
    const p = path.resolve(process.cwd(), args.path || '.');
    if (!fs.existsSync(p)) return { error: `Path does not exist: ${p}` };
    const items = fs.readdirSync(p, { withFileTypes: true });
    return {
      path: p,
      items: items.map(i => ({ name: i.name, isDirectory: i.isDirectory() }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

function executeReadFile(args) {
  try {
    const p = path.resolve(process.cwd(), args.path);
    if (!fs.existsSync(p)) return { error: `File not found: ${p}` };
    const content = fs.readFileSync(p, 'utf8');
    return { path: p, content: content.substring(0, 10000) };
  } catch (e) {
    return { error: e.message };
  }
}

function executeWriteFile(args) {
  try {
    const p = path.resolve(process.cwd(), args.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, args.content, 'utf8');
    return { status: `Successfully wrote to ${p}` };
  } catch (e) {
    return { error: e.message };
  }
}

function executeRunTerminalCommand(args) {
  return new Promise((resolve) => {
    exec(args.command, (error, stdout, stderr) => {
      resolve({ stdout, stderr, error: error ? error.message : null });
    });
  });
}

function executeConfirmAction(args) {
  return { error: 'confirm_action should be handled on the Cloud Brain before forwarding!' };
}

function executeOpenApplication(args) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const psScript = `
$appName = "${args.appName}"
$app = Get-StartApps | Where-Object { $_.Name -match $appName } | Select-Object -First 1
if ($app) {
    Start-Process -FilePath "explorer.exe" -ArgumentList "shell:AppsFolder\\$($app.AppID)"
} else {
    try {
        Start-Process $appName -ErrorAction Stop
    } catch {
        Write-Error "Application not found";
        exit 1;
    }
}
`;
      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
      const command = `powershell -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encodedCommand}`;
      exec(command, (error) => {
        if (error) resolve({ error: `Failed to open application: ${error.message}` });
        else resolve({ status: `Application ${args.appName} opened successfully` });
      });
    } else {
      const command = `open "${args.appName}"`;
      exec(command, (error) => {
        if (error) resolve({ error: `Failed to open application: ${error.message}` });
        else resolve({ status: `Application ${args.appName} opened successfully` });
      });
    }
  });
}

async function executeTool(toolName, args) {
  try {
    switch (toolName) {
      case 'compile_latex': return await compile_latex(args.projectPath);
      case 'edit_latex_section': return await edit_latex_section(args);
      case 'get_clipboard': return { clipboard: await clipboardy.read() };
      case 'set_clipboard': await clipboardy.write(args.text); return { status: 'Clipboard updated.' };
      case 'list_directory': return executeListDirectory(args);
      case 'read_file': return executeReadFile(args);
      case 'write_file': return executeWriteFile(args);
      case 'run_terminal_command': return await executeRunTerminalCommand(args);
      case 'confirm_action': return executeConfirmAction(args);
      case 'git_status': return await gitStatus();
      case 'git_diff': return await gitDiff();
      case 'git_commit': return await gitCommit(args.message);
      case 'run_python': return await runPython(args.code);
      case 'search_codebase': return await searchCodebase(args.query, args.path || '.');
      case 'draft_code': return await draftCode(args.prompt, args.outputFilePath);
      case 'open_application': return await executeOpenApplication(args);
      case 'mouse_action': return await executeComputerControl(args);
      case 'keyboard_action': return await executeComputerControl(args);
      case 'get_screen_elements': return await executeComputerControl({ action: 'get_screen_elements' });
      case 'take_snapshot': return await executeComputerControl({ action: 'take_snapshot' });
      case 'lock_pc': return await executeComputerControl({ action: 'lock_pc' });
      case 'start_dictation': return await executeComputerControl({ action: 'start_dictation' });
      case 'media_control': return await executeComputerControl({ action: 'media_control', media_action: args.action });
      case 'read_selected_text': return await executeComputerControl({ action: 'read_selected_text' });
      // TODO: Spotify auth/opening and watch log
      default:
        return { error: `Unknown tool requested by Cloud Brain: ${toolName}` };
    }
  } catch (error) {
    return { error: `Tool execution failed: ${error.message}` };
  }
}

connect();

let lastFocusHash = '';

async function trackFocus() {
  try {
    const win = await activeWindow();
    if (win) {
      const focusContext = {
        title: win.title,
        owner: win.owner.name,
        bounds: win.bounds,
      };
      
      const hash = focusContext.title + focusContext.owner;
      if (hash !== lastFocusHash) {
        lastFocusHash = hash;
        
        // Push to Cloud Brain
        await fetch(`${CLOUD_BRAIN_HTTP}/api/focus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: focusContext })
        });
        console.log(`[Focus Tracker] Updated focus to: ${focusContext.title} (${focusContext.owner})`);
      }
    }
  } catch (err) {
    // Ignore transient errors
  }
  
  setTimeout(trackFocus, 2000); // Check every 2 seconds
}

trackFocus();
