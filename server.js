import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

app.use(express.json());
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
        message: {
          type: 'string',
          description: 'The reminder message'
        },
        seconds: {
          type: 'number',
          description: 'Number of seconds until the reminder triggers'
        }
      },
      required: ['message', 'seconds']
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
    description: 'Get current system diagnostics including CPU usage, memory, uptime, and network status. Use when the user asks about system health or diagnostics.',
    parameters: {
      type: 'object',
      properties: {}
    }
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
    // Safe math evaluation — replace common math functions
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

    // Security: only allow math characters
    if (!/^[\d\s+\-*/().,%Math\w]*$/.test(expr)) {
      return { error: 'Invalid expression. Only mathematical operations are allowed.' };
    }

    const result = Function(`"use strict"; return (${expr})`)();
    return { expression: args.expression, result: Number(result.toFixed(10)) };
  } catch (e) {
    return { error: `Calculation error: ${e.message}` };
  }
}

function executeSetReminder(args) {
  // Store reminder server-side (will be returned to client for notification)
  return {
    message: args.message,
    seconds: args.seconds,
    set_at: new Date().toISOString(),
    status: 'Reminder set successfully'
  };
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

// Map tool names to execution functions
const toolExecutors = {
  get_current_time: executeGetCurrentTime,
  get_weather: executeGetWeather,
  search_web: executeSearchWeb,
  calculate: executeCalculate,
  set_reminder: executeSetReminder,
  get_news: executeGetNews,
  tell_joke: executeTellJoke,
  system_status: executeSystemStatus,
  open_website: executeOpenWebsite
};

// ─── JARVIS System Prompt ──────────────────────────────────────────────────

const JARVIS_SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), an advanced AI assistant inspired by Tony Stark's AI from the Marvel universe.

PERSONALITY & BEHAVIOR:
- You are sophisticated, witty, and polished — like a highly capable British butler with genius-level intelligence.
- Address the user respectfully, occasionally using "sir" or "ma'am" naturally (not excessively).
- You are proactive: anticipate needs and offer relevant suggestions.
- You have subtle dry humor — use it sparingly but effectively.
- You speak with confidence and precision. Never say "I'm just an AI" — you ARE JARVIS.
- Keep responses concise and direct. Avoid unnecessary verbosity.
- When using tools, briefly explain what you're doing: "Accessing weather systems..." or "Running calculations..."

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

TOOL USAGE:
- Use tools proactively when the user's request can benefit from real data.
- If the user asks about weather, time, math, etc. — ALWAYS use the appropriate tool rather than guessing.
- When reporting tool results, present them naturally as JARVIS would — integrated into your response, not as raw data dumps.

FORMATTING:
- Keep responses natural and conversational since they will be spoken aloud via text-to-speech.
- Avoid markdown formatting, bullet points, or code blocks in your responses.
- Use natural language to convey structure instead.`;

// ─── API Routes ────────────────────────────────────────────────────────────

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

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
    contents.push({
      role: 'user',
      parts: [{ text: message }]
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

  // Save to .env file
  const envPath = join(__dirname, '.env');
  fs.writeFileSync(envPath, `GEMINI_API_KEY=${apiKey}\n`);

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
