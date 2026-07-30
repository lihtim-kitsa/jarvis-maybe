import { getAccessToken } from './google_calendar.js';
import CircuitBreaker from 'opossum';
import logger from './logger.js';
import { getToken } from './credentials.js';

const createBreaker = (serviceName) => {
  const breaker = new CircuitBreaker(async (url, options = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (!response.ok) {
        const errMsg = data.message || data.error?.message || data.error || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }, {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  });

  breaker.fallback(() => {
    throw new Error(`${serviceName} is currently unavailable (Circuit Open)`);
  });

  breaker.on('open', () => logger.warn(`Circuit open for ${serviceName}`));
  breaker.on('halfOpen', () => logger.info(`Circuit half-open for ${serviceName}`));
  breaker.on('close', () => logger.info(`Circuit closed for ${serviceName}`));

  return breaker;
};

const gmailBreaker = createBreaker('Gmail');
const githubBreaker = createBreaker('GitHub');
const slackBreaker = createBreaker('Slack');
const notionBreaker = createBreaker('Notion');


// ─── GMAIL INTEGRATION ───────────────────────────────────────────────────────
export async function listGmail(query = '') {
  try {
    const accessToken = await getAccessToken();
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('maxResults', '5');
    if (query) url.searchParams.set('q', query);

    const data = await gmailBreaker.fire(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!data.messages) return { messages: [] };

    const detailedMessages = await Promise.all(data.messages.map(async (msg) => {
      const msgData = await gmailBreaker.fire(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      const subjectHeader = msgData.payload?.headers?.find(h => h.name === 'Subject');
      const fromHeader = msgData.payload?.headers?.find(h => h.name === 'From');
      
      return {
        id: msgData.id,
        snippet: msgData.snippet,
        subject: subjectHeader ? subjectHeader.value : 'No Subject',
        from: fromHeader ? fromHeader.value : 'Unknown'
      };
    }));

    return { messages: detailedMessages };
  } catch (error) {
    logger.error(`Gmail integration error: ${error.message}`);
    return { error: `Failed to fetch Gmail: ${error.message}` };
  }
}

// ─── GITHUB INTEGRATION ──────────────────────────────────────────────────────
export async function searchGithub(query) {
  try {
    const token = await getToken('github', 'GITHUB_TOKEN');
    if (!token) return { error: 'GitHub token is not configured in OS keychain or .env' };

    const data = await githubBreaker.fire(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'JARVIS-Assistant'
      }
    });

    return {
      results: data.items.map(item => ({
        name: item.full_name,
        description: item.description,
        url: item.html_url,
        stars: item.stargazers_count
      }))
    };
  } catch (error) {
    logger.error(`GitHub integration error: ${error.message}`);
    return { error: `Failed to search GitHub: ${error.message}` };
  }
}

// ─── SLACK INTEGRATION ───────────────────────────────────────────────────────
export async function sendSlackMessage(channel, message) {
  try {
    const token = await getToken('slack', 'SLACK_TOKEN');
    if (!token) return { error: 'Slack token is not configured in OS keychain or .env' };

    const data = await slackBreaker.fire('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: channel,
        text: message
      })
    });

    return { status: 'Message sent successfully', channel: data.channel, ts: data.ts };
  } catch (error) {
    logger.error(`Slack integration error: ${error.message}`);
    return { error: `Failed to send Slack message: ${error.message}` };
  }
}

// ─── NOTION INTEGRATION ──────────────────────────────────────────────────────
export async function searchNotion(query) {
  try {
    const token = await getToken('notion', 'NOTION_TOKEN');
    if (!token) return { error: 'Notion token is not configured in OS keychain or .env' };

    const data = await notionBreaker.fire('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        query: query,
        page_size: 5
      })
    });

    return {
      results: data.results.map(page => {
        let title = 'Untitled';
        if (page.properties && page.properties.title && page.properties.title.title && page.properties.title.title.length > 0) {
          title = page.properties.title.title[0].plain_text;
        } else if (page.properties && page.properties.Name && page.properties.Name.title && page.properties.Name.title.length > 0) {
          title = page.properties.Name.title[0].plain_text;
        }
        return {
          id: page.id,
          title: title,
          url: page.url
        };
      })
    };
  } catch (error) {
    logger.error(`Notion integration error: ${error.message}`);
    return { error: `Failed to search Notion: ${error.message}` };
  }
}
