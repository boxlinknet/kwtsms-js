/**
 * Phone number normalization and validation for the kwtSMS API.
 * Numbers must be in international format, digits only, no leading zeros.
 */

// Arabic-Indic digits: ٠١٢٣٤٥٦٧٨٩ (U+0660–U+0669)
const ARABIC_INDIC_BASE = 0x0660;
// Extended Arabic-Indic / Persian: ۰۱۲۳۴۵۶۷۸۹ (U+06F0–U+06F9)
const EXT_ARABIC_INDIC_BASE = 0x06f0;

function arabicDigitToLatin(char: string): string {
  const cp = char.codePointAt(0) ?? 0;
  if (cp >= ARABIC_INDIC_BASE && cp <= ARABIC_INDIC_BASE + 9) {
    return String(cp - ARABIC_INDIC_BASE);
  }
  if (cp >= EXT_ARABIC_INDIC_BASE && cp <= EXT_ARABIC_INDIC_BASE + 9) {
    return String(cp - EXT_ARABIC_INDIC_BASE);
  }
  return char;
}

/**
 * Normalize phone to kwtSMS format: digits only, no leading zeros.
 *
 * 1. Convert Arabic-Indic and Extended Arabic-Indic digits to Latin
 * 2. Strip every non-digit character (+, spaces, dashes, dots, parens, etc.)
 * 3. Strip leading zeros (handles 00 country code prefix)
 */
export function normalizePhone(phone: string): string {
  let result = [...phone].map(arabicDigitToLatin).join('');
  result = result.replace(/\D/g, '');
  result = result.replace(/^0+/, '');
  return result;
}

/**
 * Validate a raw phone number before sending to the kwtSMS API.
 *
 * Returns: [isValid, error | null, normalized]
 *
 * Never throws. Catches all common mistakes.
 */
export function validatePhoneInput(phone: string): [boolean, string | null, string] {
  const raw = String(phone).trim();

  if (!raw) {
    return [false, 'Phone number is required', ''];
  }

  if (raw.includes('@')) {
    return [false, `'${raw}' is an email address, not a phone number`, ''];
  }

  const normalized = normalizePhone(raw);

  if (!normalized) {
    return [false, `'${raw}' is not a valid phone number, no digits found`, ''];
  }

  if (normalized.length < 7) {
    const n = normalized.length;
    return [
      false,
      `'${raw}' is too short to be a valid phone number (${n} digit${n !== 1 ? 's' : ''}, minimum is 7)`,
      normalized,
    ];
  }

  if (normalized.length > 15) {
    return [
      false,
      `'${raw}' is too long to be a valid phone number (${normalized.length} digits, maximum is 15)`,
      normalized,
    ];
  }

  return [true, null, normalized];
}
