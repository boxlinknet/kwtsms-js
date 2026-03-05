import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, validatePhoneInput } from '../src/phone.ts';

describe('normalizePhone', () => {
  test('strips + prefix', () => assert.equal(normalizePhone('+96598765432'), '96598765432'));
  test('strips 00 prefix', () => assert.equal(normalizePhone('0096598765432'), '96598765432'));
  test('strips spaces', () => assert.equal(normalizePhone('965 9876 5432'), '96598765432'));
  test('strips dashes', () => assert.equal(normalizePhone('965-9876-5432'), '96598765432'));
  test('strips dots', () => assert.equal(normalizePhone('965.9876.5432'), '96598765432'));
  test('strips parentheses', () => assert.equal(normalizePhone('(965)98765432'), '96598765432'));
  test('converts Arabic-Indic digits (U+0660-U+0669)', () => {
    // ٩٦٥٩٨٧٦٥٤٣٢ → 96598765432
    assert.equal(normalizePhone('\u0669\u0666\u0665\u0669\u0668\u0667\u0666\u0665\u0664\u0663\u0662'), '96598765432');
  });
  test('converts Extended Arabic-Indic/Persian digits (U+06F0-U+06F9)', () => {
    assert.equal(normalizePhone('\u06f9\u06f6\u06f5'), '965');
  });
  test('strips leading zeros', () => {
    assert.equal(normalizePhone('0096598765432'), '96598765432');
    assert.equal(normalizePhone('096598765432'), '96598765432');
  });
  test('handles already normalized number', () => assert.equal(normalizePhone('96598765432'), '96598765432'));
  test('returns empty string for empty input', () => assert.equal(normalizePhone(''), ''));
  test('handles number that is all zeros', () => assert.equal(normalizePhone('000'), ''));
});

describe('validatePhoneInput', () => {
  test('valid Kuwait number with + prefix', () => {
    const [valid, error, normalized] = validatePhoneInput('+96598765432');
    assert.equal(valid, true);
    assert.equal(error, null);
    assert.equal(normalized, '96598765432');
  });

  test('valid 7-digit minimum number', () => {
    const [valid, error, normalized] = validatePhoneInput('1234567');
    assert.equal(valid, true);
    assert.equal(error, null);
    assert.equal(normalized, '1234567');
  });

  test('valid 15-digit maximum number', () => {
    const [valid] = validatePhoneInput('123456789012345');
    assert.equal(valid, true);
  });

  test('empty string fails with "required" message', () => {
    const [valid, error, normalized] = validatePhoneInput('');
    assert.equal(valid, false);
    assert.equal(error, 'Phone number is required');
    assert.equal(normalized, '');
  });

  test('blank whitespace fails with "required" message', () => {
    const [valid, error] = validatePhoneInput('   ');
    assert.equal(valid, false);
    assert.equal(error, 'Phone number is required');
  });

  test('email address fails with email message', () => {
    const [valid, error] = validatePhoneInput('user@gmail.com');
    assert.equal(valid, false);
    assert.ok(error!.includes('email address'));
  });

  test('text with no digits fails', () => {
    const [valid, error] = validatePhoneInput('abc');
    assert.equal(valid, false);
    assert.ok(error!.includes('no digits found'));
  });

  test('too short (3 digits) fails with count and minimum', () => {
    const [valid, error, normalized] = validatePhoneInput('123');
    assert.equal(valid, false);
    assert.ok(error!.includes('too short'));
    assert.ok(error!.includes('3'));
    assert.ok(error!.includes('minimum is 7'));
    assert.equal(normalized, '123');
  });

  test('too long (16 digits) fails with count and maximum', () => {
    const [valid, error] = validatePhoneInput('1234567890123456');
    assert.equal(valid, false);
    assert.ok(error!.includes('too long'));
    assert.ok(error!.includes('maximum is 15'));
  });

  test('Arabic digits in valid number pass and normalize', () => {
    const [valid, , normalized] = validatePhoneInput('+\u0669\u0666\u0665\u0669\u0668\u0667\u0666\u0665\u0664\u0663\u0662');
    assert.equal(valid, true);
    assert.equal(normalized, '96598765432');
  });

  test('singular digit message for 1-digit input', () => {
    const [, error] = validatePhoneInput('5');
    assert.ok(error!.includes('1 digit,') || error!.includes('1 digit '));
  });
});
