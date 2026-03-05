import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { maskCredentials, writeLog, type LogEntry } from '../src/logger.ts';

function tmpPath(): string {
  return `/tmp/kwtsms-logger-test-${randomUUID()}.jsonl`;
}

function readEntries(path: string): LogEntry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry);
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    ts: '2026-01-01T00:00:00.000Z',
    endpoint: 'balance',
    request: { username: 'u', password: '***' },
    response: { result: 'OK' },
    ok: true,
    error: null,
    ...overrides,
  };
}

describe('maskCredentials', () => {
  test('masks password field with ***', () => {
    const result = maskCredentials({ username: 'user', password: 'secret', message: 'hello' });
    assert.equal(result.password, '***');
    assert.equal(result.username, 'user');
    assert.equal(result.message, 'hello');
  });

  test('does not mutate the original object', () => {
    const original = { username: 'u', password: 'p' };
    maskCredentials(original);
    assert.equal(original.password, 'p');
  });

  test('returns the exact same object reference when no password field', () => {
    const original = { username: 'u', mobile: '96598765432' };
    const result = maskCredentials(original);
    assert.strictEqual(result, original);
  });

  test('handles empty payload', () => {
    const result = maskCredentials({});
    assert.deepEqual(result, {});
  });

  test('does not mask non-password credential-like fields (e.g. token)', () => {
    const original = { token: 'secret', apiKey: 'key' };
    const result = maskCredentials(original);
    assert.equal(result.token, 'secret');
    assert.equal(result.apiKey, 'key');
  });
});

describe('writeLog', () => {
  test('writes a valid JSONL entry to file', () => {
    const path = tmpPath();
    try {
      writeLog(path, makeEntry({ endpoint: 'send', ok: false }));
      const entries = readEntries(path);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].endpoint, 'send');
      assert.equal(entries[0].ok, false);
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  });

  test('appends multiple entries (each on its own line)', () => {
    const path = tmpPath();
    try {
      writeLog(path, makeEntry({ endpoint: 'balance' }));
      writeLog(path, makeEntry({ endpoint: 'send' }));
      const entries = readEntries(path);
      assert.equal(entries.length, 2);
      assert.equal(entries[0].endpoint, 'balance');
      assert.equal(entries[1].endpoint, 'send');
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  });

  test('does nothing when logFile is empty string', () => {
    // Should not throw and should not create any file
    assert.doesNotThrow(() => writeLog('', makeEntry()));
  });

  test('does not throw when path is unwriteable', () => {
    assert.doesNotThrow(() => writeLog('/nonexistent/dir/log.jsonl', makeEntry()));
  });

  test('written entry is valid JSON parseable back to LogEntry shape', () => {
    const path = tmpPath();
    try {
      const entry = makeEntry({ error: 'timeout' });
      writeLog(path, entry);
      const entries = readEntries(path);
      assert.equal(entries[0].ts, entry.ts);
      assert.equal(entries[0].error, 'timeout');
      assert.deepEqual(entries[0].request, entry.request);
    } finally {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
  });
});
