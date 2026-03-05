# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-05

Initial release of the `kwtsms` JavaScript/TypeScript client library.

### Added

**Core client (`KwtSMS`)**
- `KwtSMS` class with zero runtime dependencies (Node.js built-ins only)
- `KwtSMS.fromEnv(envFile?)` — loads credentials from environment variables with `.env` file fallback
- `verify()` — test credentials via `/balance/`, returns `[ok, balance, error]` tuple, never throws
- `balance()` — get current balance with cached fallback
- `send(mobile, message, sender?)` — send SMS to one or more numbers, auto-cleans message, auto-normalizes phones
- `send()` with >200 numbers — auto-batches into groups of 200 with 500ms inter-batch delay
- `validate(phones[])` — validate phone numbers via `/validate/`, with local pre-validation
- `senderids()` — list registered sender IDs
- `coverage()` — list active country coverage prefixes
- `cachedBalance` / `cachedPurchased` — read-only accessors for last seen balance values
- ERR013 retry with exponential backoff (30s / 60s / 120s) for queue-full errors
- `BulkSendResult` — `result: 'OK' | 'PARTIAL' | 'ERROR'`, per-batch error reporting, all msg-ids

**Phone normalization (`normalizePhone`, `validatePhoneInput`)**
- Strip `+`, `00` prefixes, spaces, dashes, dots, parentheses
- Convert Arabic-Indic (U+0660–U+0669) and Extended Arabic-Indic (U+06F0–U+06F9) digits to Latin
- Reject empty, too-short, and non-numeric inputs
- Returns normalized international-format number (digits only)

**Message cleaning (`cleanMessage`)**
- Strip emojis (surrogate-pair safe via `Array.from()` + codepoint ranges)
- Strip 7 hidden control characters: ZWSP, ZWJ, ZWNJ, BOM, soft hyphen, LTR/RTL marks
- Strip HTML tags (`/<[^>]*>/g`)
- Convert Arabic-Indic and Extended Arabic-Indic digits to Latin
- Preserve Arabic text, `\n`, `\t`, and all other printable characters

**Error handling (`enrichError`, `API_ERRORS`)**
- All 29 kwtSMS error codes (ERR001–ERR033 with gaps) with human-readable descriptions
- `enrichError()` adds an `action` field with a fix hint for known codes
- `ERR_INVALID_INPUT` for local validation failures

**HTTP layer (`apiRequest`)**
- `node:https` only — zero external dependencies
- Always reads full response body regardless of HTTP status (kwtSMS returns JSON in 4xx bodies)
- 15-second request timeout
- JSONL request/response logging to file (passwords masked in logs)

**Environment loader (`loadEnvFile`)**
- Reads KEY=VALUE pairs, strips inline `# comments` from unquoted values
- Returns empty object for missing files (never throws)
- Does not modify `process.env`

**CLI (`kwtsms`)**
- `kwtsms setup` — interactive credential setup, writes `.env`, chmod 600, lists sender IDs
- `kwtsms verify` — test credentials and show balance
- `kwtsms balance` — show current balance
- `kwtsms senderid` — list registered sender IDs
- `kwtsms coverage` — list active country coverage
- `kwtsms send <phone> <message>` — send SMS from command line
- `kwtsms validate <phone...>` — validate one or more phone numbers

**Package**
- Dual ESM + CJS output via `tsup` (`dist/index.js` + `dist/index.cjs`)
- TypeScript declarations (`dist/index.d.ts`)
- `"type": "module"`, Node.js 16+ engine requirement
- Zero runtime dependencies

**Tests**
- `test/errors.test.ts` — 8 tests (error code lookup, enrichError)
- `test/phone.test.ts` — 23 tests (normalization, validation, Arabic digits, edge cases)
- `test/message.test.ts` — 20 tests (emoji stripping, HTML, hidden chars, Arabic digits)
- `test/client.test.ts` — 17 tests (mocked API, bulk batching, error paths)
- `test/integration.test.ts` — 10 tests (live API, skipped without credentials)

**Documentation**
- `README.md` with quickstart (ESM + CJS), all methods, credential management, error codes
- `examples/` directory with 5 runnable TypeScript examples + companion markdown docs

[Unreleased]: https://github.com/boxlinknet/kwtsms-js/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/boxlinknet/kwtsms-js/releases/tag/v0.1.0
