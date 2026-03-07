# CLAUDE.md — kwtsms-js project instructions

## Commit rules

- NEVER add `Co-Authored-By`, `Co-authored-by`, or any Claude/AI attribution line to commit messages.
- NEVER mention Claude, Anthropic, or any AI tool name in commit messages, file contents, comments, or changelogs.
- Commit messages must contain only the author's own name and work description.
- Do not add any signature, trailer, or footer that references an AI assistant.

## Writing rules

- No em dashes or hyphens as sentence separators in prose. Use commas, colons, or periods.
- Hyphens OK for compound words (e.g., zero-dependency, case-sensitive).
- Range en dashes OK (e.g., 3–5 minutes).

## Project rules

- Zero runtime dependencies. Use only Node.js built-ins (node:https, node:fs, node:util, node:crypto).
- Build tool: tsup. Test runner: node:test.
- TypeScript import paths in src/ must end with .js (not .ts). tsup resolves them at build time.
- Use Array.from(text) before iterating strings that may contain emoji (surrogate pairs).
- .github/ directory is committed (contains GitHub Actions workflow). Do NOT add it to .gitignore.
- docs/ directory is gitignored (internal PRDs and planning docs, local only).
- Integration tests use language-prefixed env vars: JS_USERNAME, JS_PASSWORD (not KWTSMS_USERNAME).

## Release checklist

Run these steps in order for every release. No skipping.

1. Verify all tests pass: `npm run test:unit`
2. Update `CHANGELOG.md`: move `[Unreleased]` items to a new `[X.Y.Z] - YYYY-MM-DD` section. No em dashes in entries.
3. Edit `package.json` version field to match.
4. Stage and commit: `git add CHANGELOG.md package.json` then `git commit -m "chore: release vX.Y.Z"`
5. Create tag: `git tag vX.Y.Z`
6. Push commit: `git push origin master`
7. Push tag: `git push origin vX.Y.Z` (triggers GitHub Actions which builds, tests, publishes to npm, and creates the GitHub Release with notes from CHANGELOG automatically)
8. Verify the Actions run succeeded: `gh run list --limit 3`
9. Verify npm: `npm view kwtsms version`

### Conventional commit types

- `feat:` new feature (triggers minor version bump)
- `fix:` bug fix (triggers patch bump)
- `docs:` documentation only, no code change
- `test:` tests only, no production code change
- `chore:` maintenance — version bumps, dependency updates, CI changes
- `refactor:` code restructure with no behavior change
