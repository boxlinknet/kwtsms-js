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
  let result = Array.from(phone).map(arabicDigitToLatin).join('');
  result = result.replace(/\D/g, '');
  result = result.replace(/^0+/, '');
  return result;
}

export interface PhoneRule {
  /** Valid local number lengths (digits after country code) */
  localLengths: number[];
  /** Valid first digit(s) of local number for mobile. If omitted, any starting digit accepted. */
  mobileStartDigits?: string[];
}

/**
 * Phone number validation rules by country code.
 * Validates local number length and mobile starting digits.
 *
 * Sources (verified across 3+ per country):
 * [1] ITU-T E.164 / National Numbering Plans (itu.int)
 * [2] Wikipedia "Telephone numbers in [Country]" articles (en.wikipedia.org)
 * [3] HowToCallAbroad.com country dialing guides
 * [4] CountryCode.com country format pages
 *
 * localLengths: valid digit count(s) AFTER country code
 *   e.g. Kuwait 965 + 8 local digits = 11 total digits
 * mobileStartDigits: valid first character(s) of the local number
 *   e.g. Kuwait ["4","5","6","9"] means 9xxxxxxx, 6xxxxxxx, 5xxxxxxx, 4xxxxxxx
 *
 * Countries not listed here pass through with generic E.164 validation (7-15 digits).
 */
export const PHONE_RULES: Record<string, PhoneRule> = {
  // === GCC ===
  "965": { localLengths: [8], mobileStartDigits: ["4", "5", "6", "9"] },       // Kuwait: 4x=Virgin/STC, 5x=STC/Zain, 6x=Ooredoo, 9x=Zain
  "966": { localLengths: [9], mobileStartDigits: ["5"] },                       // Saudi Arabia: 50-59
  "971": { localLengths: [9], mobileStartDigits: ["5"] },                       // UAE: 50,52-56,58
  "973": { localLengths: [8], mobileStartDigits: ["3", "6"] },                  // Bahrain: 3x,6x
  "974": { localLengths: [8], mobileStartDigits: ["3", "5", "6", "7"] },        // Qatar: 33,55,66,77
  "968": { localLengths: [8], mobileStartDigits: ["7", "9"] },                  // Oman: 7x,9x
  // === Levant ===
  "962": { localLengths: [9], mobileStartDigits: ["7"] },                       // Jordan: 75,77,78,79
  "961": { localLengths: [7, 8], mobileStartDigits: ["3", "7", "8"] },          // Lebanon: 3x (legacy 7-digit), 7x/81 (8-digit)
  "970": { localLengths: [9], mobileStartDigits: ["5"] },                       // Palestine: 56=Jawwal, 59=Ooredoo
  "964": { localLengths: [10], mobileStartDigits: ["7"] },                      // Iraq: 75-79
  "963": { localLengths: [9], mobileStartDigits: ["9"] },                       // Syria: 93-96,98,99
  // === Other Arab ===
  "967": { localLengths: [9], mobileStartDigits: ["7"] },                       // Yemen: 70,71,73,77
  "20":  { localLengths: [10], mobileStartDigits: ["1"] },                      // Egypt: 10,11,12,15
  "218": { localLengths: [9], mobileStartDigits: ["9"] },                       // Libya: 91-95
  "216": { localLengths: [8], mobileStartDigits: ["2", "4", "5", "9"] },        // Tunisia: 2x,4x=MVNO,5x,9x
  "212": { localLengths: [9], mobileStartDigits: ["6", "7"] },                  // Morocco: 6x,7x
  "213": { localLengths: [9], mobileStartDigits: ["5", "6", "7"] },             // Algeria: 5x,6x,7x
  "249": { localLengths: [9], mobileStartDigits: ["9"] },                       // Sudan: 90,91,92,96,99
  // === Non-Arab Middle East ===
  "98":  { localLengths: [10], mobileStartDigits: ["9"] },                      // Iran: 9x
  "90":  { localLengths: [10], mobileStartDigits: ["5"] },                      // Turkey: 5x
  "972": { localLengths: [9], mobileStartDigits: ["5"] },                       // Israel: 50,52-55,58
  // === South Asia ===
  "91":  { localLengths: [10], mobileStartDigits: ["6", "7", "8", "9"] },       // India: 6-9x
  "92":  { localLengths: [10], mobileStartDigits: ["3"] },                      // Pakistan: 3x
  "880": { localLengths: [10], mobileStartDigits: ["1"] },                      // Bangladesh: 1x
  "94":  { localLengths: [9], mobileStartDigits: ["7"] },                       // Sri Lanka: 70-78
  "960": { localLengths: [7], mobileStartDigits: ["7", "9"] },                  // Maldives: 7x,9x
  // === East Asia ===
  "86":  { localLengths: [11], mobileStartDigits: ["1"] },                      // China: 13-19x
  "81":  { localLengths: [10], mobileStartDigits: ["7", "8", "9"] },            // Japan: 70,80,90
  "82":  { localLengths: [10], mobileStartDigits: ["1"] },                      // South Korea: 010
  "886": { localLengths: [9], mobileStartDigits: ["9"] },                       // Taiwan: 9x
  // === Southeast Asia ===
  "65":  { localLengths: [8], mobileStartDigits: ["8", "9"] },                  // Singapore: 8x,9x
  "60":  { localLengths: [9, 10], mobileStartDigits: ["1"] },                   // Malaysia: 1x (9 or 10 digits)
  "62":  { localLengths: [9, 10, 11, 12], mobileStartDigits: ["8"] },           // Indonesia: 8x (variable length)
  "63":  { localLengths: [10], mobileStartDigits: ["9"] },                      // Philippines: 9x
  "66":  { localLengths: [9], mobileStartDigits: ["6", "8", "9"] },             // Thailand: 6x,8x,9x
  "84":  { localLengths: [9], mobileStartDigits: ["3", "5", "7", "8", "9"] },   // Vietnam: 3x,5x,7x,8x,9x
  "95":  { localLengths: [9], mobileStartDigits: ["9"] },                       // Myanmar: 9x
  "855": { localLengths: [8, 9], mobileStartDigits: ["1", "6", "7", "8", "9"] },// Cambodia: mixed lengths
  "976": { localLengths: [8], mobileStartDigits: ["6", "8", "9"] },             // Mongolia: 6x,8x,9x
  // === Europe ===
  "44":  { localLengths: [10], mobileStartDigits: ["7"] },                      // UK: 7x
  "33":  { localLengths: [9], mobileStartDigits: ["6", "7"] },                  // France: 6x,7x
  "49":  { localLengths: [10, 11], mobileStartDigits: ["1"] },                  // Germany: 15x,16x,17x
  "39":  { localLengths: [10], mobileStartDigits: ["3"] },                      // Italy: 3x
  "34":  { localLengths: [9], mobileStartDigits: ["6", "7"] },                  // Spain: 6x,7x
  "31":  { localLengths: [9], mobileStartDigits: ["6"] },                       // Netherlands: 6x
  "32":  { localLengths: [9] },                                                  // Belgium: length only (complex prefixes)
  "41":  { localLengths: [9], mobileStartDigits: ["7"] },                       // Switzerland: 74-79
  "43":  { localLengths: [10], mobileStartDigits: ["6"] },                      // Austria: 65x-69x
  "47":  { localLengths: [8], mobileStartDigits: ["4", "9"] },                  // Norway: 4x,9x
  "48":  { localLengths: [9] },                                                  // Poland: length only (complex prefixes)
  "30":  { localLengths: [10], mobileStartDigits: ["6"] },                      // Greece: 69x
  "420": { localLengths: [9], mobileStartDigits: ["6", "7"] },                  // Czech Republic: 6x,7x
  "46":  { localLengths: [9], mobileStartDigits: ["7"] },                       // Sweden: 7x
  "45":  { localLengths: [8] },                                                  // Denmark: length only (complex prefixes)
  "40":  { localLengths: [9], mobileStartDigits: ["7"] },                       // Romania: 7x
  "36":  { localLengths: [9] },                                                  // Hungary: length only (complex prefixes)
  "380": { localLengths: [9] },                                                  // Ukraine: length only (complex prefixes)
  // === Americas ===
  "1":   { localLengths: [10] },                                                 // USA/Canada: no mobile-specific prefix
  "52":  { localLengths: [10] },                                                 // Mexico: no mobile-specific prefix since 2019
  "55":  { localLengths: [11] },                                                 // Brazil: area code + 9 + subscriber
  "57":  { localLengths: [10], mobileStartDigits: ["3"] },                      // Colombia: 3x
  "54":  { localLengths: [10], mobileStartDigits: ["9"] },                      // Argentina: 9 + area + subscriber
  "56":  { localLengths: [9], mobileStartDigits: ["9"] },                       // Chile: 9x
  "58":  { localLengths: [10], mobileStartDigits: ["4"] },                      // Venezuela: 4x
  "51":  { localLengths: [9], mobileStartDigits: ["9"] },                       // Peru: 9x
  "593": { localLengths: [9], mobileStartDigits: ["9"] },                       // Ecuador: 9x
  "53":  { localLengths: [8], mobileStartDigits: ["5", "6"] },                  // Cuba: 5x,6x
  // === Africa ===
  "27":  { localLengths: [9], mobileStartDigits: ["6", "7", "8"] },             // South Africa: 6x,7x,8x
  "234": { localLengths: [10], mobileStartDigits: ["7", "8", "9"] },            // Nigeria: 70,71,80,81,90,91
  "254": { localLengths: [9], mobileStartDigits: ["1", "7"] },                  // Kenya: 1x,7x
  "233": { localLengths: [9], mobileStartDigits: ["2", "5"] },                  // Ghana: 2x,5x
  "251": { localLengths: [9], mobileStartDigits: ["7", "9"] },                  // Ethiopia: 7x,9x
  "255": { localLengths: [9], mobileStartDigits: ["6", "7"] },                  // Tanzania: 6x,7x
  "256": { localLengths: [9], mobileStartDigits: ["7"] },                       // Uganda: 7x
  "237": { localLengths: [9], mobileStartDigits: ["6"] },                       // Cameroon: 6x
  "225": { localLengths: [10] },                                                 // Ivory Coast: length only (01,05,07 prefixes)
  "221": { localLengths: [9], mobileStartDigits: ["7"] },                       // Senegal: 7x
  "252": { localLengths: [9], mobileStartDigits: ["6", "7"] },                  // Somalia: 6x,7x
  "250": { localLengths: [9], mobileStartDigits: ["7"] },                       // Rwanda: 7x
  // === Oceania ===
  "61":  { localLengths: [9], mobileStartDigits: ["4"] },                       // Australia: 4x
  "64":  { localLengths: [8, 9, 10], mobileStartDigits: ["2"] },                // New Zealand: 21,22,27-29
};

export const COUNTRY_NAMES: Record<string, string> = {
  // Middle East & North Africa
  "965": "Kuwait",
  "966": "Saudi Arabia",
  "971": "UAE",
  "973": "Bahrain",
  "974": "Qatar",
  "968": "Oman",
  "962": "Jordan",
  "961": "Lebanon",
  "970": "Palestine",
  "964": "Iraq",
  "963": "Syria",
  "967": "Yemen",
  "98": "Iran",
  "90": "Turkey",
  "972": "Israel",
  "20": "Egypt",
  "218": "Libya",
  "216": "Tunisia",
  "212": "Morocco",
  "213": "Algeria",
  "249": "Sudan",
  "211": "South Sudan",
  // Africa
  "27": "South Africa",
  "234": "Nigeria",
  "254": "Kenya",
  "233": "Ghana",
  "251": "Ethiopia",
  "255": "Tanzania",
  "256": "Uganda",
  "237": "Cameroon",
  "225": "Ivory Coast",
  "221": "Senegal",
  "258": "Mozambique",
  "260": "Zambia",
  "263": "Zimbabwe",
  "250": "Rwanda",
  "243": "DR Congo",
  "242": "Congo",
  "226": "Burkina Faso",
  "223": "Mali",
  "227": "Niger",
  "235": "Chad",
  "261": "Madagascar",
  "244": "Angola",
  "252": "Somalia",
  "253": "Djibouti",
  "291": "Eritrea",
  "222": "Mauritania",
  "220": "Gambia",
  "224": "Guinea",
  "232": "Sierra Leone",
  "231": "Liberia",
  "228": "Togo",
  "229": "Benin",
  "230": "Mauritius",
  "236": "Central African Republic",
  "238": "Cape Verde",
  "239": "Sao Tome and Principe",
  "240": "Equatorial Guinea",
  "241": "Gabon",
  "245": "Guinea-Bissau",
  "246": "Diego Garcia",
  "247": "Ascension Island",
  "248": "Seychelles",
  "257": "Burundi",
  "262": "Reunion",
  "264": "Namibia",
  "265": "Malawi",
  "266": "Lesotho",
  "267": "Botswana",
  "268": "Eswatini",
  "269": "Comoros",
  // Europe
  "44": "UK",
  "33": "France",
  "49": "Germany",
  "39": "Italy",
  "34": "Spain",
  "31": "Netherlands",
  "32": "Belgium",
  "41": "Switzerland",
  "43": "Austria",
  "46": "Sweden",
  "47": "Norway",
  "45": "Denmark",
  "358": "Finland",
  "353": "Ireland",
  "351": "Portugal",
  "48": "Poland",
  "420": "Czech Republic",
  "421": "Slovakia",
  "36": "Hungary",
  "40": "Romania",
  "359": "Bulgaria",
  "30": "Greece",
  "385": "Croatia",
  "386": "Slovenia",
  "381": "Serbia",
  "387": "Bosnia and Herzegovina",
  "389": "North Macedonia",
  "382": "Montenegro",
  "355": "Albania",
  "383": "Kosovo",
  "370": "Lithuania",
  "371": "Latvia",
  "372": "Estonia",
  "380": "Ukraine",
  "375": "Belarus",
  "373": "Moldova",
  "7": "Russia/Kazakhstan",
  "354": "Iceland",
  "352": "Luxembourg",
  "356": "Malta",
  "357": "Cyprus",
  "350": "Gibraltar",
  "376": "Andorra",
  "377": "Monaco",
  "378": "San Marino",
  "379": "Vatican City",
  "423": "Liechtenstein",
  // Americas
  "1": "USA/Canada",
  "52": "Mexico",
  "55": "Brazil",
  "54": "Argentina",
  "57": "Colombia",
  "56": "Chile",
  "58": "Venezuela",
  "51": "Peru",
  "593": "Ecuador",
  "591": "Bolivia",
  "595": "Paraguay",
  "598": "Uruguay",
  "53": "Cuba",
  "506": "Costa Rica",
  "507": "Panama",
  "502": "Guatemala",
  "503": "El Salvador",
  "504": "Honduras",
  "505": "Nicaragua",
  "509": "Haiti",
  "592": "Guyana",
  "597": "Suriname",
  "501": "Belize",
  "599": "Curacao",
  // Caribbean
  "876": "Jamaica",
  "868": "Trinidad and Tobago",
  // Asia
  "91": "India",
  "92": "Pakistan",
  "93": "Afghanistan",
  "86": "China",
  "81": "Japan",
  "82": "South Korea",
  "850": "North Korea",
  "852": "Hong Kong",
  "853": "Macau",
  "886": "Taiwan",
  "65": "Singapore",
  "60": "Malaysia",
  "62": "Indonesia",
  "63": "Philippines",
  "66": "Thailand",
  "84": "Vietnam",
  "855": "Cambodia",
  "856": "Laos",
  "95": "Myanmar",
  "977": "Nepal",
  "880": "Bangladesh",
  "94": "Sri Lanka",
  "960": "Maldives",
  "975": "Bhutan",
  "976": "Mongolia",
  "992": "Tajikistan",
  "993": "Turkmenistan",
  "994": "Azerbaijan",
  "995": "Georgia",
  "996": "Kyrgyzstan",
  "998": "Uzbekistan",
  "374": "Armenia",
  // Oceania
  "61": "Australia",
  "64": "New Zealand",
  "679": "Fiji",
  "675": "Papua New Guinea",
  "676": "Tonga",
  "685": "Samoa",
  "678": "Vanuatu",
  "677": "Solomon Islands",
  "686": "Kiribati",
  "674": "Nauru",
  "688": "Tuvalu",
  "691": "Micronesia",
  "692": "Marshall Islands",
  "680": "Palau",
};

/**
 * Find the country code prefix from a normalized phone number.
 * Tries 3-digit codes first, then 2-digit, then 1-digit (longest match wins).
 */
export function findCountryCode(normalized: string): string | null {
  if (normalized.length >= 3) {
    const cc3 = normalized.slice(0, 3);
    if (PHONE_RULES[cc3]) return cc3;
  }
  if (normalized.length >= 2) {
    const cc2 = normalized.slice(0, 2);
    if (PHONE_RULES[cc2]) return cc2;
  }
  if (normalized.length >= 1) {
    const cc1 = normalized.slice(0, 1);
    if (PHONE_RULES[cc1]) return cc1;
  }
  return null;
}

/**
 * Validate a normalized phone number against country-specific format rules.
 * Checks local number length and mobile starting digits.
 * Numbers with no matching country rules pass through (generic E.164 only).
 */
export function validatePhoneFormat(normalized: string): { valid: boolean; error?: string } {
  const cc = findCountryCode(normalized);
  if (!cc) return { valid: true };

  const rule = PHONE_RULES[cc];
  const local = normalized.slice(cc.length);
  const country = COUNTRY_NAMES[cc] ?? `+${cc}`;

  if (!rule.localLengths.includes(local.length)) {
    const expected = rule.localLengths.join(' or ');
    return {
      valid: false,
      error: `Invalid ${country} number: expected ${expected} digits after +${cc}, got ${local.length}`,
    };
  }

  if (rule.mobileStartDigits && rule.mobileStartDigits.length > 0) {
    const hasValidPrefix = rule.mobileStartDigits.some((prefix) => local.startsWith(prefix));
    if (!hasValidPrefix) {
      return {
        valid: false,
        error: `Invalid ${country} mobile number: after +${cc} must start with ${rule.mobileStartDigits.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Mask a phone number for display, showing only the first 4 and last 3 digits.
 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '****';
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-3);
  const masked = '*'.repeat(phone.length - 7);
  return `${prefix}${masked}${suffix}`;
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

  let candidate = normalized;
  const formatCheck = validatePhoneFormat(candidate);
  if (!formatCheck.valid) {
    // Strip a redundant local leading zero (e.g. 9660559... → 966559...)
    // This handles numbers entered as <country code> + local-with-leading-zero
    const cc = findCountryCode(candidate);
    if (cc) {
      const local = candidate.slice(cc.length);
      if (local.startsWith('0')) {
        const stripped = cc + local.slice(1);
        const retryCheck = validatePhoneFormat(stripped);
        if (retryCheck.valid) {
          candidate = stripped;
        } else {
          return [false, formatCheck.error ?? 'Invalid phone number format', normalized];
        }
      } else {
        return [false, formatCheck.error ?? 'Invalid phone number format', normalized];
      }
    } else {
      return [false, formatCheck.error ?? 'Invalid phone number format', normalized];
    }
  }

  return [true, null, candidate];
}
