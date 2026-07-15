import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function execPromise(command, cwd = __dirname) {
  return new Promise((resolve) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, error: error ? error.message : null });
    });
  });
}

export async function gitStatus() {
  const res = await execPromise('git status');
  return res.error ? { error: res.error } : { status: res.stdout };
}

export async function gitDiff() {
  const res = await execPromise('git diff');
  return res.error ? { error: res.error } : { diff: res.stdout || 'No unstaged changes.' };
}

export async function gitCommit(message) {
  const res = await execPromise(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  return res.error ? { error: res.error, stderr: res.stderr } : { result: res.stdout };
}

export async function runPython(code) {
  const tmpPath = path.join(os.tmpdir(), `jarvis_temp_${Date.now()}.py`);
  try {
    await fs.promises.writeFile(tmpPath, code, 'utf8');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const res = await execPromise(`${pythonCmd} "${tmpPath}"`);
    await fs.promises.unlink(tmpPath).catch(() => {});
    return res.error ? { error: res.error, stderr: res.stderr } : { output: res.stdout };
  } catch (e) {
    return { error: `Failed to execute python: ${e.message}` };
  }
}

export async function searchCodebase(query, searchPath = '.') {
  // Use git grep if possible, it's fast and cross-platform for git repos
  const res = await execPromise(`git grep -n -i "${query.replace(/"/g, '\\"')}" ${searchPath}`);
  if (res.error) {
    // Fallback if not a git repo or no match
    return { error: res.error, note: 'Search failed or no matches found.' };
  }
  
  const matches = res.stdout.split('\n').filter(Boolean);
  if (matches.length > 50) {
    return { results: matches.slice(0, 50).join('\n') + '\n... (truncated)' };
  }
  return { results: res.stdout || 'No matches found.' };
}
