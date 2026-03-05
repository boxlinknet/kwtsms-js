/**
 * JSONL logger for kwtSMS API calls.
 * One JSON line per API call. Passwords always masked as "***".
 * Never throws — logging must never interrupt the main flow.
 */

import { appendFileSync } from 'node:fs';

export interface LogEntry {
  ts: string;           // UTC ISO-8601
  endpoint: string;
  request: Record<string, unknown>;
  response: unknown;
  ok: boolean;
  error: string | null;
}

export function writeLog(logFile: string, entry: LogEntry): void {
  if (!logFile) return;
  try {
    appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Disk full, permission denied, etc. — never crash the main flow
  }
}

/**
 * Return a copy of payload with the password field masked.
 * Never mutates the original object.
 */
export function maskCredentials(payload: Record<string, unknown>): Record<string, unknown> {
  if (!('password' in payload)) return payload;
  return { ...payload, password: '***' };
}
