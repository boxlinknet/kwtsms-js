/**
 * SMS message cleaning for kwtSMS.
 * Called automatically by send() before every API call.
 *
 * Strips content that causes silent delivery failure:
 * - Emojis (silently stuck in queue, credits wasted, no error returned)
 * - Hidden control chars: BOM, zero-width space, soft hyphen, etc.
 * - HTML tags (causes ERR027)
 * - Arabic-Indic/Persian digits → Latin (OTP codes render consistently)
 *
 * Arabic LETTERS are fully preserved. Arabic text is supported by kwtSMS.
 */

const ARABIC_INDIC_BASE = 0x0660;
const EXT_ARABIC_INDIC_BASE = 0x06f0;

// Hidden/invisible characters that break delivery or spam filters
const HIDDEN_CHARS = new Set([
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\u2060', // Word joiner
  '\u00AD', // Soft hyphen
  '\uFEFF', // BOM (byte order mark)
  '\uFFFC', // Object replacement character
]);

function isEmojiCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1f02f) ||  // Mahjong tiles, domino tiles
    (cp >= 0x1f0a0 && cp <= 0x1f0ff) ||  // Playing cards
    (cp >= 0x1f1e0 && cp <= 0x1f1ff) ||  // Regional indicator symbols (flags)
    (cp >= 0x1f300 && cp <= 0x1f5ff) ||
    (cp >= 0x1f600 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f700 && cp <= 0x1f77f) ||
    (cp >= 0x1f780 && cp <= 0x1f7ff) ||
    (cp >= 0x1f800 && cp <= 0x1f8ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa00 && cp <= 0x1fa6f) ||
    (cp >= 0x1fa70 && cp <= 0x1faff) ||
    (cp >= 0x2600  && cp <= 0x26ff)  ||
    (cp >= 0x2700  && cp <= 0x27bf)  ||
    (cp >= 0xfe00  && cp <= 0xfe0f)  ||  // Variation selectors
    cp === 0x20e3                    ||  // Combining enclosing keycap
    (cp >= 0xe0000 && cp <= 0xe007f)     // Tags block (subdivision flags)
  );
}

function isControlChar(char: string, cp: number): boolean {
  if (char === '\n' || char === '\t') return false;
  // C0 controls (U+0000-U+001F)
  if (cp <= 0x001f) return true;
  // DEL and C1 controls (U+007F-U+009F)
  if (cp >= 0x007f && cp <= 0x009f) return true;
  // Unicode format chars (Cf): directional marks
  if (cp === 0x200e || cp === 0x200f) return true; // LRM, RLM
  if (cp >= 0x202a && cp <= 0x202e) return true;   // Directional formatting
  if (cp >= 0x2066 && cp <= 0x2069) return true;   // Directional isolates
  return false;
}

/**
 * Clean SMS message text before sending to kwtSMS API.
 * Always called automatically by KwtSMS.send().
 */
export function cleanMessage(text: string): string {
  if (!text) return text;

  // Use Array.from() to correctly iterate Unicode code points
  // (emojis are surrogate pairs in UTF-16, must not split them)
  const chars = Array.from(text);
  const result: string[] = [];

  for (const char of chars) {
    const cp = char.codePointAt(0) ?? 0;

    // 1. Convert Arabic-Indic digits to Latin
    if (cp >= ARABIC_INDIC_BASE && cp <= ARABIC_INDIC_BASE + 9) {
      result.push(String(cp - ARABIC_INDIC_BASE));
      continue;
    }
    if (cp >= EXT_ARABIC_INDIC_BASE && cp <= EXT_ARABIC_INDIC_BASE + 9) {
      result.push(String(cp - EXT_ARABIC_INDIC_BASE));
      continue;
    }

    // 2. Skip emojis
    if (isEmojiCodePoint(cp)) continue;

    // 3. Skip known hidden characters
    if (HIDDEN_CHARS.has(char)) continue;

    // 4. Skip control characters (but \n and \t preserved by isControlChar)
    if (isControlChar(char, cp)) continue;

    result.push(char);
  }

  // 5. Strip HTML tags (after character-level processing)
  return result.join('').replace(/<[^>]*>/g, '');
}
