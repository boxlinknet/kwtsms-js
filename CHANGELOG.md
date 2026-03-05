# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-03-05

### Added

- CI workflow (`.github/workflows/ci.yml`): runs build and unit tests on Node 18, 20, and 22 on every push and pull request.
- CodeQL workflow (`.github/workflows/codeql.yml`): automated static analysis for JavaScript security vulnerabilities.
- Dependabot (`.github/dependabot.yml`): weekly automated pull requests for npm devDependencies and GitHub Actions version updates.
- `SECURITY.md`: vulnerability reporting policy and security properties.
- CI status badge in `README.md`.

### Changed

- Minimum Node.js version raised from 16 to 18. Node 16 reached end-of-life in September 2023.
- npm keywords expanded: added `otp`, `nodejs`, `bulk-sms`, `sms-gateway`.

### Security

- Source maps (`.map` files) removed from the published npm package. They added 160 KB of build artifacts with no value to consumers.
- npm publish now uses `--provenance`: generates a SLSA attestation linking each published version to its exact GitHub commit.

## [0.2.1] - 2026-03-05

### Added

- `examples/06-otp-production/` — production-ready OTP flow with bcrypt hashing, two-tier sliding-window rate limiting, and CAPTCHA support
  - Core service (`otp-service.ts`): `sendOtp()` and `verifyOtp()` with 13-step security pipeline
  - DB adapters: in-memory, SQLite (better-sqlite3, WAL), Drizzle ORM, Prisma
  - CAPTCHA adapters: Cloudflare Turnstile, hCaptcha (stdlib-only HTTP, 5s timeout, fail-safe false)
  - Framework wiring: node:http, Express, Fastify, Next.js App Router, Hono, NestJS, TanStack Start, Astro, SvelteKit
  - Companion `README.md` covering all DB options, CAPTCHA setup, rate limiting, framework table, security checklist, and common mistakes

### Fixed

- `examples/06-otp-production/usage/node-http.ts`: added 4 KB body size limit to prevent DoS
- `examples/06-otp-production/usage/nextjs.ts`: documented both send and verify POST handler exports in separate route files
- `examples/06-otp-production/adapters/drizzle.ts`: header clarified to SQLite schema (not DB-agnostic)
- `README.md`: removed em dashes used as prose separators

## [0.2.0] - 2026-03-05

### Added

- `send()`: deduplicate normalized phone numbers before sending. `+96598765432` and `0096598765432` now count as one recipient.
- `BulkSendResult`: added `code` and `description` fields from the first failed batch, so bulk and single-send responses share a uniform shape for error handling.
- `test/logger.test.ts`: unit tests for `maskCredentials` and `writeLog`.
- `test/env.test.ts`: unit tests for `.env` parsing edge cases (tab-separated comments, mismatched quotes, missing files).

### Fixed

- `password` field changed to a private JavaScript class field (`#password`). It no longer appears in `JSON.stringify(client)` or any logger output.
- `cleanMessage()`: completed emoji Unicode ranges — added Mahjong tiles, playing cards, flags (regional indicators), keycap combiner (U+20E3), and tags block (U+E0000–U+E007F). Previous version missed these ranges.
- `send()`: empty-message pre-flight check now also applied to the bulk send path (>200 numbers). Previously only checked on single-batch sends.
- `.env` parser: handles tab-separated inline comments and mismatched quotes without crashing.
- `--sender` CLI flag: exits with a clear error when `--sender` is passed without a value.
- Newlines in credential values are now stripped when writing `.env` via `kwtsms setup`.
- `ValidateResult.er` JSDoc clarified to explain mixed normalized/raw format.
- README: added warning that log entries include message bodies and phone numbers (PII).

### Security

- Password stored as a true JavaScript private field (`#`) — inaccessible outside the class, never serialized.

## [0.1.2] - 2026-03-04

### Added

- GitHub Actions workflow (`.github/workflows/publish.yml`): automatically publishes to npm on every `v*` tag push.

### Fixed

- Repository URL format normalized in `package.json`.

## [0.1.1] - 2026-03-04

### Fixed

- Minor packaging and metadata corrections after initial publish.

## [0.1.0] - 2026-03-04

Initial release of the `kwtsms` JavaScript/TypeScript client library.

### Added

**Core client (`KwtSMS`)**
- `KwtSMS` class with zero runtime dependencies (Node.js built-ins only)
- `KwtSMS.fromEnv(envFile?)`: loads credentials from environment variables with `.env` file fallback
- `verify()`: test credentials via `/balance/`, returns `[ok, balance, error]` tuple, never throws
- `balance()`: get current balance with cached fallback
- `send(mobile, message, sender?)`: send SMS to one or more numbers, auto-cleans message, auto-normalizes phones
- `send()` with >200 numbers: auto-batches into groups of 200 with 500ms inter-batch delay
- `validate(phones[])`: validate phone numbers via `/validate/`, with local pre-validation
- `senderids()`: list registered sender IDs
- `coverage()`: list active country coverage prefixes
- `cachedBalance` / `cachedPurchased`: read-only accessors for last seen balance values
- ERR013 retry with exponential backoff (30s / 60s / 120s) for queue-full errors
- `BulkSendResult`: `result: 'OK' | 'PARTIAL' | 'ERROR'`, per-batch error reporting, all msg-ids

**Phone normalization (`normalizePhone`, `validatePhoneInput`)**
- Strip `+`, `00` prefixes, spaces, dashes, dots, parentheses
- Convert Arabic-Indic (U+0660–U+0669) and Extended Arabic-Indic (U+06F0–U+06F9) digits to Latin
- Reject empty, too-short, and non-numeric inputs
- Returns normalized international-format number (digits only)

**Message cleaning (`cleanMessage`)**
- Strip emojis (surrogate-pair safe via `Array.from()` + codepoint ranges)
- Strip hidden control characters: ZWSP, ZWJ, ZWNJ, BOM, soft hyphen, LTR/RTL marks
- Strip HTML tags
- Convert Arabic-Indic and Extended Arabic-Indic digits to Latin
- Preserve Arabic text, `\n`, `\t`, and all other printable characters

**Error handling (`enrichError`, `API_ERRORS`)**
- All 29 kwtSMS error codes (ERR001–ERR033 with gaps) with human-readable descriptions
- `enrichError()` adds an `action` field with a fix hint for known codes
- `ERR_INVALID_INPUT` for local validation failures

**HTTP layer**
- `node:https` only, zero external dependencies
- Always reads full response body regardless of HTTP status
- 15-second request timeout
- JSONL request/response logging to file (passwords masked in logs)

**Environment loader (`loadEnvFile`)**
- Reads KEY=VALUE pairs, strips inline comments
- Returns empty object for missing files, never throws
- Does not modify `process.env`

**CLI (`kwtsms`)**
- `kwtsms setup`, `verify`, `balance`, `senderid`, `coverage`, `send`, `validate`

**Package**
- Dual ESM + CJS output (`dist/index.js` + `dist/index.cjs`)
- TypeScript declarations (`dist/index.d.ts`)
- Zero runtime dependencies

[Unreleased]: https://github.com/boxlinknet/kwtsms-js/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/boxlinknet/kwtsms-js/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/boxlinknet/kwtsms-js/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/boxlinknet/kwtsms-js/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/boxlinknet/kwtsms-js/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/boxlinknet/kwtsms-js/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/boxlinknet/kwtsms-js/releases/tag/v0.1.0
