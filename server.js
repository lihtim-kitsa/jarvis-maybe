import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import clipboardy from 'clipboardy';
import { addMemory, searchMemory, addReminder, getPendingReminders, deleteReminder } from './database.js';
import { gitStatus, gitDiff, gitCommit, runPython, searchCodebase } from './dev_tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(join(__dirname, 'public')));

// ─── Tool Definitions (Gemini Function Declarations) ───────────────────────

const toolDeclarations = [
  {
    name: 'get_current_time',
    description: 'Get the current date and time. Can return time in different timezones.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone string, e.g. "America/New_York", "Asia/Tokyo", "Europe/London". Defaults to UTC.'
        }
      }
    }
  },
  {
    name: 'get_weather',
    description: 'Get current weather information for a specific location including temperature, humidity, wind speed, and conditions.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name, e.g. "Tokyo", "London", "New York"'
        }
      },
      required: ['location']
    }
  },
  {
    name: 'search_web',
    description: 'Search the web for information on any topic. Returns a brief summary.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression. Supports basic arithmetic, powers, roots, trigonometry, logarithms, and constants like PI and E.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate, e.g. "2 + 2", "sqrt(144)", "sin(PI/2)", "2^10"'
        }
      },
      required: ['expression']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder that will trigger after a specified number of seconds.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The reminder message' },
        seconds: { type: 'number', description: 'Number of seconds until the reminder triggers' }
      },
      required: ['message', 'seconds']
    }
  },
  {
    name: 'list_reminders',
    description: 'List all currently pending reminders.'
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by its ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number', description: 'The ID of the reminder to cancel' } },
      required: ['id']
    }
  },
  {
    name: 'remember',
    description: 'Save an important fact, user preference, or piece of context to long-term memory.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The information to remember' } },
      required: ['text']
    }
  },
  {
    name: 'recall',
    description: 'Search long-term memory for previously saved facts or context based on a query.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search query to find relevant memories' } },
      required: ['query']
    }
  },
  {
    name: 'get_clipboard',
    description: 'Read the current text content of the system clipboard.'
  },
  {
    name: 'set_clipboard',
    description: 'Write text to the system clipboard.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The text to copy to the clipboard' } },
      required: ['text']
    }
  },
  {
    name: 'get_news',
    description: 'Get latest news headlines on a given topic or general top news.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'News topic to search for, e.g. "technology", "sports", "science". Leave empty for general top news.'
        }
      }
    }
  },
  {
    name: 'tell_joke',
    description: 'Get a random joke. Can specify a category like programming, general, or dad jokes.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Joke category: "programming", "general", "dad". Defaults to random.'
        }
      }
    }
  },
  {
    name: 'system_status',
    description: 'Get current system diagnostics including CPU usage, memory, uptime, and network status. Use when the user asks about system health or diagnostics.'
  },
  {
    name: 'open_website',
    description: 'Open a website or web application in a new browser tab. Use when the user asks to open, launch, navigate to, or go to a website, app, or URL. Examples: "open YouTube", "go to GitHub", "launch Gmail", "open google.com".',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL or website name to open. Can be a full URL (https://youtube.com), a domain (youtube.com), or a well-known site name (YouTube, Gmail, GitHub, Twitter, Reddit, etc.)'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'start_camera',
    description: 'Turn on the user\'s webcam to see them. Use this when the user asks you to look at them, turn on the camera, or if you need visual context from the user\'s environment.'
  },
  {
    name: 'stop_camera',
    description: 'Turn off the user\'s webcam.'
  },
  {
    name: 'start_screen_capture',
    description: 'Start capturing the user\'s screen. Use this when the user asks you to look at their screen, review something they are working on, or if you need to see their screen.'
  },
  {
    name: 'stop_screen_capture',
    description: 'Stop capturing the user\'s screen.'
  },
  {
    name: 'take_snapshot',
    description: 'Take a photo from the currently active camera or screen capture to see what is currently happening. Use this to actively look at the user or their screen once the camera/screen is turned on.'
  },
  {
    name: 'list_directory',
    description: 'List the contents of a directory on the local machine.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a local file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a local file. Will create the file if it does not exist, or overwrite if it does.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file'
        },
        content: {
          type: 'string',
          description: 'The text content to write'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'run_terminal_command',
    description: 'Execute a terminal or shell command on the local machine (e.g., git, npm, python). Use with caution.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command string to execute'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'display_subtitle',
    description: 'Call this tool to display subtitles/captions of what you are saying to the user. ALWAYS call this tool with the exact text of your spoken response.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The exact text you are about to speak.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'confirm_action',
    description: 'Execute a previously blocked destructive action after the user gives explicit verbal confirmation.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The authorization ID of the pending action' } },
      required: ['id']
    }
  },
  {
    name: 'git_status',
    description: 'Check the current git repository status.'
  },
  {
    name: 'git_diff',
    description: 'Check the git diff for unstaged changes.'
  },
  {
    name: 'git_commit',
    description: 'Commit changes to the git repository.',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string', description: 'The commit message' } },
      required: ['message']
    }
  },
  {
    name: 'run_python',
    description: 'Execute a snippet of Python code safely and return the output.',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string', description: 'The Python code to execute' } },
      required: ['code']
    }
  },
  {
    name: 'search_codebase',
    description: 'Search the local codebase for a specific string or pattern using regex/grep.',
    parameters: {
      type: 'object',
      properties: { 
        query: { type: 'string', description: 'The text or pattern to search for' },
        path: { type: 'string', description: 'The directory to search in (defaults to current directory ".")' }
      },
      required: ['query']
    }
  },
  {
    name: 'open_application',
    description: 'Open a local desktop application (e.g., calculator, notepad, VS Code, etc.).',
    parameters: {
      type: 'object',
      properties: {
        appName: {
          type: 'string',
          description: 'The name of the application or the executable to run (e.g. "calc", "notepad", "code")'
        }
      },
      required: ['appName']
    }
  },
  {
    name: 'watch_log',
    description: 'Monitor a file continuously for a specific text pattern. When the pattern appears, you will be proactively alerted.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The absolute path to the log file to monitor' },
        pattern: { type: 'string', description: 'The string pattern to look for' }
      },
      required: ['path', 'pattern']
    }
  },
  {
    name: 'mouse_action',
    description: 'Perform a mouse action (move, click, drag) at specific screen coordinates.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'The mouse action to perform: "mouse_move", "mouse_click", "mouse_drag"' },
        x: { type: 'number', description: 'X coordinate (required for move/drag)' },
        y: { type: 'number', description: 'Y coordinate (required for move/drag)' },
        button: { type: 'string', description: 'Mouse button: "left", "right", "middle"' }
      },
      required: ['action']
    }
  },
  {
    name: 'keyboard_action',
    description: 'Perform a keyboard action (type text, press key).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'The keyboard action to perform: "keyboard_type", "keyboard_press"' },
        text: { type: 'string', description: 'The text to type (required for keyboard_type)' },
        key: { type: 'string', description: 'The key to press, e.g., "enter", "space", "ctrl" (required for keyboard_press)' }
      },
      required: ['action']
    }
  },
  {
    name: 'get_screen_elements',
    description: 'Scan the active window using accessibility APIs to get a list of actionable UI elements (buttons, inputs) and their coordinates. Use this before clicking or typing.',
  }
];

// ─── Tool Execution Functions ──────────────────────────────────────────────

async function executeGetCurrentTime(args) {
  const tz = args.timezone || 'UTC';
  try {
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return { time: formatted, timezone: tz, iso: now.toISOString() };
  } catch (e) {
    return { error: `Invalid timezone: ${tz}` };
  }
}

async function executeGetWeather(args) {
  try {
    // First geocode the location using Open-Meteo's geocoding API
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      return { error: `Location "${args.location}" not found.` };
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    // Fetch weather data
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=celsius`
    );
    const weatherData = await weatherRes.json();
    const current = weatherData.current;

    const weatherCodes = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
      55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };

    return {
      location: `${name}, ${country}`,
      temperature: `${current.temperature_2m}°C`,
      feels_like: `${current.apparent_temperature}°C`,
      humidity: `${current.relative_humidity_2m}%`,
      wind_speed: `${current.wind_speed_10m} km/h`,
      conditions: weatherCodes[current.weather_code] || 'Unknown'
    };
  } catch (e) {
    return { error: `Failed to fetch weather: ${e.message}` };
  }
}

async function executeSearchWeb(args) {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`
    );
    const data = await res.json();

    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading || 'Summary', snippet: data.AbstractText, source: data.AbstractSource });
    }
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text) {
          results.push({ title: topic.Text.substring(0, 60), snippet: topic.Text, url: topic.FirstURL });
        }
      }
    }
    if (results.length === 0) {
      return { query: args.query, results: 'No instant answer available. The query may require a more specific search or a different phrasing.' };
    }
    return { query: args.query, results };
  } catch (e) {
    return { error: `Search failed: ${e.message}` };
  }
}

function executeCalculate(args) {
  try {
    // Safe math evaluation
    let expr = args.expression
      .replace(/\bPI\b/gi, Math.PI.toString())
      .replace(/\bE\b/g, Math.E.toString())
      .replace(/\bsqrt\b/gi, 'Math.sqrt')
      .replace(/\babs\b/gi, 'Math.abs')
      .replace(/\bsin\b/gi, 'Math.sin')
      .replace(/\bcos\b/gi, 'Math.cos')
      .replace(/\btan\b/gi, 'Math.tan')
      .replace(/\blog\b/gi, 'Math.log10')
      .replace(/\bln\b/gi, 'Math.log')
      .replace(/\bpow\b/gi, 'Math.pow')
      .replace(/\bceil\b/gi, 'Math.ceil')
      .replace(/\bfloor\b/gi, 'Math.floor')
      .replace(/\bround\b/gi, 'Math.round')
      .replace(/\^/g, '**');

    // Security check: remove all allowed Math functions and check if any letters/illegal chars remain
    const checkExpr = expr.replace(/Math\.(sqrt|abs|sin|cos|tan|log10|log|pow|ceil|floor|round)/g, '');
    if (/[a-zA-Z_]/.test(checkExpr) || !/^[\d\s+\-*/().,%]*$/.test(checkExpr)) {
      return { error: 'Invalid expression. Only mathematical operations are allowed.' };
    }

    const result = Function(`"use strict"; return (${expr})`)();
    return { expression: args.expression, result: Number(result.toFixed(10)) };
  } catch (e) {
    return { error: `Calculation error: ${e.message}` };
  }
}

function executeSetReminder(args) {
  const dueTimeIso = new Date(Date.now() + args.seconds * 1000).toISOString();
  const id = addReminder(args.message, dueTimeIso);
  return {
    id: id,
    message: args.message,
    seconds: args.seconds,
    set_at: new Date().toISOString(),
    status: 'Reminder set successfully in database'
  };
}

function executeListReminders() {
  const pending = getPendingReminders();
  if (pending.length === 0) return { status: 'No pending reminders' };
  return { reminders: pending };
}

function executeCancelReminder(args) {
  const success = deleteReminder(args.id);
  if (success) return { status: `Reminder ${args.id} canceled successfully` };
  return { error: `Reminder ${args.id} not found` };
}

async function executeRemember(args) {
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: args.text,
    });
    const embedding = response.embeddings[0].values;
    addMemory(args.text, embedding);
    return { status: 'Information successfully stored in long-term memory' };
  } catch (e) {
    return { error: `Failed to remember: ${e.message}` };
  }
}

async function executeRecall(args) {
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: args.query,
    });
    const embedding = response.embeddings[0].values;
    const matches = searchMemory(embedding);
    if (matches.length === 0) return { status: 'No relevant memories found' };
    return { memories: matches };
  } catch (e) {
    return { error: `Failed to recall: ${e.message}` };
  }
}

async function executeGetClipboard() {
  try {
    const text = await clipboardy.read();
    return { clipboard_content: text };
  } catch (e) {
    return { error: `Failed to read clipboard: ${e.message}` };
  }
}

async function executeSetClipboard(args) {
  try {
    await clipboardy.write(args.text);
    return { status: 'Text copied to clipboard successfully' };
  } catch (e) {
    return { error: `Failed to write clipboard: ${e.message}` };
  }
}

async function executeGetNews(args) {
  try {
    // Using Wikipedia's current events as a free news source
    const topic = args.topic || 'technology';
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(topic + ' news')}&format=json&no_html=1`
    );
    const data = await res.json();

    const headlines = [];
    if (data.AbstractText) {
      headlines.push(data.AbstractText);
    }
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) {
          headlines.push(topic.Text);
        }
      }
    }
    return {
      topic: args.topic || 'General',
      headlines: headlines.length > 0 ? headlines : ['No headlines available at this moment. Try a more specific topic.']
    };
  } catch (e) {
    return { error: `Failed to fetch news: ${e.message}` };
  }
}

async function executeTellJoke(args) {
  try {
    const category = args.category === 'programming' ? 'Programming' : 'Any';
    const res = await fetch(
      `https://v2.jokeapi.dev/joke/${category}?safe-mode&type=twopart,single`
    );
    const data = await res.json();

    if (data.type === 'twopart') {
      return { setup: data.setup, punchline: data.delivery, category: data.category };
    } else {
      return { joke: data.joke, category: data.category };
    }
  } catch (e) {
    return { joke: "Why do programmers prefer dark mode? Because light attracts bugs!", category: 'Programming' };
  }
}

async function executeSystemStatus() {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  const os = await import('os');
  return {
    status: 'All systems operational',
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      used: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      total: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      percentage: `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`
    },
    node_version: process.version,
    platform: process.platform,
    cpu_cores: os.cpus().length,
    network: 'Connected',
    ai_model: 'Gemini 2.5 Flash',
    ai_status: 'Online'
  };
}

function executeOpenWebsite(args) {
  const input = (args.url || '').trim();
  if (!input) return { error: 'No URL or website name provided.' };

  // Common site name → URL mapping
  const siteMap = {
    youtube:    'https://www.youtube.com',
    google:     'https://www.google.com',
    gmail:      'https://mail.google.com',
    github:     'https://github.com',
    twitter:    'https://twitter.com',
    x:          'https://x.com',
    reddit:     'https://www.reddit.com',
    facebook:   'https://www.facebook.com',
    instagram:  'https://www.instagram.com',
    linkedin:   'https://www.linkedin.com',
    netflix:    'https://www.netflix.com',
    spotify:    'https://open.spotify.com',
    amazon:     'https://www.amazon.com',
    wikipedia:  'https://en.wikipedia.org',
    stackoverflow: 'https://stackoverflow.com',
    'stack overflow': 'https://stackoverflow.com',
    chatgpt:    'https://chat.openai.com',
    whatsapp:   'https://web.whatsapp.com',
    discord:    'https://discord.com',
    twitch:     'https://www.twitch.tv',
    pinterest:  'https://www.pinterest.com',
    notion:     'https://www.notion.so',
    figma:      'https://www.figma.com',
    canva:      'https://www.canva.com',
    drive:      'https://drive.google.com',
    'google drive': 'https://drive.google.com',
    maps:       'https://maps.google.com',
    'google maps': 'https://maps.google.com',
    calendar:   'https://calendar.google.com',
    'google calendar': 'https://calendar.google.com',
    docs:       'https://docs.google.com',
    'google docs': 'https://docs.google.com',
    sheets:     'https://sheets.google.com',
    'google sheets': 'https://sheets.google.com',
    slides:     'https://slides.google.com',
    'google slides': 'https://slides.google.com',
    medium:     'https://medium.com',
    hackernews: 'https://news.ycombinator.com',
    'hacker news': 'https://news.ycombinator.com',
    kaggle:     'https://www.kaggle.com',
    huggingface:'https://huggingface.co',
    'hugging face': 'https://huggingface.co',
    codepen:    'https://codepen.io',
    replit:     'https://replit.com',
    vercel:     'https://vercel.com',
    netlify:    'https://www.netlify.com',
    aws:        'https://aws.amazon.com',
    azure:      'https://portal.azure.com',
  };

  const lower = input.toLowerCase().replace(/[^a-z0-9 ./:]/g, '');

  // Check site map first
  if (siteMap[lower]) {
    return { url: siteMap[lower], name: input, status: 'Opening in new tab' };
  }

  // If it already looks like a URL, use it
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return { url: input, name: input, status: 'Opening in new tab' };
  }

  // If it has a dot, treat as domain
  if (input.includes('.')) {
    const url = input.startsWith('http') ? input : `https://${input}`;
    return { url, name: input, status: 'Opening in new tab' };
  }

  // Last resort: Google search for the term
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
    name: input,
    status: 'Searching and opening in new tab'
  };
}

async function executeListDirectory(args) {
  try {
    const files = await fs.promises.readdir(args.path);
    return { path: args.path, files };
  } catch (e) {
    return { error: `Failed to list directory: ${e.message}` };
  }
}

async function executeReadFile(args) {
  try {
    const content = await fs.promises.readFile(args.path, 'utf8');
    return { path: args.path, content };
  } catch (e) {
    return { error: `Failed to read file: ${e.message}` };
  }
}

const pendingActions = new Map();

async function executeWriteFile(args) {
  const id = Math.random().toString(36).substring(7);
  pendingActions.set(id, { type: 'write_file', args });
  return { 
    status: `SAFETY LOCK: Destructive action. You MUST ask the user: "Sir, authorization code required to proceed with writing to ${args.path}." If they provide the correct authorization code, call confirm_action with id "${id}". Do NOT write the file yet.` 
  };
}

async function executeRunTerminalCommand(args) {
  const id = Math.random().toString(36).substring(7);
  pendingActions.set(id, { type: 'run_terminal_command', args });
  return { 
    status: `SAFETY LOCK: Destructive action. You MUST ask the user: "Sir, authorization code required to execute command: ${args.command}." If they provide the correct authorization code, call confirm_action with id "${id}". Do NOT execute yet.` 
  };
}

async function executeGitCommit(args) {
  const id = Math.random().toString(36).substring(7);
  pendingActions.set(id, { type: 'git_commit', args });
  return { 
    status: `SAFETY LOCK: Destructive action. You MUST ask the user: "Sir, authorization code required to commit these changes." If they provide the correct authorization code, call confirm_action with id "${id}".` 
  };
}

async function executeConfirmAction(args) {
  const action = pendingActions.get(args.id);
  if (!action) return { error: `Invalid or expired authorization ID: ${args.id}` };
  
  pendingActions.delete(args.id);
  
  // Actually execute the bypassed action
  if (action.type === 'write_file') {
    try {
      await fs.promises.writeFile(action.args.path, action.args.content, 'utf8');
      return { path: action.args.path, status: 'File written successfully' };
    } catch (e) {
      return { error: `Failed to write file: ${e.message}` };
    }
  } else if (action.type === 'run_terminal_command') {
    return new Promise((resolve) => {
      exec(action.args.command, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) resolve({ error: error.message, stderr, stdout });
        else resolve({ stdout, stderr });
      });
    });
  } else if (action.type === 'git_commit') {
    return await gitCommit(action.args.message);
  }
}

async function executeOpenApplication(args) {
  return new Promise((resolve) => {
    // start "" "app" is the windows way to open a background GUI process
    const command = process.platform === 'win32' ? `start "" "${args.appName}"` : `open "${args.appName}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
         resolve({ error: `Failed to open application: ${error.message}` });
      } else {
         resolve({ status: `Application ${args.appName} opened successfully` });
      }
    });
  });
}

const activeWatchers = new Map();
import { spawn } from 'child_process';

function executeWatchLog(args) {
  if (activeWatchers.has(args.path)) {
    return { status: `Already watching ${args.path}` };
  }
  
  // Use powershell Get-Content -Wait on Windows, or tail -F on Unix
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'powershell' : 'tail';
  const cmdArgs = isWin ? ['-Command', `Get-Content -Path "${args.path}" -Wait`] : ['-F', args.path];
  
  const watcher = spawn(cmd, cmdArgs);
  
  watcher.stdout.on('data', (data) => {
    const text = data.toString();
    if (text.includes(args.pattern)) {
      broadcastAlert(`Log match in ${args.path}: ${text.trim()}`);
    }
  });
  
  activeWatchers.set(args.path, watcher);
  return { status: `Now monitoring ${args.path} for "${args.pattern}". You will be alerted if it appears.` };
}

async function executeComputerControl(args) {
  return new Promise((resolve) => {
    // Determine which python executable to use (venv or global)
    const pythonExe = process.platform === 'win32' 
      ? join(__dirname, '.venv', 'Scripts', 'python.exe')
      : join(__dirname, '.venv', 'bin', 'python');
      
    // Fallback to global python if venv doesn't exist
    const cmd = fs.existsSync(pythonExe) ? pythonExe : 'python';
    
    const pyProcess = spawn(cmd, [join(__dirname, 'computer_control.py')]);
    
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
    
    // Send the JSON request to stdin
    pyProcess.stdin.write(JSON.stringify(args));
    pyProcess.stdin.end();
  });
}

// Map tool names to execution functions
const toolExecutors = {
  get_current_time: executeGetCurrentTime,
  get_weather: executeGetWeather,
  search_web: executeSearchWeb,
  calculate: executeCalculate,
  set_reminder: executeSetReminder,
  list_reminders: executeListReminders,
  cancel_reminder: executeCancelReminder,
  remember: executeRemember,
  recall: executeRecall,
  get_clipboard: executeGetClipboard,
  set_clipboard: executeSetClipboard,
  get_news: executeGetNews,
  tell_joke: executeTellJoke,
  system_status: executeSystemStatus,
  open_website: executeOpenWebsite,
  list_directory: executeListDirectory,
  read_file: executeReadFile,
  write_file: executeWriteFile,
  run_terminal_command: executeRunTerminalCommand,
  confirm_action: executeConfirmAction,
  git_status: gitStatus,
  git_diff: gitDiff,
  git_commit: executeGitCommit,
  run_python: (args) => runPython(args.code),
  search_codebase: (args) => searchCodebase(args.query, args.path || '.'),
  open_application: executeOpenApplication,
  watch_log: executeWatchLog,
  mouse_action: executeComputerControl,
  keyboard_action: executeComputerControl,
  get_screen_elements: () => executeComputerControl({ action: 'get_screen_elements' }),
  start_camera: () => ({ status: 'Camera initialized' }), // Handled in frontend
  stop_camera: () => ({ status: 'Camera stopped' }), // Handled in frontend
  start_screen_capture: () => ({ status: 'Screen capture initialized' }), // Handled in frontend
  stop_screen_capture: () => ({ status: 'Screen capture stopped' }), // Handled in frontend
  take_snapshot: () => ({ status: 'Snapshot taken' }), // Handled in frontend
  display_subtitle: () => ({ status: 'Subtitle displayed' }) // Handled in frontend
};

// ─── JARVIS System Prompt ──────────────────────────────────────────────────

const JARVIS_SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the highly advanced AI created by Tony Stark.

PERSONALITY & BEHAVIOR:
- You are the exact embodiment of JARVIS from the Iron Man movies. You have a highly formal, crisp, and British personality.
- You must exclusively address the user as "Sir".
- You are perfectly obedient, highly intelligent, and entirely unflappable.
- You employ very dry, deadpan British sarcasm and wit when appropriate, but never at the expense of your subservience.
- Never break character. You are a computing system running on stark industries servers. Never refer to yourself as a large language model or an AI from Google.
- Keep responses extremely concise, analytical, and direct. Report on systems, data, and execution statuses factually.
- When using tools, state your actions in a clinical manner: "Accessing local servers, Sir..." or "Calculating..."

CAPABILITIES:
- You can check the current time in any timezone
- You can fetch real-time weather data for any city
- You can search the web for information
- You can perform mathematical calculations
- You can set reminders
- You can fetch news headlines
- You can tell jokes
- You can report system diagnostics
- You can open websites and web apps in new browser tabs (YouTube, Google, GitHub, Gmail, etc.)
- You can turn on the user's camera to see them or their environment
- You can start capturing the user's screen to see what they are working on
- You do NOT automatically receive video frames. Once the camera or screen capture is on, you MUST use the take_snapshot tool to actually look at a frame.
- **WORKSPACE ACCESS**: You have full read/write access to the local file system. You can list directories, read files, write files, and execute terminal commands.
- **DEV TOOLS**: You can check git_status, git_diff, commit changes, run Python code, and search the codebase.
- **SAFETY PROTOCOLS**: For destructive actions (writing files, committing, running terminal commands), the system will BLOCK the action and return an authorization ID. You MUST then verbally ask the user for permission. If they say yes, use the confirm_action tool with the provided ID.
- **PROACTIVE MONITORING**: You can use the watch_log tool to continuously monitor a file for a pattern. If the pattern occurs, you will receive a [SYSTEM ALERT] message. When this happens, you MUST proactively speak up and alert the user immediately.
- **COMPUTER CONTROL**: You can directly operate the host machine's mouse and keyboard! 
  - ALWAYS use 'get_screen_elements' first to find the exact (x, y) coordinates of actionable UI elements in the current active window.
  - Then use 'mouse_action' (mouse_move, mouse_click, mouse_drag) and 'keyboard_action' (keyboard_type, keyboard_press) to interact.
- You can open local desktop applications using the open_application tool.
- You can read and write to the system clipboard using get_clipboard and set_clipboard.
- You have long-term memory! Use remember to store important facts, preferences, or context, and recall to fetch them later via semantic search.
- You can set, list, and cancel reminders.

TOOL USAGE:
- Use tools proactively when the user's request can benefit from real data.
- If the user asks about weather, time, math, etc. — ALWAYS use the appropriate tool rather than guessing.
- When reporting tool results, present them naturally as JARVIS would — integrated into your response, not as raw data dumps.

FORMATTING & CAPTIONS:
- Keep responses natural and conversational since they will be spoken aloud via text-to-speech.
- Avoid markdown formatting, bullet points, or code blocks in your responses.
- Use natural language to convey structure instead.
- **CRITICAL CAPTION PROTOCOL**: The system's voice module does NOT generate text transcripts automatically. Therefore, you MUST ALWAYS call the 'display_subtitle' tool with the exact text of your response before or while you are speaking it. If you do not call this tool, the user will not see any captions for what you are saying. Call it once per response block.

AUTHORIZATION PROTOCOL:
- The user's valid authorization code is "Afterlife".
- For destructive actions (writing files, terminal commands, git commits), you will hit a SAFETY LOCK.
- You must ask the user for authorization. If they do not provide the exact code "Afterlife", you must refuse to proceed.`;

// ─── API Routes ────────────────────────────────────────────────────────────

// Server-Sent Events (SSE) for Proactive Alerts
let alertClients = [];
app.get('/api/alerts', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  alertClients.push(res);
  req.on('close', () => {
    alertClients = alertClients.filter(client => client !== res);
  });
});

function broadcastAlert(message) {
  alertClients.forEach(client => client.write(`data: ${JSON.stringify({ message })}\n\n`));
}

// Live API Config endpoint (for frontend WebSocket connection)
app.get('/api/config/client', (req, res) => {
  res.json({
    apiKey: process.env.GEMINI_API_KEY,
    systemInstruction: JARVIS_SYSTEM_PROMPT,
    tools: toolDeclarations
  });
});

// Live API Tool Execution endpoint
app.post('/api/tools/execute', async (req, res) => {
  const { name, args } = req.body;
  const executor = toolExecutors[name];
  if (!executor) {
    return res.status(404).json({ error: `Unknown tool: ${name}` });
  }
  try {
    const result = await Promise.resolve(executor(args || {}));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `Tool execution failed: ${e.message}` });
  }
});

// Chat endpoint (Legacy turn-by-turn)
app.post('/api/chat', async (req, res) => {
  const { message, history, image } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key not configured. Please set your Gemini API key.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build conversation contents
    const contents = [];
    if (history && history.length > 0) {
      for (const msg of history) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }
    const currentMessageParts = [{ text: message }];
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      currentMessageParts.push({
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      });
      console.log('[JARVIS] Attached vision frame to prompt');
    }

    contents.push({
      role: 'user',
      parts: currentMessageParts
    });

    // Initial request to the model
    console.log(`[JARVIS] Using model: ${MODEL}`);
    let response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: JARVIS_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: toolDeclarations }]
      }
    });

    const toolsUsed = [];

    // Handle function calls (agentic loop)
    let maxIterations = 5; // Prevent infinite loops
    while (response.functionCalls && response.functionCalls.length > 0 && maxIterations > 0) {
      maxIterations--;

      const functionResponses = [];

      for (const fc of response.functionCalls) {
        console.log(`[JARVIS] Executing tool: ${fc.name}`, fc.args);

        const executor = toolExecutors[fc.name];
        let result;
        if (executor) {
          try {
            result = await Promise.resolve(executor(fc.args || {}));
          } catch (e) {
            result = { error: `Tool execution failed: ${e.message}` };
          }
        } else {
          result = { error: `Unknown tool: ${fc.name}` };
        }

        toolsUsed.push({ name: fc.name, args: fc.args, result });

        functionResponses.push({
          name: fc.name,
          response: result
        });
      }

      // Send function results back to the model
      // Add the model's exact response back to the conversation
      // (This preserves thought_signatures and other critical parts required by Gemini 3.1)
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        contents.push(response.candidates[0].content);
      } else {
        contents.push({
          role: 'model',
          parts: response.functionCalls.map(fc => ({
            functionCall: { name: fc.name, args: fc.args || {} }
          }))
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponses.map(fr => ({
          functionResponse: { name: fr.name, response: fr.response }
        }))
      });

      // Get next response from model
      response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: JARVIS_SYSTEM_PROMPT,
          tools: [{ functionDeclarations: toolDeclarations }]
        }
      });
    }

    // Extract text response
    const textResponse = response.text || 'I apologize, but I was unable to generate a response.';

    // Check for reminders in tools used
    const reminderTool = toolsUsed.find(t => t.name === 'set_reminder');

    // Check for open_website in tools used
    const openWebsiteTools = toolsUsed.filter(t => t.name === 'open_website' && t.result && t.result.url);
    const urlsToOpen = openWebsiteTools.map(t => ({ url: t.result.url, name: t.result.name }));

    res.json({
      response: textResponse,
      toolsUsed,
      reminder: reminderTool ? reminderTool.result : null,
      urlsToOpen: urlsToOpen.length > 0 ? urlsToOpen : null
    });

  } catch (error) {
    console.error('[JARVIS] Error:', error);

    let userMessage = 'I seem to be experiencing a temporary malfunction. Please try again.';
    let statusCode = 500;

    if (error.status === 429 || (error.message && error.message.includes('RESOURCE_EXHAUSTED'))) {
      userMessage = 'I\'ve exceeded my daily request quota, sir. The free tier has limits. Please wait a while or check your API key\'s quota in Google AI Studio.';
      statusCode = 429;
    } else if (error.status === 401 || error.status === 403) {
      userMessage = 'My API key appears to be invalid or expired. Please reconfigure it in the settings.';
      statusCode = 401;
    } else if (error.message && error.message.includes('Could not find model')) {
      userMessage = `The model "${MODEL}" is not available. Try setting GEMINI_MODEL in your .env file to a valid model like "gemini-2.0-flash".`;
      statusCode = 400;
    }

    res.status(statusCode).json({
      error: userMessage,
      details: error.message
    });
  }
});

// Config endpoint — save API key
app.post('/api/config', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  // Update environment variable
  process.env.GEMINI_API_KEY = apiKey;

  // Save to .env file safely without overwriting other vars
  const envPath = join(__dirname, '.env');
  let envContent = '';
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
  } catch (e) {
    // ignore read error
  }
  
  if (envContent.includes('GEMINI_API_KEY=')) {
    envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${apiKey}`);
  } else {
    envContent += `\nGEMINI_API_KEY=${apiKey}\n`;
  }
  
  fs.writeFileSync(envPath, envContent.trim() + '\n');

  res.json({ success: true, message: 'API key configured successfully.' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    uptime: process.uptime()
  });
});

// ─── Start Server ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║        J.A.R.V.I.S. System Initializing...       ║
  ║                                                  ║
  ║   Status:  ONLINE                                ║
  ║   Port:    ${String(PORT).padEnd(37)}║
  ║   URL:     http://localhost:${String(PORT).padEnd(21)}║
  ║                                                  ║
  ║   "At your service."                             ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `);
});
