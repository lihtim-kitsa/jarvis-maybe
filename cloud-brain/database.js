import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'memory.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    embedding TEXT NOT NULL, -- Stored as JSON array
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT NOT NULL,
    due_time DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS papers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    authors TEXT,
    arxiv_id TEXT,
    abstract TEXT NOT NULL,
    embedding TEXT NOT NULL, -- Stored as JSON array
    date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
    tags TEXT,
    full_text_path TEXT
  );

  CREATE TABLE IF NOT EXISTS paper_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    embedding TEXT NOT NULL, -- Stored as JSON array
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(paper_id) REFERENCES papers(id)
  );

  CREATE TABLE IF NOT EXISTS error_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool TEXT NOT NULL,
    args TEXT,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_trail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Vector Math ────────────────────────────────────────────────────────────

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Memory Functions ───────────────────────────────────────────────────────

export function addMemory(text, embeddingArray) {
  const stmt = db.prepare('INSERT INTO memory (text, embedding) VALUES (?, ?)');
  stmt.run(text, JSON.stringify(embeddingArray));
}

export function searchMemory(queryEmbedding, options = {}) {
  const { limit = 5, includeGeneral = true, includePapers = true, includeNotes = true } = options;
  let allEntries = [];

  if (includeGeneral) {
    const rows = db.prepare('SELECT id, text, embedding, timestamp FROM memory').all();
    allEntries.push(...rows.map(r => ({ ...r, type: 'general' })));
  }

  if (includePapers) {
    const rows = db.prepare('SELECT id, title, authors, abstract, embedding, date_added as timestamp FROM papers').all();
    allEntries.push(...rows.map(r => ({
      ...r,
      text: `Title: ${r.title}\nAuthors: ${r.authors}\nAbstract: ${r.abstract}`,
      type: 'paper'
    })));
  }

  if (includeNotes) {
    const rows = db.prepare('SELECT id, paper_id, note as text, embedding, timestamp FROM paper_notes').all();
    allEntries.push(...rows.map(r => ({ ...r, type: 'note' })));
  }
  
  // Calculate similarity for all entries
  const results = allEntries.map(row => {
    const memEmbedding = JSON.parse(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, memEmbedding);
    return {
      id: row.id,
      type: row.type,
      text: row.text,
      similarity: similarity,
      timestamp: row.timestamp,
      ...(row.type === 'paper' && { title: row.title, authors: row.authors, abstract: row.abstract }),
      ...(row.type === 'note' && { paper_id: row.paper_id })
    };
  });
  
  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Return top N matches that meet a basic threshold (e.g., > 0.5)
  return results.filter(r => r.similarity > 0.5).slice(0, limit);
}

// ─── Research Memory Functions ──────────────────────────────────────────────

export function addPaper({ title, authors, arxiv_id, abstract, embeddingArray, tags, full_text_path }) {
  const stmt = db.prepare('INSERT INTO papers (title, authors, arxiv_id, abstract, embedding, tags, full_text_path) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = stmt.run(title, authors || '', arxiv_id || '', abstract, JSON.stringify(embeddingArray), JSON.stringify(tags || []), full_text_path || '');
  return info.lastInsertRowid;
}

export function addPaperNote({ paper_id, note, embeddingArray }) {
  const stmt = db.prepare('INSERT INTO paper_notes (paper_id, note, embedding) VALUES (?, ?, ?)');
  const info = stmt.run(paper_id, note, JSON.stringify(embeddingArray));
  return info.lastInsertRowid;
}

export function getPaperById(id) {
  return db.prepare('SELECT * FROM papers WHERE id = ?').get(id);
}

// ─── Reminder Functions ─────────────────────────────────────────────────────

export function addReminder(task, dueTimeIso) {
  const stmt = db.prepare('INSERT INTO reminders (task, due_time) VALUES (?, ?)');
  const info = stmt.run(task, dueTimeIso);
  return info.lastInsertRowid;
}

export function getPendingReminders() {
  return db.prepare('SELECT id, task, due_time FROM reminders WHERE due_time > datetime("now")').all();
}

export function deleteReminder(id) {
  const stmt = db.prepare('DELETE FROM reminders WHERE id = ?');
  const info = stmt.run(id);
  return info.changes > 0;
}

// ─── Error Ledger ───────────────────────────────────────────────────────────

export function logError(tool, args, message) {
  const stmt = db.prepare('INSERT INTO error_ledger (tool, args, message) VALUES (?, ?, ?)');
  stmt.run(tool, JSON.stringify(args), message);
}

export function getErrorsForTool(tool, limit = 5) {
  return db.prepare('SELECT args, message, timestamp FROM error_ledger WHERE tool = ? ORDER BY timestamp DESC LIMIT ?').all(tool, limit);
}

// ─── Audit Trail ────────────────────────────────────────────────────────────

export function logAudit(session_id, action, details) {
  const stmt = db.prepare('INSERT INTO audit_trail (session_id, action, details) VALUES (?, ?, ?)');
  stmt.run(session_id, action, typeof details === 'string' ? details : JSON.stringify(details));
}

export function getAuditTrail(session_id) {
  return db.prepare('SELECT action, details, timestamp FROM audit_trail WHERE session_id = ? ORDER BY timestamp ASC').all(session_id);
}
