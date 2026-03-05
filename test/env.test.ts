import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { loadEnvFile } from '../src/env.ts';

const TMP = '/tmp/kwtsms-test-env.env';

function withEnv(content: string, fn: (env: Record<string, string>) => void): void {
  writeFileSync(TMP, content, 'utf8');
  try {
    fn(loadEnvFile(TMP));
  } finally {
    try { unlinkSync(TMP); } catch { /* ignore */ }
  }
}

describe('loadEnvFile', () => {
  test('returns empty object for missing file', () => {
    const result = loadEnvFile('/nonexistent/.env');
    assert.deepEqual(result, {});
  });

  test('parses plain KEY=VALUE', () => {
    withEnv('FOO=bar\n', (env) => assert.equal(env['FOO'], 'bar'));
  });

  test('strips space-prefixed inline comment', () => {
    withEnv('FOO=bar # comment\n', (env) => assert.equal(env['FOO'], 'bar'));
  });

  test('strips tab-prefixed inline comment', () => {
    withEnv('FOO=bar\t# comment\n', (env) => assert.equal(env['FOO'], 'bar'));
  });

  test('preserves # inside double-quoted value', () => {
    withEnv('FOO="bar#baz"\n', (env) => assert.equal(env['FOO'], 'bar#baz'));
  });

  test('handles CRLF line endings', () => {
    withEnv('FOO=bar\r\nBAZ=qux\r\n', (env) => {
      assert.equal(env['FOO'], 'bar');
      assert.equal(env['BAZ'], 'qux');
    });
  });

  test('mismatched quotes do not include leading quote in value', () => {
    withEnv('FOO="value\'\n', (env) => {
      const val = env['FOO'];
      assert.ok(val !== undefined, 'FOO should be parsed');
      assert.ok(!val.startsWith('"'), `value should not start with quote, got: "${val}"`);
    });
  });

  test('value with = sign is fully preserved', () => {
    withEnv('FOO=a=b=c\n', (env) => assert.equal(env['FOO'], 'a=b=c'));
  });

  test('skips comment lines', () => {
    withEnv('# this is a comment\nFOO=bar\n', (env) => {
      assert.equal(Object.keys(env).length, 1);
      assert.equal(env['FOO'], 'bar');
    });
  });

  test('skips blank lines', () => {
    withEnv('\n\nFOO=bar\n\n', (env) => assert.equal(env['FOO'], 'bar'));
  });

  test('single-quoted value preserved', () => {
    withEnv("FOO='hello world'\n", (env) => assert.equal(env['FOO'], 'hello world'));
  });
});
