import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', 'src', 'cli.ts');
const PROJECT_ROOT = join(__dirname, '..');

// Env that provides fake credentials so fromEnv() succeeds without a .env file.
// These are intentionally invalid so no real API call can succeed.
const FAKE_CREDS_ENV: Record<string, string> = {
  KWTSMS_USERNAME: 'js_wronguser',
  KWTSMS_PASSWORD: 'js_wrongpass',
  KWTSMS_SENDER_ID: 'TEST',
  KWTSMS_TEST_MODE: '1',
  KWTSMS_LOG_FILE: '',
  // Inherit PATH and NODE_PATH so node/tsx resolve correctly
  PATH: process.env.PATH ?? '',
  NODE_PATH: process.env.NODE_PATH ?? '',
  HOME: process.env.HOME ?? '',
  SYSTEMROOT: process.env.SYSTEMROOT ?? '',
};

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], env?: Record<string, string>): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'node',
      ['--import', 'tsx/esm', CLI_PATH, ...args],
      { cwd: PROJECT_ROOT, env: env ?? FAKE_CREDS_ENV, timeout: 15_000 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

// ── Help / usage ──────────────────────────────────────────────────────────────

describe('CLI — help / usage', () => {
  test('no args prints usage and exits 0', async () => {
    const r = await runCli([]);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes('Usage: kwtsms'), 'should print usage');
    assert.ok(r.stdout.includes('Commands:'), 'should list commands');
  });

  test('-h prints usage and exits 0', async () => {
    const r = await runCli(['-h']);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes('Usage: kwtsms'));
  });

  test('--help prints usage and exits 0', async () => {
    const r = await runCli(['--help']);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes('Usage: kwtsms'));
  });
});

// ── Unknown command ───────────────────────────────────────────────────────────

describe('CLI — unknown command', () => {
  test('prints error and usage, exits non-zero', async () => {
    const r = await runCli(['notacommand']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Unknown command'), 'should say unknown command');
    assert.ok(output.includes('notacommand'), 'should echo the bad command');
  });
});

// ── send argument validation ──────────────────────────────────────────────────

describe('CLI — send argument validation', () => {
  test('send with no args prints usage error, exits non-zero', async () => {
    const r = await runCli(['send']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Usage:') || output.includes('kwtsms send'));
  });

  test('send with only mobile (missing message) exits non-zero', async () => {
    const r = await runCli(['send', '96598765432']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Usage:') || output.includes('kwtsms send'));
  });

  test('send --sender without value exits non-zero', async () => {
    const r = await runCli(['send', '96598765432', 'hello', '--sender']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('--sender requires a value'));
  });
});

// ── validate argument validation ──────────────────────────────────────────────

describe('CLI — validate argument validation', () => {
  test('validate with no numbers prints usage error, exits non-zero', async () => {
    const r = await runCli(['validate']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Usage:') || output.includes('kwtsms validate'));
  });
});

// ── send local validation (no network) ────────────────────────────────────────

describe('CLI — send local validation (no network)', () => {
  test('all-invalid numbers fails locally without hitting API', async () => {
    const r = await runCli(['send', 'notanumber', 'hello']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Failed') || output.includes('Skipped') || output.includes('invalid'));
  });

  test('email as phone number fails locally', async () => {
    const r = await runCli(['send', 'user@example.com', 'hello']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('email') || output.includes('Skipped') || output.includes('Failed'));
  });

  test('emoji-only message returns error without hitting API', async () => {
    const r = await runCli(['send', '96598765432', '\u{1F600}\u{1F389}']);
    assert.notEqual(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('empty') || output.includes('ERR009') || output.includes('Failed'));
  });

  test('test mode warning is shown when KWTSMS_TEST_MODE=1', async () => {
    const r = await runCli(['send', '96598765432', 'hello']);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('TEST MODE'), 'should show test mode warning');
  });
});

// ── validate local validation (no network) ────────────────────────────────────

describe('CLI — validate local validation (no network)', () => {
  test('all-invalid numbers returns results without hitting API', async () => {
    const r = await runCli(['validate', 'abc', 'user@example.com']);
    // validate always exits 0 even with invalid numbers
    assert.equal(r.exitCode, 0);
    const output = r.stdout + r.stderr;
    assert.ok(output.includes('Valid'), 'should print Valid line');
    assert.ok(output.includes('Invalid'), 'should print Invalid line');
    assert.ok(output.includes('Rejected'), 'should list rejected numbers');
  });
});
