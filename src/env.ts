/**
 * Minimal .env file parser. Zero external dependencies.
 * Reads KEY=VALUE pairs. Returns empty object if file does not exist.
 */

import { readFileSync } from 'node:fs';

export function loadEnvFile(filePath = '.env'): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    // File does not exist — fine, fall back to process.env
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    let value: string;

    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      // Quoted value: strip quotes, preserve everything inside including # characters
      value = rawValue.slice(1, -1);
    } else {
      // Unquoted value: strip inline comments (# and everything after, with preceding spaces)
      const commentIdx = rawValue.indexOf(' #');
      value = commentIdx >= 0 ? rawValue.slice(0, commentIdx) : rawValue;
      // Also handle # at start (no space before it)
      if (value.startsWith('#')) value = '';
    }

    if (key) result[key] = value;
  }
  return result;
}
