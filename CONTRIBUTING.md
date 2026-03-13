# Contributing

Contributions are welcome — bug reports, fixes, new examples, and documentation improvements.

## Before You Start

- Search [existing issues](https://github.com/boxlinknet/kwtsms-js/issues) before opening a new one
- For large changes, open an issue first to discuss the approach
- All contributions must pass the existing test suite

## Development Setup

**Prerequisites:** Node.js 18+ (v20 LTS recommended), npm

```bash
# Clone the repo
git clone https://github.com/boxlinknet/kwtsms-js.git
cd kwtsms-js

# Install dev dependencies
npm install

# Verify the setup
npm test
```

`npm test` runs the unit tests. All 98 tests should pass with no live credentials required.

## Running Tests

```bash
# Unit tests only (no credentials needed)
npm run test:unit

# All unit tests (same as above, default test command)
npm test

# Integration tests (requires live credentials in .env)
# Create .env with KWTSMS_USERNAME and KWTSMS_PASSWORD first
node --import tsx/esm --test test/integration.test.ts
```

The integration tests run in test mode (`testMode: true`) — no credits are consumed.

## Build

```bash
# Compile TypeScript → dist/
npm run build

# Outputs:
#   dist/index.js    (ESM)
#   dist/index.cjs   (CommonJS)
#   dist/index.d.ts  (TypeScript declarations)
```

## Project Structure

```
src/
  client.ts      — KwtSMS class (main entry point)
  phone.ts       — phone normalization, validation, PHONE_RULES, maskPhone
  message.ts     — message cleaning (emoji, HTML, hidden chars)
  errors.ts      — error code map and enrichError()
  request.ts     — node:https wrapper
  env.ts         — .env file parser
  logger.ts      — JSONL request logger
  index.ts       — public exports

test/            — gitignored (local only)
  phone.test.ts
  message.test.ts
  errors.test.ts
  client.test.ts
  env.test.ts
  logger.test.ts
  integration.test.ts

examples/
  00-raw-api.ts / .md
  01-basic-usage.ts / .md
  02-otp-flow.ts / .md
  03-bulk-sms.ts / .md
  04-express-endpoint.ts / .md
  05-nextjs-route.ts / .md
  06-otp-production/ (full production OTP example)
```

## Making Changes

### Branch Naming

```
fix/short-description       — bug fix
feat/short-description      — new feature
docs/short-description      — documentation only
test/short-description      — tests only
chore/short-description     — build, tooling, deps
```

### Commit Style

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

Examples:
```
feat: add status() method for message queue lookup
fix: handle ERR028 (15s same-number cooldown) in bulk send
docs: add Next.js App Router example
test: cover Arabic digit normalization edge cases
```

### Code Style

- TypeScript strict mode (`tsconfig.json`)
- No runtime dependencies — use only `node:https`, `node:fs`, `node:readline`, `node:crypto`
- Never throw from public methods — return structured error objects instead
- New public methods must have unit tests before the implementation (TDD)

### Adding a New Method

1. Write the failing test in the appropriate `test/*.test.ts` file
2. Run `npm test` — confirm it fails
3. Implement the minimum code to make the test pass
4. Run `npm test` — confirm it passes
5. Export the new method from `src/index.ts` if it's public
6. Add it to `README.md` under the Methods section
7. Update `CHANGELOG.md` under `[Unreleased]`

## Pull Request Process

1. Fork the repository and create a branch from `master`
2. Make your changes following the style guidelines above
3. Run `npm test` — all tests must pass
4. Run `npm run build` — build must succeed without warnings
5. Update `CHANGELOG.md` under `[Unreleased]` with a brief description
6. Open a pull request against `master`

### PR Checklist

- [ ] Tests added/updated for all changed behavior
- [ ] All existing tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No new runtime dependencies added (zero-dep policy)
- [ ] TypeScript types exported from `src/index.ts` if new public types added

### PR Description Template

```
## What

Brief description of the change.

## Why

Why this change is needed.

## Test plan

- [ ] Unit tests cover the new/changed behavior
- [ ] Integration test (if applicable)
- [ ] Manual test with live API (if applicable)
```

## Reporting Bugs

Open an issue with:

- Node.js version (`node --version`)
- `kwtsms` version (`npm list kwtsms`)
- Minimal reproduction (anonymize credentials and phone numbers)
- Expected vs actual behavior
- Relevant error output

## Security Issues

Do not open public issues for security vulnerabilities. Contact the maintainers directly via the kwtSMS support channel or GitHub private security advisory.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
