/**
 * HTTP POST to kwtSMS REST/JSON API endpoints.
 *
 * Uses Node.js built-in node:https. Zero external dependencies.
 * Always sets Content-Type and Accept: application/json.
 * Reads 4xx response bodies (kwtSMS returns JSON error details in 403 bodies).
 * Returns parsed JSON dict. Throws Error on network/parse failure.
 */

import https from 'node:https';
import { writeLog, maskCredentials, type LogEntry } from './logger.js';
import type { ApiResponse } from './errors.js';

const BASE_HOSTNAME = 'www.kwtsms.com';
const BASE_PATH = '/API/';
const TIMEOUT_MS = 15_000;

/**
 * POST JSON to a kwtSMS endpoint. Returns parsed response object.
 *
 * Returns: the parsed JSON (which may be an OK or ERROR response)
 * Throws: Error on network failure, timeout, or unparseable JSON response
 */
export async function apiRequest(
  endpoint: string,
  payload: Record<string, unknown>,
  logFile = '',
): Promise<ApiResponse> {
  const body = JSON.stringify(payload);
  const path = `${BASE_PATH}${endpoint}/`;

  const logEntry: LogEntry = {
    ts: new Date().toISOString(),
    endpoint,
    request: maskCredentials(payload),
    response: null,
    ok: false,
    error: null,
  };

  return new Promise<ApiResponse>((resolve, reject) => {
    const options = {
      hostname: BASE_HOSTNAME,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data: ApiResponse;
        try {
          data = JSON.parse(raw) as ApiResponse;
        } catch {
          const err = new Error(`Invalid JSON response from kwtSMS API: ${raw.slice(0, 200)}`);
          logEntry.error = err.message;
          writeLog(logFile, logEntry);
          reject(err);
          return;
        }
        logEntry.response = data;
        logEntry.ok = data.result === 'OK';
        writeLog(logFile, logEntry);
        resolve(data);
      });
      res.on('error', (e: Error) => {
        logEntry.error = e.message;
        writeLog(logFile, logEntry);
        reject(new Error(`Response stream error: ${e.message}`));
      });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      const err = new Error(`Request timed out after ${TIMEOUT_MS}ms`);
      logEntry.error = err.message;
      writeLog(logFile, logEntry);
      reject(err);
    });

    req.on('error', (e: Error) => {
      // Only reject if not already handled by timeout
      if (!req.destroyed || !logEntry.error) {
        logEntry.error = e.message;
        writeLog(logFile, logEntry);
        reject(new Error(`Network error: ${e.message}`));
      }
    });

    req.write(body);
    req.end();
  });
}
