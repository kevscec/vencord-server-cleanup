# Security and privacy

## Trust boundary

Console scripts run inside your authenticated Discord client. Not copying a token does **not** make arbitrary scripts safe. Inspect the code you run; never paste a script from an untrusted source or share passwords, user tokens, MFA codes, or recovery codes.

The collectors use allowlisted, already-loaded Vencord stores. They do not read message bodies, request members, enumerate authentication storage, or perform account mutations. They export the current account ID to bind later plans to the correct account. An account ID is not an authentication token, but exports still contain private social metadata.

The reviewer is a local static page. It stores progress in that browser and has no analytics or backend. External images are opt-in and restricted to expected Discord CDN icon/avatar paths, with no referrer. The executor necessarily communicates with Discord through its native client controls.

## What must stay private

- Inventories, folder snapshots, friend matches, notes, and decisions.
- Preview plans and generated executors: they contain account/server IDs and approved actions.
- Execution journals and downloaded results.

`data/`, `dist/`, browser-test output, common export filenames, and environment files are git-ignored. This is an accidental-publication safeguard, not encryption. Do not force-add exports or attach them to public issues. This repository contains only synthetic examples and screenshots.

## Mutation safeguards

Plans bind an exact current account, the complete captured membership, explicit departure/deletion IDs, the retained set, and an optional complete folder layout. Notes never become deletion instructions. Deletion requires both an explicit owned-server ID during planning and exact-ID confirmation during executor generation.

The executor validates scope and ownership before starting, checks the account and ownership again before mutations, records progress in a dedicated IndexedDB journal before each mutation, and reads back results. If persistence or verification fails, later actions are not attempted. Notification settings are outside the authorized surface.

Do not assume a timeout means no change occurred. Stop and inspect the result. Automatic retries are deliberately absent. A stop request cannot cancel a request already sent to Discord. MFA and password challenges must be completed by the user through Discord; the toolkit does not collect or bypass them.

Result verification checks exported native-client evidence against the plan. It is not an independent server-side audit or cryptographic proof. Folder changes should also be checked after a normal client reload.

## Reporting a problem

For a security issue, use the repository's private vulnerability reporting feature if available. Otherwise contact the maintainer privately before disclosing exploitable details. For ordinary bugs, a sanitized error message and the affected component are usually enough. Never upload real exports, authorization headers, or generated executors to a public issue.
