import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { setToken } from './credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

async function migrate() {
  console.log('Starting credential migration to OS Keychain...');

  // 1. Migrate .env variables
  const envPath = join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    console.log('Found .env file, parsing...');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    
    if (envConfig.GEMINI_API_KEY) {
      await setToken('gemini', envConfig.GEMINI_API_KEY);
      console.log('- Migrated Gemini API Key');
    }
    if (envConfig.GITHUB_TOKEN) {
      await setToken('github', envConfig.GITHUB_TOKEN);
      console.log('- Migrated GitHub Token');
    }
    if (envConfig.SLACK_TOKEN) {
      await setToken('slack', envConfig.SLACK_TOKEN);
      console.log('- Migrated Slack Token');
    }
    if (envConfig.NOTION_TOKEN) {
      await setToken('notion', envConfig.NOTION_TOKEN);
      console.log('- Migrated Notion Token');
    }
  }

  // 2. Migrate Google Calendar Tokens
  const gcalTokensPath = join(__dirname, '.google_calendar_tokens.json');
  if (fs.existsSync(gcalTokensPath)) {
    console.log('Found Google Calendar tokens...');
    const gcalTokens = fs.readFileSync(gcalTokensPath, 'utf8');
    await setToken('google_calendar', gcalTokens);
    console.log('- Migrated Google Calendar Tokens');
  }

  // 3. Migrate Spotify Tokens
  const spotifyTokensPath = join(__dirname, '.spotify_tokens.json');
  if (fs.existsSync(spotifyTokensPath)) {
    console.log('Found Spotify tokens...');
    const spotifyTokens = fs.readFileSync(spotifyTokensPath, 'utf8');
    await setToken('spotify', spotifyTokens);
    console.log('- Migrated Spotify Tokens');
  }

  console.log('\nMigration complete! All keys and tokens have been securely saved to the Windows Credential Manager under the "JARVIS_Tokens" service.');
  console.log('You may now delete your plaintext .env and .json files if you choose.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
});
