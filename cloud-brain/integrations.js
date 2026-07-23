import { getAccessToken } from './google_calendar.js';

// ─── GMAIL INTEGRATION ───────────────────────────────────────────────────────
export async function listGmail(query = '') {
  try {
    const accessToken = await getAccessToken();
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('maxResults', '5');
    if (query) url.searchParams.set('q', query);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Gmail API Error');
    
    if (!data.messages) return { messages: [] };

    const detailedMessages = await Promise.all(data.messages.map(async (msg) => {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const msgData = await msgRes.json();
      
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
    return { error: `Failed to fetch Gmail: ${error.message}` };
  }
}

// ─── GITHUB INTEGRATION ──────────────────────────────────────────────────────
export async function searchGithub(query) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { error: 'GITHUB_TOKEN is not configured in .env' };

    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'JARVIS-Assistant'
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'GitHub API Error');

    return {
      results: data.items.map(item => ({
        name: item.full_name,
        description: item.description,
        url: item.html_url,
        stars: item.stargazers_count
      }))
    };
  } catch (error) {
    return { error: `Failed to search GitHub: ${error.message}` };
  }
}

// ─── SLACK INTEGRATION ───────────────────────────────────────────────────────
export async function sendSlackMessage(channel, message) {
  try {
    const token = process.env.SLACK_TOKEN;
    if (!token) return { error: 'SLACK_TOKEN is not configured in .env' };

    const res = await fetch('https://slack.com/api/chat.postMessage', {
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
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Slack API Error');

    return { status: 'Message sent successfully', channel: data.channel, ts: data.ts };
  } catch (error) {
    return { error: `Failed to send Slack message: ${error.message}` };
  }
}

// ─── NOTION INTEGRATION ──────────────────────────────────────────────────────
export async function searchNotion(query) {
  try {
    const token = process.env.NOTION_TOKEN;
    if (!token) return { error: 'NOTION_TOKEN is not configured in .env' };

    const res = await fetch('https://api.notion.com/v1/search', {
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Notion API Error');

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
    return { error: `Failed to search Notion: ${error.message}` };
  }
}
