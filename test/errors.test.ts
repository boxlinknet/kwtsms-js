import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { API_ERRORS, enrichError } from '../src/errors.ts';

describe('API_ERRORS', () => {
  test('has all required error codes', () => {
    const expected = [
      'ERR001','ERR002','ERR003','ERR004','ERR005',
      'ERR006','ERR007','ERR008','ERR009','ERR010',
      'ERR011','ERR012','ERR013','ERR019','ERR020',
      'ERR021','ERR022','ERR023','ERR024','ERR025',
      'ERR026','ERR027','ERR028','ERR029','ERR030',
      'ERR031','ERR032','ERR033','ERR_INVALID_INPUT',
    ];
    for (const code of expected) {
      assert.ok(Object.keys(API_ERRORS).includes(code), `Missing error code: ${code}`);
    }
  });

  test('action messages are non-empty strings', () => {
    for (const [code, message] of Object.entries(API_ERRORS)) {
      assert.equal(typeof message, 'string', `${code}: not a string`);
      assert.ok(message.length > 0, `${code}: empty message`);
    }
  });
});

describe('enrichError', () => {
  test('adds action to known error code', () => {
    const input = { result: 'ERROR', code: 'ERR003', description: 'Auth error' };
    const result = enrichError(input);
    assert.equal(result.result, 'ERROR');
    assert.equal(result.code, 'ERR003');
    assert.ok(result.action, 'action should be set');
    assert.ok(result.action!.includes('KWTSMS_USERNAME'), 'action should mention KWTSMS_USERNAME');
  });

  test('does not add action for unknown error code', () => {
    const input = { result: 'ERROR', code: 'ERR999', description: 'Unknown' };
    const result = enrichError(input);
    assert.equal(result.code, 'ERR999');
    assert.equal(result.action, undefined);
  });

  test('does not modify OK responses', () => {
    const input = { result: 'OK', available: 100 };
    const result = enrichError(input as any);
    assert.equal(result.result, 'OK');
    assert.equal(result.action, undefined);
  });

  test('does not mutate the original object', () => {
    const input = { result: 'ERROR', code: 'ERR003', description: 'Auth error' };
    const inputCopy = { ...input };
    enrichError(input);
    assert.deepEqual(input, inputCopy);
  });

  test('ERR010 action mentions kwtsms.com', () => {
    const result = enrichError({ result: 'ERROR', code: 'ERR010', description: 'Zero balance' });
    assert.ok(result.action!.includes('kwtsms.com'));
  });

  test('ERR028 action mentions 15 seconds', () => {
    const result = enrichError({ result: 'ERROR', code: 'ERR028', description: 'Rate limit' });
    assert.ok(result.action!.includes('15 seconds'));
  });
});
