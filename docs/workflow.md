# Workflow

## 1. Capture without changing the account

Use an existing logged-in Discord Desktop session with Vencord. Inspect `collectors/servers.js` in a text editor, open Discord DevTools → Console (`Ctrl+Shift+I` on Windows/Linux), and paste the script. Run `collectors/folders.js` the same way.

Do not double-click JavaScript files in Windows Script Host. If DevTools is unavailable or a security warning appears, stop and consult Vencord's documentation; do not disable protections to continue.

The scripts download:

- `discord-servers-visual.json`: current account ID, server metadata, validated icon/avatar URLs, partial cached friend matches, and available channel timestamps.
- `discord-folders-current.json`: current account ID and the native folder order, IDs, names, and colors.

They do not extract tokens, request extra members, read messages, navigate conversations, or mutate the account. The account ID is a public-style identifier, not a credential; it binds later execution to the correct logged-in account.

Create a local `data/` directory. Copy the downloads into it as `inventory.json` and `folders.json`. Keep the original folder snapshot as a backup. Never commit exports, even if you own every listed server.

On Windows, the optional clipboard helper only copies a local script:

```powershell
powershell -NoProfile -File tools/copy-script.ps1 -ScriptPath collectors/servers.js
```

If a policy blocks the helper, use a text editor instead of changing execution policies.

## 2. Review one server at a time

Open `index.html` directly in a browser. No server or installation is required. Import `data/inventory.json`.

- **Keep** retains membership.
- **Propose leaving** selects an ordinary departure, not a deletion.
- **Consider muting** is an annotation; this project never changes notification settings.
- **To review** retains membership until you decide otherwise.

Use search, friend chips, Previous/Next, notes, favorites, and suggested groups. **New group** creates a custom folder group, such as `Friends · Local` or `Work`. Groups are editable suggestions, not confirmed social relationships. Favorites do not automatically pin a server in Discord.

Friends are only cached matches. Timestamps may come from announcements, bots, voice-channel text, or a partial channel set. Neither a recent timestamp nor an old one establishes actual human participation. Use your own context before deciding.

Images are off by default. Opting in loads validated icon/avatar URLs from Discord CDN, without sending the inventory or notes to a backend.

The reviewer saves progress in that browser when storage is available. Download a draft regularly as a backup, and save it as `data/decisions.json`. Refreshing an inventory preserves matching-ID decisions and retains absent-server notes in a separate history. Demo storage is isolated; demo exports cannot become an execution plan. Use separate browser profiles for different real accounts.

## 3. Create a preview

Node.js 20+ is needed from this point. No `npm install` is required for these runtime commands.

```sh
npm run plan -- --inventory data/inventory.json --decisions data/decisions.json --folders data/folders.json
```

This writes `data/plan.json` with `execution_authorized: false`. Inspect its exact departure IDs, deletion IDs, retained set, and folder layout. The CLI also prints the selected departure/deletion names. It does not execute anything.

Useful options:

```sh
# Keep one retained server first, outside folders. Replace SERVER_ID.
npm run plan -- --inventory data/inventory.json --decisions data/decisions.json --folders data/folders.json --pin SERVER_ID

# Leave selected servers without reorganizing folders.
npm run plan -- --inventory data/inventory.json --decisions data/decisions.json --folders data/folders.json --no-organize
```

Use `--pin` repeatedly for several standalone servers, in their desired order. Default folder names come from your draft's custom groups, otherwise the reviewer's suggested groups. Owned servers without a custom group go under `My servers`.

For an exact custom layout, pass `--layout data/layout.json`. It must place every retained, unpinned server exactly once:

```json
{
  "folders": [
    { "name": "Friends", "color": "#5865F2", "guild_ids": ["REPLACE_WITH_REAL_SERVER_ID"] },
    { "name": "Resources", "guild_ids": ["REPLACE_WITH_ANOTHER_RETAINED_SERVER_ID"] }
  ]
}
```

Replace all placeholders. IDs must remain exact strings, not JSON numbers. Existing uniquely named matching folders retain their IDs and colors unless you supply another color. Other folders get new IDs. This is a single-level native layout; use prefixes for subgroups.

A membership mismatch between inventory, decisions, and folder capture blocks planning. Capture again, import the new inventory into the reviewer, restore your decisions, and export an updated draft. Do not repair IDs or remove validation checks to get past an error.

Commands refuse to overwrite existing generated files unless you explicitly add `--overwrite`. Generated files inside this repository must go under ignored `data/` or `dist/`; external output paths are also supported.

### Optional owned-server deletion

The reviewer protects owned servers from ordinary departures. To request deletion, explicitly add `--delete-owned OWNED_SERVER_ID` when creating the preview. Repeat the option for each target. The captured ownership must match the account.

A note saying “delete this server” is **never** interpreted as an instruction. Deletion is irreversible, affects other members, and cannot be undone with a folder backup.

## 4. Explicitly authorize and build the executor

For a preview containing departures and organization:

```sh
npm run build:executor -- --plan data/plan.json --authorize-leave --authorize-folders
```

For a departure-only preview made with `--no-organize`, omit `--authorize-folders`. For organization only, keep all memberships and use only `--authorize-folders`.

If the preview contains owned-server deletions, also pass `--authorize-delete` and confirm every exact ID:

```sh
npm run build:executor -- --plan data/plan.json --authorize-leave --authorize-folders --authorize-delete --confirm-delete OWNED_SERVER_ID
```

Repeat `--confirm-delete` for each deletion. The confirmation set must exactly match the preview. Flags do not add actions that were absent from the preview.

This creates private `dist/execute-cleanup.js`; it still does not run anything. Inspect the file. It contains the exact account-bound plan and the execution code, not credentials. Never publish or share it.

## 5. Execute in Vencord

Paste your generated script into the Vencord console. Loading it only opens a panel and checks capabilities; **Start approved cleanup** is required to begin.

The executor:

1. Checks the current account, captured membership, required native controls, and ownership.
2. Records a before-state backup and durable progress in its dedicated IndexedDB database.
3. Performs approved departures sequentially, followed by explicit owned-server deletions.
4. Verifies each target is absent before proceeding.
5. If requested, updates only the approved retained-folder layout and reads it back.
6. Checks the final retained membership and exports `discord-cleanup-result.json`.

Discord may request MFA or another native confirmation. Complete it yourself in Discord; do not supply credentials to this toolkit. Do not switch accounts or join/leave unrelated servers during a run.

If anything fails, times out, or cannot be verified, later actions are not attempted. Do not blindly rerun. Download the result, inspect the affected target in Discord, and create a fresh reviewed plan if needed. A timeout can leave a request in flight. Stop cannot cancel that request or reverse prior actions. Already-absent approved targets are reported separately, never credited as actions performed by the current run.

## 6. Verify and keep a private record

Save the exported result as `data/result.json`:

```sh
npm run verify:result -- --plan data/plan.json --result data/result.json
```

Verification checks exact action IDs, result outcomes, source hashes, before/after membership, and requested folder order/names/colors. It uses exported native-client evidence, not a separate Discord API request. A failed or partial result cannot be labeled complete by this command.

Finally, reload Discord normally and check that the organization persisted. Keep your private snapshots, plan, and result if you want an audit trail. Folder snapshots cannot recover deleted servers, and departed communities may require fresh invitations.
