import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import logger from './logger.js';

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
    due_time DATETIME,
    cron_schedule TEXT
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

  CREATE TABLE IF NOT EXISTS news_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_hash TEXT UNIQUE,
    headline TEXT,
    one_line TEXT,
    detailed_summary TEXT,
    key_entities TEXT,
    why_it_matters TEXT,
    source TEXT,
    category TEXT,
    image_url TEXT,
    article_text TEXT,
    published_at TEXT,
    fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
    embedding TEXT
  );
  CREATE TABLE IF NOT EXISTS user_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT UNIQUE NOT NULL,
    last_queried DATETIME DEFAULT CURRENT_TIMESTAMP
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

// Add global array to hold cron jobs so we can cancel them if needed (though not implemented yet)
const activeCronJobs = {};

export function addReminder(task, dueTime, cronSchedule = null) {
  try {
    const stmt = db.prepare('INSERT INTO reminders (task, due_time, cron_schedule) VALUES (?, ?, ?)');
    const info = stmt.run(task, dueTime, cronSchedule);
    logger.info(`Reminder added: ${task}`);
    
    // If it's a cron schedule, start it immediately
    if (cronSchedule) {
       startCronJob(info.lastInsertRowid, task, cronSchedule);
    }
    
    return { status: 'success', id: info.lastInsertRowid };
  } catch (err) {
    logger.error(`Error adding reminder: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

export function getPendingReminders() {
  try {
    // For non-recurring reminders only
    const stmt = db.prepare('SELECT * FROM reminders WHERE due_time <= datetime("now") AND cron_schedule IS NULL');
    return stmt.all();
  } catch (err) {
    logger.error(`Error getting reminders: ${err.message}`);
    return [];
  }
}

export function deleteReminder(id) {
  try {
    const stmt = db.prepare('DELETE FROM reminders WHERE id = ?');
    stmt.run(id);
    
    if (activeCronJobs[id]) {
       activeCronJobs[id].stop();
       delete activeCronJobs[id];
    }
    
    return { status: 'success' };
  } catch (err) {
    logger.error(`Error deleting reminder: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

function startCronJob(id, task, cronSchedule) {
   if (cron.validate(cronSchedule)) {
      activeCronJobs[id] = cron.schedule(cronSchedule, () => {
         logger.info(`CRON REMINDER FIRED: ${task}`);
         // Send to SSE alerts or similar. Since we don't have direct access to broadcastAlert here, 
         // we might need to emit an event or just let the cloud-brain polling handle it.
         // Actually, let's just log it and maybe the main server.js can hook into it.
         // To make it simple, we'll write it to a temporary 'pending_cron_alerts' table or just emit.
         // We will add a 'due_time' as now so getPendingReminders picks it up as a one-off.
         db.prepare('INSERT INTO reminders (task, due_time, cron_schedule) VALUES (?, datetime("now"), NULL)').run(`[RECURRING] ${task}`);
      });
      logger.info(`Started cron job ${id} for ${task} with schedule ${cronSchedule}`);
   } else {
      logger.warn(`Invalid cron schedule for reminder ${id}: ${cronSchedule}`);
   }
}

// Load existing cron jobs on startup
function loadCronJobs() {
   try {
      const stmt = db.prepare('SELECT * FROM reminders WHERE cron_schedule IS NOT NULL');
      const crons = stmt.all();
      for (const c of crons) {
         startCronJob(c.id, c.task, c.cron_schedule);
      }
   } catch (err) {
      logger.error(`Failed to load cron jobs: ${err.message}`);
   }
}
loadCronJobs();

export function logUserTopic(topic) {
  try {
    db.prepare('INSERT INTO user_topics (topic) VALUES (?) ON CONFLICT(topic) DO UPDATE SET last_queried=CURRENT_TIMESTAMP').run(topic);
  } catch (err) {
    logger.error(`Error logging topic: ${err.message}`);
  }
}

export function getTopUserTopics(limit = 3) {
  try {
    return db.prepare('SELECT topic FROM user_topics ORDER BY last_queried DESC LIMIT ?').all(limit).map(r => r.topic);
  } catch (err) {
    return [];
  }
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

// ─── News Pipeline Functions ────────────────────────────────────────────────

export function upsertNewsItem(item) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO news_items
      (url_hash, headline, one_line, detailed_summary, key_entities, why_it_matters, source, category, image_url, article_text, published_at, embedding)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    item.url_hash,
    item.headline,
    item.one_line,
    item.detailed_summary,
    JSON.stringify(item.key_entities || []),
    item.why_it_matters,
    item.source,
    item.category,
    item.image_url || '',
    item.article_text || '',
    item.published_at,
    item.embedding ? JSON.stringify(item.embedding) : '[]'
  );
  return info.changes > 0;
}

export function getRecentNews(category, limit = 5) {
  if (category && category !== 'general') {
    return db.prepare(
      'SELECT id, url_hash, headline, one_line, detailed_summary, key_entities, why_it_matters, source, category, image_url, published_at, fetched_at FROM news_items WHERE category = ? ORDER BY published_at DESC LIMIT ?'
    ).all(category, limit);
  }
  return db.prepare(
    'SELECT id, url_hash, headline, one_line, detailed_summary, key_entities, why_it_matters, source, category, image_url, published_at, fetched_at FROM news_items ORDER BY published_at DESC LIMIT ?'
  ).all(limit);
}

export function searchNews(queryEmbedding, limit = 5) {
  const rows = db.prepare('SELECT id, headline, one_line, detailed_summary, key_entities, why_it_matters, source, category, image_url, published_at, article_text, embedding FROM news_items WHERE embedding IS NOT NULL').all();
  const results = rows.map(row => {
    const emb = JSON.parse(row.embedding);
    if (!emb || emb.length === 0) return null;
    const similarity = cosineSimilarity(queryEmbedding, emb);
    return { ...row, similarity };
  }).filter(r => r && r.similarity > 0.5);
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

export function pruneOldNews(olderThanHours = 48) {
  const stmt = db.prepare("DELETE FROM news_items WHERE fetched_at < datetime('now', ? || ' hours')");
  const info = stmt.run(`-${olderThanHours}`);
  return info.changes;
}

export function getNewsItemByHash(urlHash) {
  return db.prepare('SELECT * FROM news_items WHERE url_hash = ?').get(urlHash);
}

// ─── Integrity & Backups ────────────────────────────────────────────────────

export async function runIntegrityCheckAndBackup() {
  logger.info('Running memory DB integrity check...');
  const result = db.pragma('integrity_check');
  const isHealthy = result.length > 0 && result[0].integrity_check === 'ok';

  const backupsDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
  }

  if (isHealthy) {
    logger.info('Memory DB integrity OK. Taking backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupsDir, `memory-backup-${timestamp}.db`);
    
    // SQLite online backup API provided by better-sqlite3
    await db.backup(backupPath);
    logger.info(`Backup created at ${backupPath}`);

    // Rotate backups (keep only 7 most recent)
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('memory-backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupsDir, f), time: fs.statSync(path.join(backupsDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 7) {
      const toDelete = files.slice(7);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
        logger.info(`Deleted old backup: ${file.name}`);
      }
    }
  } else {
    logger.error('Memory DB integrity check FAILED! Database is corrupted.');
    
    // Find the latest backup
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('memory-backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupsDir, f), time: fs.statSync(path.join(backupsDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      const latestBackup = files[0].path;
      logger.info(`Restoring from latest backup: ${latestBackup}`);
      
      // Close the corrupted DB
      db.close();
      
      // Rename corrupted DB
      const corruptedPath = path.join(__dirname, `memory.corrupted.${Date.now()}.db`);
      fs.renameSync(dbPath, corruptedPath);
      logger.info(`Moved corrupted DB to ${corruptedPath}`);
      
      // Copy backup to dbPath
      fs.copyFileSync(latestBackup, dbPath);
      
      logger.info('Restore complete. Please restart the application.');
      process.exit(1); // Force restart to cleanly re-init the connection
    } else {
      logger.error('No healthy backups found! Manual intervention required.');
      process.exit(1);
    }
  }
}
