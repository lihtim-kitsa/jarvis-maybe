import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// .env is in the parent JARVIS directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function draftCode(prompt, outputFilePath) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-live-preview',
      contents: `You are an expert software developer running as a background sub-agent for JARVIS. 
Write clean, robust code based on the following prompt. 
Output ONLY the raw code. Do NOT wrap the code in markdown formatting or backticks (no \`\`\`python, etc.). The exact text you output will be written directly to the file.
      
Prompt: ${prompt}`
    });

    // Remove any accidental markdown backticks just in case
    let code = response.text.trim();
    if (code.startsWith('\`\`\`') || code.endsWith('\`\`\`')) {
      code = code.replace(/^\`\`\`[a-z]*\n/, '').replace(/\n\`\`\`$/, '');
    }

    // Resolve output path relative to workspace or allow absolute
    const targetPath = path.isAbsolute(outputFilePath) ? outputFilePath : path.join(process.cwd(), outputFilePath);

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, code, 'utf8');

    return {
      status: 'Code successfully drafted and saved.',
      file: targetPath,
      snippet: code.substring(0, 200) + (code.length > 200 ? '...' : '')
    };
  } catch (error) {
    return { error: `Failed to draft code: ${error.message}` };
  }
}
