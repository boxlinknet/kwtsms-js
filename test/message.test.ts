import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMessage } from '../src/message.ts';

describe('cleanMessage', () => {
  test('preserves plain English text', () => {
    assert.equal(cleanMessage('Hello World'), 'Hello World');
  });

  test('preserves Arabic letters — must NOT strip Arabic text', () => {
    const arabic = 'مرحبا بالعالم';
    assert.equal(cleanMessage(arabic), arabic);
  });

  test('preserves newlines', () => {
    assert.equal(cleanMessage('line1\nline2'), 'line1\nline2');
  });

  test('preserves tabs', () => {
    assert.equal(cleanMessage('col1\tcol2'), 'col1\tcol2');
  });

  test('converts Arabic-Indic digits ١٢٣ → 123', () => {
    // ١٢٣٤٥٦٧٨٩٠ (U+0661-U+0669, U+0660)
    assert.equal(cleanMessage('\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u0660'), '1234567890');
  });

  test('converts Persian digits ۱۲۳ → 123', () => {
    assert.equal(cleanMessage('\u06f1\u06f2\u06f3'), '123');
  });

  test('strips grinning face emoji (U+1F600, surrogate pair \\uD83D\\uDE00)', () => {
    const result = cleanMessage('Hello \uD83D\uDE00 World');
    assert.ok(!result.includes('\uD83D'), 'surrogate high should be stripped');
    assert.ok(!result.includes('\uDE00'), 'surrogate low should be stripped');
    assert.ok(result.includes('Hello'));
    assert.ok(result.includes('World'));
  });

  test('strips party popper emoji (U+1F389)', () => {
    const result = cleanMessage('Done \uD83C\uDF89');
    assert.ok(!result.includes('\uD83C'));
    assert.ok(result.includes('Done'));
  });

  test('strips sun emoji U+2600 (Misc symbols range)', () => {
    const result = cleanMessage('Sunny \u2600 day');
    assert.ok(!result.includes('\u2600'));
    assert.ok(result.includes('Sunny'));
    assert.ok(result.includes('day'));
  });

  test('strips HTML tags', () => {
    assert.equal(cleanMessage('<b>Hello</b> World'), 'Hello World');
  });

  test('strips complex HTML', () => {
    assert.equal(cleanMessage('<p style="color:red">Hi</p>'), 'Hi');
  });

  test('strips BOM U+FEFF', () => {
    assert.equal(cleanMessage('\uFEFFHello'), 'Hello');
  });

  test('strips zero-width space U+200B', () => {
    assert.equal(cleanMessage('Hello\u200BWorld'), 'HelloWorld');
  });

  test('strips soft hyphen U+00AD', () => {
    assert.equal(cleanMessage('Hello\u00ADWorld'), 'HelloWorld');
  });

  test('strips zero-width non-joiner U+200C', () => {
    assert.equal(cleanMessage('Hello\u200CWorld'), 'HelloWorld');
  });

  test('strips zero-width joiner U+200D', () => {
    assert.equal(cleanMessage('Hello\u200DWorld'), 'HelloWorld');
  });

  test('strips word joiner U+2060', () => {
    assert.equal(cleanMessage('Hello\u2060World'), 'HelloWorld');
  });

  test('handles empty string', () => {
    assert.equal(cleanMessage(''), '');
  });

  test('mixed: Arabic text + emoji + BOM + Arabic digits', () => {
    const input = '\uFEFFمرحبا \uD83D\uDE00 \u0661\u0662\u0663';
    const result = cleanMessage(input);
    assert.ok(result.includes('مرحبا'), 'Arabic text preserved');
    assert.ok(result.includes('123'), 'Arabic digits converted');
    assert.ok(!result.includes('\uFEFF'), 'BOM stripped');
    assert.ok(!result.includes('\uD83D'), 'emoji stripped');
  });

  test('OTP message with emoji stripped, digits and text preserved', () => {
    const input = 'Your OTP is: 123456 \uD83C\uDF89';
    const result = cleanMessage(input);
    assert.ok(result.includes('123456'));
    assert.ok(!result.includes('\uD83C'));
  });
});
