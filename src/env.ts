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

    // Check for properly matched quotes (same char at start and end, length >= 2)
    const firstChar = rawValue[0];
    const lastChar = rawValue[rawValue.length - 1];
    const isDoubleQuoted = firstChar === '"' && lastChar === '"' && rawValue.length >= 2;
    const isSingleQuoted = firstChar === "'" && lastChar === "'" && rawValue.length >= 2;

    if (isDoubleQuoted || isSingleQuoted) {
      // Quoted value: strip quotes, preserve everything inside including # characters
      value = rawValue.slice(1, -1);
    } else {
      // Unquoted value: strip inline comments (space OR tab followed by # and everything after)
      const commentMatch = rawValue.search(/[ \t]#/);
      value = commentMatch >= 0 ? rawValue.slice(0, commentMatch) : rawValue;
      // Also handle # at start (no space before it)
      if (value.startsWith('#')) value = '';
      // Strip a leading unmatched quote character
      if ((value.startsWith('"') || value.startsWith("'")) && value[0] !== value[value.length - 1]) {
        value = value.slice(1);
      }
    }

    if (key) result[key] = value;
  }
  return result;
}
