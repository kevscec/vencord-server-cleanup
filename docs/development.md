# Development

## Small by design

The reviewer is plain HTML, CSS, and JavaScript. Node's standard library handles planning, bundle generation, and result verification. Playwright is a development-only dependency.

```text
collectors/       Read-only scripts run inside Vencord
src/review-*      Local reviewer and persistence model
src/demo.js       Fictional demo data only
src/plan.js       Preview creation and explicit authorization
src/cleanup-*    Scope validation, native adapter, and execution panel
src/results.js    Exported-result verification
scripts/          Local CLI tools, syntax checks, and packaging
tests/            Synthetic unit, CLI, and browser tests
```

`npm run build` writes standalone capture scripts and a copy of the static reviewer under `dist/`. It does not include an account, plan, or executor. `npm run build:executor` is a separate explicit operation requiring your own private preview.

## Verification

- `npm run check`: JavaScript syntax and local app asset references.
- `npm test`: validation, cache semantics, persistence, account binding, scope checks, native-adapter fixtures, CLI generation, and result verification.
- `npm run test:browser`: real Chromium interactions with fictional data and mocked native Discord controls.
- `npm run build`: packages only the public reviewer and collectors.

No test logs into Discord, joins or leaves a server, or uses credentials. Do not turn CI into a live-account integration test.

## Native integration

The adapters depend on Vencord's Webpack lookup utilities and Discord internals. Membership actions are discovered only when needed. Folder messages are constructed through the native `PreloadedUserSettings` protobuf type rather than guessing wrapper/uint64 representations.

The read-only and mutation stages are separate files. Keep this boundary intact when extending the project. New account actions need their own explicit scope, tests, approval flow, and result verification—not an extra heuristic in the reviewer.

Useful references:

- [Vencord](https://github.com/Vendicated/Vencord)
- [Vencord FAQ](https://vencord.dev/faq/)
- [Discord's automated-user-account policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)

API compatibility can break without notice. Do not add token-extraction or raw-REST fallbacks to hide an unsupported native API.
