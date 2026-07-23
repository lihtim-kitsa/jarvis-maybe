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
}

export async function compile_latex(projectPath) {
  // Check if latexmk is installed, or try to run it.
  const command = `latexmk -pdf -interaction=nonstopmode -halt-on-error`;
  const res = await execPromise(command, projectPath);
  
  if (!res.error) {
    return { status: 'Compilation successful.' };
  }

  // Parse stderr or stdout for plain-language errors
  const output = res.stdout + '\n' + res.stderr;
  
  // Basic parsing for undefined references
  const undefRefMatches = [...output.matchAll(/LaTeX Warning: Reference `(.*?)' on page \d+ undefined on input line (\d+)/g)];
  const undefCiteMatches = [...output.matchAll(/LaTeX Warning: Citation `(.*?)' on page \d+ undefined on input line (\d+)/g)];
  
  const errors = [];
  
  undefRefMatches.forEach(m => errors.push(`Line ${m[2]}: Undefined reference to '${m[1]}'`));
  undefCiteMatches.forEach(m => errors.push(`Line ${m[2]}: Undefined citation '${m[1]}'`));
  
  const fatalErrorMatch = output.match(/! (.*?)\nl\.(\d+)/s);
  if (fatalErrorMatch) {
    errors.push(`Line ${fatalErrorMatch[2]}: Fatal error - ${fatalErrorMatch[1].trim()}`);
  }

  if (errors.length === 0) {
    // Return raw if we couldn't parse it well
    return { error: 'Compilation failed', details: output.substring(0, 1000) };
  }

  return { error: 'Compilation failed with the following errors:', details: errors.join('\n') };
}

export function parse_latex_structure(fileContent) {
  const sections = [];
  let currentSection = null;
  
  const lines = fileContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for \section or \subsection
    const secMatch = line.match(/\\(sub)?section\{([^}]+)\}/);
    if (secMatch) {
      if (currentSection) {
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }
      currentSection = {
        type: secMatch[1] ? 'subsection' : 'section',
        title: secMatch[2],
        startLine: i,
        endLine: -1,
        label: null,
        citations: [],
        references: []
      };
    }
    
    if (currentSection) {
      const labelMatch = line.match(/\\label\{([^}]+)\}/);
      if (labelMatch) currentSection.label = labelMatch[1];
      
      const citeMatches = [...line.matchAll(/\\cite\{([^}]+)\}/g)];
      citeMatches.forEach(m => currentSection.citations.push(...m[1].split(',')));
      
      const refMatches = [...line.matchAll(/\\ref\{([^}]+)\}/g)];
      refMatches.forEach(m => currentSection.references.push(m[1]));
    }
  }
  
  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }
  
  return sections;
}

export async function edit_latex_section({ file_path, section_label, content }) {
  try {
    const fullPath = path.resolve(process.cwd(), file_path);
    const fileContent = await fs.promises.readFile(fullPath, 'utf8');
    
    const sections = parse_latex_structure(fileContent);
    const targetSection = sections.find(s => s.label === section_label);
    
    if (!targetSection) {
      return { error: `Section with label '${section_label}' not found.` };
    }
    
    const lines = fileContent.split('\n');
    
    // Replace everything after the label (or section declaration if no label) until the end of the section
    const startReplaceIdx = (targetSection.label ? 
      lines.findIndex((l, i) => i >= targetSection.startLine && l.includes(`\\label{${section_label}}`)) : 
      targetSection.startLine) + 1;
      
    const endReplaceIdx = targetSection.endLine;
    
    lines.splice(startReplaceIdx, endReplaceIdx - startReplaceIdx + 1, ...content.split('\n'));
    
    await fs.promises.writeFile(fullPath, lines.join('\n'));
    
    return { status: `Successfully updated section '${section_label}'` };
  } catch (e) {
    return { error: `Failed to edit latex section: ${e.message}` };
  }
}
