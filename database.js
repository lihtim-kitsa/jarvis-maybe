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

export function searchMemory(queryEmbedding, limit = 5) {
  const rows = db.prepare('SELECT id, text, embedding, timestamp FROM memory').all();
  
  // Calculate similarity for all memories
  const results = rows.map(row => {
    const memEmbedding = JSON.parse(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, memEmbedding);
    return {
      id: row.id,
      text: row.text,
      similarity: similarity,
      timestamp: row.timestamp
    };
  });
  
  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Return top N matches that meet a basic threshold (e.g., > 0.5)
  return results.filter(r => r.similarity > 0.5).slice(0, limit);
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
