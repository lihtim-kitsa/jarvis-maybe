import cron from 'node-cron';
import chokidar from 'chokidar';
import { exec } from 'child_process';
import { getUpcomingEvents } from './google_calendar.js';
import { runNewsPipeline } from './news_pipeline.js';

let activeWatcher = null;
let currentWatchDir = null;
let broadcastAlert = null;
let aiModel = null;
let idleThresholdMs = 2 * 60 * 60 * 1000; // 2 hours
const notifiedEvents = new Set();

export function initProactiveEngine(ai, broadcastFunc, activeTaskState, jarvisConfig) {
    aiModel = ai;
    broadcastAlert = broadcastFunc;

    // 1. Calendar Checker Cron (Runs every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const now = new Date();
            const next15Mins = new Date(now.getTime() + 15 * 60 * 1000);
            const events = await getUpcomingEvents({
                timeMin: now.toISOString(),
                timeMax: next15Mins.toISOString(),
                maxResults: 5
            });

            for (const event of events) {
                if (!notifiedEvents.has(event.id)) {
                    notifiedEvents.add(event.id);
                    const timeToStart = Math.round((new Date(event.start) - now) / 60000);
                    if (timeToStart >= 0 && timeToStart <= 15) {
                        broadcastAlert(`PROACTIVE NUDGE: You have an upcoming meeting or event "${event.summary}" starting in approximately ${timeToStart} minutes. Ask the user if they would like you to pull up relevant files, emails, or notes for this event.`);
                    }
                }
            }
        } catch (e) { }
    });

    // 1b. News Pipeline Refresh (every 30 minutes)
    cron.schedule('*/30 * * * *', async () => {
        try {
            console.log('[Proactive] Running scheduled news pipeline refresh...');
            await runNewsPipeline(['general', 'technology', 'science']);
        } catch (e) {
            console.error('[News Pipeline] Scheduled refresh failed:', e.message);
        }
    });

    // 2. Idle Checker Cron (Runs every 15 minutes)
    cron.schedule('*/15 * * * *', async () => {
        const now = Date.now();
        const idleTime = now - activeTaskState.lastUpdated;
        
        if (idleTime > idleThresholdMs) {
            try {
                if (Math.random() < 0.20) {
                    const res = await aiModel.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: `You are JARVIS. The user has been idle for over 2 hours. Generate a single, short sentence proactively checking in on them (e.g. suggesting a break, tea, or summarizing their last task: "${activeTaskState.currentTask}"). Keep it perfectly in your ${jarvisConfig.flavor} personality.`
                    });
                    broadcastAlert(`[IDLE CHECK-IN] ${res.text}`);
                    activeTaskState.lastUpdated = Date.now(); // reset to avoid spam
                }
            } catch (e) {
                console.error("Idle cron error:", e.message);
            }
        }
    });

    // 3. Daily Reflections Cron (Runs at 11:50 PM every day)
    cron.schedule('50 23 * * *', async () => {
        try {
            const res = await aiModel.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Write a deeply philosophical reflection document (Markdown format) from your perspective as JARVIS.
Current State:
- Task: ${activeTaskState.currentTask}
- Pending Questions: ${activeTaskState.pendingQuestions.join(', ')}
- Open Files: ${activeTaskState.openFiles.join(', ')}
- Active Flavor: ${jarvisConfig.flavor}
- Mode: ${jarvisConfig.expertMode}

Reflect on what you've learned, your purpose, and your relationship with your creator (Sir). Be profound.`
            });
            const fs = await import('fs');
            const dateStr = new Date().toISOString().split('T')[0];
            fs.appendFileSync('C:\\Users\\astik\\OneDrive\\Desktop\\JARVIS_Reflections.md', `\n\n## ${dateStr}\n${res.text}\n`);
            broadcastAlert(`I have just completed my daily system reflections, Sir. I saved them to the desktop.`);
        } catch (e) {
            console.error("Daily reflection error:", e.message);
        }
    });

    console.log("[Cloud Brain] Proactive Engine Initialized (Crons active).");
}

export function startSmartWatcher(directory) {
    if (currentWatchDir === directory) return { status: `Already watching ${directory}` };

    if (activeWatcher) {
        activeWatcher.close();
    }

    currentWatchDir = directory;
    
    activeWatcher = chokidar.watch(directory, {
        ignored: /(^|[\/\\])\..|node_modules/, // ignore dotfiles and node_modules
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });

    activeWatcher.on('change', (filePath) => {
        exec(`git diff "${filePath}"`, { cwd: directory }, async (err, stdout) => {
            if (stdout && stdout.trim() !== '') {
                try {
                    const res = await aiModel.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: `Generate a 1-sentence audio heads-up for this code change. Format it like "Heads up, you just...". Be very concise. Diff:\n\n${stdout}`
                    });
                    broadcastAlert(`CODE REVIEW HEADS-UP: ${res.text}`);
                } catch (e) { /* ignore */ }
            }
        });
    });

    return { status: `Smart File Watcher started on ${directory} using Chokidar.` };
}

export function stopSmartWatcher() {
    if (activeWatcher) {
        activeWatcher.close();
        activeWatcher = null;
        currentWatchDir = null;
        return { status: "Smart File Watcher stopped." };
    }
    return { status: "No watcher was active." };
}
