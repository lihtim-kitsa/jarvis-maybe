// ─── Google Calendar Integration ─────────────────────────────────────────────
// OAuth 2.0 + Google Calendar REST API v3
// Follows the same pattern as the Spotify integration.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TOKENS_PATH = join(__dirname, '.google_calendar_tokens.json');
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',          // full read/write
  'https://www.googleapis.com/auth/calendar.events',    // event-level access
  'https://www.googleapis.com/auth/gmail.readonly'      // gmail read access
];

let tokens = null;

// ─── Token Management ────────────────────────────────────────────────────────

export function loadTokens() {
  try {
    tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

function saveTokens(newTokens) {
  tokens = newTokens;
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function getCredentials() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar credentials not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in .env');
  }
  return { clientId, clientSecret };
}

// ─── OAuth 2.0 Flow ──────────────────────────────────────────────────────────

export function getAuthUrl() {
  const { clientId } = getCredentials();
  const redirectUri = 'http://127.0.0.1:3000/google-calendar/callback';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code) {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'http://127.0.0.1:3000/google-calendar/callback',
      grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token exchange failed: ${data.error_description || data.error}`);

  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000
  };
  saveTokens(newTokens);
  return newTokens;
}

async function refreshAccessToken() {
  if (!tokens?.refresh_token) throw new Error('No refresh token available. Please re-authenticate.');
  const { clientId, clientSecret } = getCredentials();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);

  tokens.access_token = data.access_token;
  tokens.expiry_date = Date.now() + data.expires_in * 1000;
  saveTokens(tokens);
}

export async function getAccessToken() {
  if (!tokens) {
    if (!loadTokens()) throw new Error('Not authenticated with Google Calendar. Please authenticate first.');
  }
  // Refresh if token expires within the next 60 seconds
  if (Date.now() >= tokens.expiry_date - 60_000) {
    await refreshAccessToken();
  }
  return tokens.access_token;
}

// ─── Generic API Helper ──────────────────────────────────────────────────────

async function calendarApi(endpoint, { method = 'GET', body = null, params = {} } = {}) {
  const accessToken = await getAccessToken();
  const url = new URL(`https://www.googleapis.com/calendar/v3${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url.toString(), options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Calendar API error ${res.status}`);
  }
  // DELETE returns 204 No Content
  if (res.status === 204) return { success: true };
  return res.json();
}

// ─── Calendar API Functions ──────────────────────────────────────────────────

export async function listCalendars() {
  const data = await calendarApi('/users/me/calendarList');
  return data.items.map(cal => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description || '',
    primary: cal.primary || false,
    backgroundColor: cal.backgroundColor,
    timeZone: cal.timeZone
  }));
}

export async function getUpcomingEvents({
  calendarId = 'primary',
  timeMin,
  timeMax,
  maxResults = 15,
  query
} = {}) {
  const now = new Date();
  const defaultMin = timeMin || now.toISOString();
  // Default: next 24 hours
  const defaultMax = timeMax || new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const params = {
    timeMin: defaultMin,
    timeMax: defaultMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  };
  if (query) params.q = query;

  const data = await calendarApi(`/calendars/${encodeURIComponent(calendarId)}/events`, { params });
  return (data.items || []).map(formatEvent);
}

export async function getEventDetails({ calendarId = 'primary', eventId }) {
  const data = await calendarApi(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  return formatEvent(data);
}

export async function createEvent({ calendarId = 'primary', summary, description, location, startDateTime, endDateTime, startDate, endDate, attendees, recurrence }) {
  const event = { summary };
  if (description) event.description = description;
  if (location) event.location = location;

  // All-day event vs timed event
  if (startDate && endDate) {
    event.start = { date: startDate };
    event.end = { date: endDate };
  } else {
    event.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    event.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }

  if (attendees && attendees.length > 0) {
    event.attendees = attendees.map(email => ({ email }));
  }
  if (recurrence) {
    event.recurrence = Array.isArray(recurrence) ? recurrence : [recurrence];
  }

  const data = await calendarApi(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: event
  });
  return formatEvent(data);
}

export async function updateEvent({ calendarId = 'primary', eventId, summary, description, location, startDateTime, endDateTime, startDate, endDate }) {
  const updates = {};
  if (summary) updates.summary = summary;
  if (description) updates.description = description;
  if (location) updates.location = location;

  if (startDate && endDate) {
    updates.start = { date: startDate };
    updates.end = { date: endDate };
  } else if (startDateTime && endDateTime) {
    updates.start = { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    updates.end = { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }

  const data = await calendarApi(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: updates
  });
  return formatEvent(data);
}

export async function deleteEvent({ calendarId = 'primary', eventId }) {
  return await calendarApi(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE'
  });
}

export async function searchEvents({ calendarId = 'primary', query, timeMin, timeMax, maxResults = 10 }) {
  const now = new Date();
  const params = {
    q: query,
    timeMin: timeMin || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),  // past 30 days
    timeMax: timeMax || new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),   // next 90 days
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  };

  const data = await calendarApi(`/calendars/${encodeURIComponent(calendarId)}/events`, { params });
  return (data.items || []).map(formatEvent);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEvent(ev) {
  return {
    id: ev.id,
    summary: ev.summary || '(No title)',
    description: ev.description || '',
    location: ev.location || '',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    allDay: !!ev.start?.date,
    status: ev.status,
    htmlLink: ev.htmlLink,
    organizer: ev.organizer?.email || '',
    attendees: (ev.attendees || []).map(a => ({ email: a.email, responseStatus: a.responseStatus })),
    recurrence: ev.recurrence || [],
    created: ev.created,
    updated: ev.updated
  };
}
