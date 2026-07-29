/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S. News Pipeline — news_pipeline.js
   Ingest → Extract → Summarize → Embed → Cache
   ═══════════════════════════════════════════════════════════════════════════ */

import crypto from 'crypto';
import { parseStringPromise } from 'xml2js';
import { upsertNewsItem, getRecentNews, searchNews, pruneOldNews } from './database.js';

let ai = null;

// ─── Init ───────────────────────────────────────────────────────────────────

export function initNewsPipeline(aiInstance) {
  ai = aiInstance;
  console.log('[News Pipeline] Initialized.');
}

// ─── Utility ────────────────────────────────────────────────────────────────

function urlHash(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/** Normalized Levenshtein distance for fuzzy title dedup */
function normalizedLevenshtein(a, b) {
  const an = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const bn = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (an === bn) return 0;
  const maxLen = Math.max(an.length, bn.length);
  if (maxLen === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= an.length; i++) matrix[i] = [i];
  for (let j = 0; j <= bn.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= an.length; i++) {
    for (let j = 1; j <= bn.length; j++) {
      const cost = an[i - 1] === bn[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[an.length][bn.length] / maxLen;
}

// ─── 1. Ingest Layer ────────────────────────────────────────────────────────

/**
 * Fetch headlines from GNews API (free tier: 100 req/day, 10 articles/req).
 * Falls back gracefully if no API key is configured.
 */
async function fetchFromGNews(topic = 'general') {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    console.log('[News Pipeline] No GNEWS_API_KEY set, skipping GNews ingest.');
    return [];
  }

  try {
    const category = topic === 'general' ? 'general' : '';
    let url;
    if (category) {
      url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&max=10&apikey=${apiKey}`;
    } else {
      url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&lang=en&max=10&apikey=${apiKey}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[News Pipeline] GNews returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.articles || []).map(a => ({
      title: a.title,
      description: a.description || '',
      url: a.url,
      image: a.image || '',
      publishedAt: a.publishedAt,
      source: a.source?.name || 'Unknown'
    }));
  } catch (e) {
    console.error('[News Pipeline] GNews fetch failed:', e.message);
    return [];
  }
}

/**
 * Parse an RSS/Atom feed URL and return normalized article objects.
 */
async function fetchFromRSS(feedUrl) {
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'JARVIS/1.0 News Pipeline' }
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    let items = [];

    // Standard RSS 2.0
    if (parsed.rss?.channel?.item) {
      const raw = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
      items = raw.map(i => ({
        title: i.title || '',
        description: i.description || '',
        url: i.link || '',
        image: '',
        publishedAt: i.pubDate ? new Date(i.pubDate).toISOString() : new Date().toISOString(),
        source: parsed.rss.channel.title || feedUrl
      }));
    }

    // Atom feed
    if (parsed.feed?.entry) {
      const raw = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
      items = raw.map(i => ({
        title: typeof i.title === 'string' ? i.title : i.title?._ || '',
        description: i.summary?._ || i.summary || '',
        url: i.link?.$?.href || i.link?.href || i.id || '',
        image: '',
        publishedAt: i.published || i.updated || new Date().toISOString(),
        source: parsed.feed.title?._ || parsed.feed.title || feedUrl
      }));
    }

    return items.slice(0, 10);
  } catch (e) {
    console.error(`[News Pipeline] RSS fetch failed for ${feedUrl}:`, e.message);
    return [];
  }
}

/**
 * Dedup articles by fuzzy title matching. Keeps the first occurrence.
 */
function dedup(articles) {
  const kept = [];
  for (const article of articles) {
    const isDuplicate = kept.some(k => normalizedLevenshtein(k.title, article.title) < 0.25);
    if (!isDuplicate && article.title) {
      kept.push(article);
    }
  }
  return kept;
}

// ─── 2. Fetch + Extract Full Article Text ───────────────────────────────────

/**
 * Fetch the article HTML and extract clean body text using Mozilla Readability.
 * Falls back to the GNews description if extraction fails.
 */
async function extractArticleText(articleUrl, fallbackDescription = '') {
  try {
    const { Readability } = await import('@mozilla/readability');
    const { JSDOM } = await import('jsdom');

    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return fallbackDescription;

    const html = await res.text();
    const dom = new JSDOM(html, { url: articleUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.length > 200) {
      // Trim to ~4000 chars to stay within summarizer context limits
      return article.textContent.slice(0, 4000);
    }
    return fallbackDescription;
  } catch (e) {
    console.warn(`[News Pipeline] Extraction failed for ${articleUrl}: ${e.message}`);
    return fallbackDescription;
  }
}

// ─── 3. Batch Summarization ─────────────────────────────────────────────────

/**
 * Summarize extracted article text via a standard Gemini Flash batch call.
 * Returns structured JSON, not prose.
 */
async function summarizeArticle(articleText, metadata) {
  if (!ai) throw new Error('News pipeline not initialized — call initNewsPipeline(ai) first.');

  const prompt = `You are a news summarizer. Given the following article text and metadata, produce a JSON object with exactly these fields:
- "headline": A clear, factual headline (max 15 words).
- "one_line": A single-sentence summary with the key fact/number.
- "detailed_summary": A 3-5 sentence summary covering who, what, when, where, why. Include specific numbers, names, and facts.
- "key_entities": An array of key people, organizations, or places mentioned.
- "why_it_matters": One sentence explaining the significance or impact.
- "category": One of: technology, science, business, politics, sports, health, entertainment, world, general.

Respond ONLY with valid JSON. No markdown, no explanation.

Source: ${metadata.source}
Published: ${metadata.publishedAt}
Original headline: ${metadata.title}

Article text:
${articleText}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    // Strip markdown code fences if present
    let text = response.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(text);
    return {
      headline: parsed.headline || metadata.title,
      one_line: parsed.one_line || '',
      detailed_summary: parsed.detailed_summary || '',
      key_entities: parsed.key_entities || [],
      why_it_matters: parsed.why_it_matters || '',
      category: parsed.category || 'general'
    };
  } catch (e) {
    console.error('[News Pipeline] Summarization failed:', e.message);
    // Graceful fallback — use raw metadata
    return {
      headline: metadata.title,
      one_line: metadata.description || '',
      detailed_summary: metadata.description || articleText.slice(0, 500),
      key_entities: [],
      why_it_matters: '',
      category: 'general'
    };
  }
}

// ─── 4. Embedding ───────────────────────────────────────────────────────────

async function embedText(text) {
  if (!ai) return [];
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: text,
    });
    return response.embeddings[0].values;
  } catch (e) {
    console.error('[News Pipeline] Embedding failed:', e.message);
    return [];
  }
}

// ─── 5. Orchestrator ────────────────────────────────────────────────────────

/** Default RSS feeds for broad coverage */
const DEFAULT_RSS_FEEDS = [
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',        // NYT Top Stories
  'https://feeds.bbci.co.uk/news/rss.xml',                            // BBC News
  'https://www.theverge.com/rss/index.xml',                           // The Verge (Tech)
  'https://feeds.arstechnica.com/arstechnica/index',                   // Ars Technica
  'https://rss.arxiv.org/rss/cs.AI',                                   // arXiv AI
];

/**
 * Run the full news pipeline for a list of topics.
 * topics: array of strings like ['general', 'technology', 'AI']
 */
export async function runNewsPipeline(topics = ['general']) {
  console.log(`[News Pipeline] Starting ingest for topics: ${topics.join(', ')}`);
  let totalIngested = 0;

  // Phase 1: Collect raw articles from all sources
  let allArticles = [];

  // GNews for each topic
  for (const topic of topics) {
    const gnewsArticles = await fetchFromGNews(topic);
    allArticles.push(...gnewsArticles);
  }

  // RSS feeds (always included for baseline coverage)
  for (const feedUrl of DEFAULT_RSS_FEEDS) {
    const rssArticles = await fetchFromRSS(feedUrl);
    allArticles.push(...rssArticles);
  }

  console.log(`[News Pipeline] Raw articles collected: ${allArticles.length}`);

  // Phase 2: Dedup
  allArticles = dedup(allArticles);
  console.log(`[News Pipeline] After dedup: ${allArticles.length}`);

  // Phase 3: Extract + Summarize + Embed + Store
  for (const article of allArticles) {
    const hash = urlHash(article.url);

    // Skip if already cached
    const { getNewsItemByHash } = await import('./database.js');
    if (getNewsItemByHash(hash)) {
      continue;
    }

    // Extract full text
    const fullText = await extractArticleText(article.url, article.description);

    // Summarize
    const summary = await summarizeArticle(fullText, article);

    // Embed the summary for semantic search
    const embedding = await embedText(`${summary.headline} ${summary.detailed_summary}`);

    // Store in cache
    upsertNewsItem({
      url_hash: hash,
      headline: summary.headline,
      one_line: summary.one_line,
      detailed_summary: summary.detailed_summary,
      key_entities: summary.key_entities,
      why_it_matters: summary.why_it_matters,
      source: article.source,
      category: summary.category,
      image_url: article.image,
      article_text: fullText,
      published_at: article.publishedAt,
      embedding: embedding
    });

    totalIngested++;
  }

  // Phase 4: Prune old entries (older than 48 hours)
  const pruned = pruneOldNews(48);
  if (pruned > 0) {
    console.log(`[News Pipeline] Pruned ${pruned} old news items.`);
  }

  console.log(`[News Pipeline] Complete. ${totalIngested} new articles ingested.`);
  return { ingested: totalIngested, total: allArticles.length };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getCachedNews(topic, limit = 5) {
  return getRecentNews(topic, limit);
}

export async function searchNewsByQuery(query, limit = 5) {
  const embedding = await embedText(query);
  if (!embedding || embedding.length === 0) return [];
  return searchNews(embedding, limit);
}
