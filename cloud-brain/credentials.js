import keytar from 'keytar';
import logger from './logger.js';

const SERVICE_NAME = 'JARVIS_Tokens';

/**
 * Retrieves a token from the OS keychain, falling back to process.env
 * @param {string} account - The account name (e.g., 'github', 'slack', 'google_calendar')
 * @param {string} envFallback - The process.env key to fallback to (e.g., 'GITHUB_TOKEN')
 * @returns {Promise<string|null>} The token string, or null if not found
 */
export async function getToken(account, envFallback = null) {
  try {
    const token = await keytar.getPassword(SERVICE_NAME, account);
    if (token) return token;
  } catch (error) {
    logger.error(`Error retrieving token for ${account} from OS keychain: ${error.message}`);
  }
  
  if (envFallback && process.env[envFallback]) {
    return process.env[envFallback];
  }
  
  return null;
}

/**
 * Saves a token to the OS keychain
 * @param {string} account - The account name
 * @param {string} token - The token to store
 */
export async function setToken(account, token) {
  try {
    await keytar.setPassword(SERVICE_NAME, account, token);
    logger.info(`Token for ${account} securely saved to OS keychain.`);
  } catch (error) {
    logger.error(`Error saving token for ${account} to OS keychain: ${error.message}`);
    throw error;
  }
}

/**
 * Deletes a token from the OS keychain
 * @param {string} account - The account name
 */
export async function deleteToken(account) {
  try {
    await keytar.deletePassword(SERVICE_NAME, account);
    logger.info(`Token for ${account} removed from OS keychain.`);
  } catch (error) {
    logger.error(`Error deleting token for ${account}: ${error.message}`);
    throw error;
  }
}
