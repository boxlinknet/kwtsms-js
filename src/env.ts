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
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}
