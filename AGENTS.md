# Coding agent guide

This is a small, local-first JavaScript toolkit, not a bot service or a hosted application. Keep changes scoped. This is the canonical project guide; provider-specific instruction files should point here instead of duplicating it.

## Start here

1. Read [README.md](README.md), [SECURITY.md](SECURITY.md), and the relevant module/test pair below.
2. Check the working tree before editing. Preserve unrelated user changes.
3. Add a focused regression test before changing behavior, especially execution safeguards.
4. Run the smallest relevant test while iterating, then `npm run verify` before delivery.
5. Report actual verification results and blockers. Synthetic tests do not prove a successful live Discord operation.

## Setup and commands

Requires Node.js 20+; CI uses Node.js 22. Development requires no credentials or environment variables.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run verify
```

On Linux, missing browser libraries can be installed with `npx playwright install --with-deps chromium` when system-package installation is permitted. Do not silently skip browser tests or report an environment failure as a pass.

| Task                                | Command                           |
| ----------------------------------- | --------------------------------- |
| Full local/CI gate                  | `npm run verify`                  |
| Formatting                          | `npm run format`                  |
| Syntax and local asset checks       | `npm run check`                   |
| Unit and CLI tests                  | `npm test`                        |
| One regression file                 | `node --test tests/plan.test.cjs` |
| Browser tests                       | `npm run test:browser`            |
| Public collector/reviewer packaging | `npm run build`                   |

The full gate runs formatting checks, syntax checks, unit/CLI tests, browser tests, and packaging. It never connects to Discord.

## Architecture and test seams

| Change                        | Start here                                                                                                                       | Relevant tests                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Server capture                | [collectors/servers.js](collectors/servers.js)                                                                                   | [servers.test.cjs](tests/servers.test.cjs)                                                                     |
| Folder capture                | [collectors/folders.js](collectors/folders.js)                                                                                   | [folders.test.cjs](tests/folders.test.cjs)                                                                     |
| Review validation/persistence | [src/review-model.js](src/review-model.js)                                                                                       | [visual-model.test.cjs](tests/visual-model.test.cjs), [review-account.test.cjs](tests/review-account.test.cjs) |
| Review interface              | [src/review-ui.js](src/review-ui.js), [src/review.css](src/review.css), [index.html](index.html)                                 | [review.spec.cjs](tests/review.spec.cjs)                                                                       |
| Preview and authorization     | [src/plan.js](src/plan.js)                                                                                                       | [plan.test.cjs](tests/plan.test.cjs), [cli.test.cjs](tests/cli.test.cjs)                                       |
| Exact-scope execution         | [src/cleanup-core.js](src/cleanup-core.js)                                                                                       | [cleanup-core.test.cjs](tests/cleanup-core.test.cjs)                                                           |
| Native Discord adapter        | [src/cleanup-native.js](src/cleanup-native.js)                                                                                   | [cleanup-native.test.cjs](tests/cleanup-native.test.cjs), [execution.spec.cjs](tests/execution.spec.cjs)       |
| Browser executor/persistence  | [src/cleanup-entry.js](src/cleanup-entry.js), [src/bundle.js](src/bundle.js)                                                     | [execution.spec.cjs](tests/execution.spec.cjs)                                                                 |
| Result verification           | [src/results.js](src/results.js)                                                                                                 | [results.test.cjs](tests/results.test.cjs)                                                                     |
| CLI/file safety               | [scripts/io.mjs](scripts/io.mjs), [scripts/plan.mjs](scripts/plan.mjs), [scripts/build-executor.mjs](scripts/build-executor.mjs) | [cli.test.cjs](tests/cli.test.cjs)                                                                             |

Data flows in one direction: **read-only captures → review draft → unauthorized preview → explicitly authorized executor → observed result verification**. See the [workflow guide](docs/workflow.md) for schemas and commands, and [development notes](docs/development.md) for native integration references.

## Safety boundaries

- Normal coding, testing, CI, and publishing must never operate a live Discord account. Use [synthetic fixtures](tests/fixtures.cjs) and mocked native controls. This guide grants no permission for account actions; a live operation needs explicit user authorization for exact IDs and scopes.
- Never extract tokens, cookies, passwords, or MFA codes. Do not add credential-storage enumeration, raw-REST fallbacks, or authentication bypasses when a native API changes. Stop on unsupported controls.
- Collectors stay read-only, self-contained pasteable scripts. Do not add network/member requests, message-body access, private-group capture, or imports requiring a bundler.
- The reviewer never executes account actions. Use `textContent` for untrusted data. Keep image URLs validated and CDN loading opt-in.
- Cached friends, member counts, and timestamps stay explicitly partial/unknown. No cached match is not proof of absence; message dates in voice channels are not voice usage. Suggested groups are not user decisions.
- Account IDs and guild IDs are exact strings. Preserve account binding across captures, drafts, plans, and execution. Do not repair malformed IDs or weaken completeness checks.
- Partial captures must retain absent-server history. Known ownership protection must survive missing/null fields. Demo storage stays isolated and demo exports cannot generate execution plans.
- Notes, favorites, and “consider muting” never authorize actions. Owned deletion requires explicit ID selection and separate exact-ID confirmation. Notification changes and private-group cleanup are unsupported scopes.
- Keep execution sequential, with durable before-events and readback verification. Never retry mutations automatically. Stop/error paths must prevent later actions; an in-flight request may still complete.
- Construct native folder payloads through Discord's protobuf message constructors. Preserve unrelated settings and verify folder order, IDs, names, colors, and retained membership. Backups cannot reverse server deletion.
- Schema changes must update collectors, readers, builders, verifiers, and fixtures together. Keep conditional CommonJS exports and browser globals compatible; CLI entrypoints use `.mjs`.

## Scope, privacy, and delivery

- Keep UI copy, documentation, examples, tests, and commit messages in English.
- Prefer existing modules and Node/browser APIs. Runtime commands must remain dependency-free. Do not introduce a framework, backend, or agent platform for a local change.
- Never commit `data/`, `dist/`, exports, real IDs/social graphs, approved plans, generated executors, journals, credentials, browser profiles, `.hermes/`, or agent workspace state. Never force-add ignored files. Screenshots and examples must use fictional data.
- Before committing, run `npm run verify` and `git diff --check`, inspect staged files, and check for private/generated artifacts. Update docs when flags, schemas, or safety behavior change.
- Do not claim native API compatibility from fixture tests. If live verification is unavailable, state the limitation instead of inventing results or weakening safeguards.
