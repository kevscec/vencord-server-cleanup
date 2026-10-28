const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const target = path.join(__dirname, '../src/review-model.js');
const context = { module: { exports: {} }, URL, Date, console };
vm.runInNewContext(fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '', context);
const api = context.module.exports;
const id = '123456789012345678',
  fid = '223456789012345678';
const fixture = () => ({
  schema: 'discord-review/v1',
  mode: 'passive-cache-only',
  captured_at: '2026-10-28T03:06:51.158Z',
  entries: [
    {
      id,
      kind: 'server',
      name: 'QA fixture',
      member_count: 12,
      last_cached_message_at: '2021-08-22T18:22:13.511Z',
      channels: [
        {
          id: '333456789012345678',
          name: 'general',
          type: 0,
          last_message_at: '2021-08-22T18:22:13.511Z'
        }
      ]
    }
  ]
});
test('server-only import has honest unknown friends, no implicit decisions', () => {
  assert.equal(typeof api.importInventory, 'function');
  const d = fixture();
  d.entries.push({ id: fid, kind: 'group', name: 'excluded' });
  d.entries[0].decision = 'leave';
  const result = api.importInventory(d);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].decision, 'review');
  assert.equal(result.rows[0].friend_coverage, 'unavailable');
  assert.equal(result.rows[0].priority, 'old');
  assert.equal(result.rows[0].icon_url, null);
});
test('social metadata accepts only validated Discord CDN URLs, and zero cache matches remains partial', () => {
  const d = fixture();
  const row = d.entries[0];
  row.icon_url = `https://cdn.discordapp.com/icons/${id}/0123456789abcdef0123456789abcdef.png?size=128`;
  row.friend_coverage = 'cached_partial';
  row.friend_matches = [
    {
      id: fid,
      display_name: 'Fixture Friend',
      username: 'fixture',
      avatar_url: 'https://evil.example/track.png',
      nickname: 'Local nickname'
    }
  ];
  const r = api.importInventory(d).rows[0];
  assert.equal(r.friend_matches.length, 1);
  assert.equal(r.friend_matches[0].display_name, 'Fixture Friend');
  assert.equal(r.friend_matches[0].avatar_url, null);
  assert.equal(r.icon_url, row.icon_url);
  assert.equal(r.friend_coverage, 'cached_partial');
  row.icon_url = 'https://cdn.discordapp.com.evil.example/icons/x.png';
  row.friend_matches = [];
  const empty = api.importInventory(d).rows[0];
  assert.equal(empty.icon_url, null);
  assert.equal(empty.friend_coverage, 'cached_partial');
  assert.equal(empty.friend_matches.length, 0);
});
test('topic grouping is tentative and unavailable activity is never treated as old', () => {
  const d = fixture();
  d.entries[0].name = 'Programming - JavaScript';
  d.entries[0].last_cached_message_at = null;
  const r = api.importInventory(d).rows[0];
  assert.equal(r.topic, 'Programming and technology');
  assert.equal(r.priority, 'unknown');
  d.entries[0].name = 'Some friend place';
  d.entries[0].member_count = 12;
  assert.equal(api.importInventory(d).rows[0].topic, 'Small circles · unconfirmed');
});
test('draft export and restore retains notes, decisions, grouping and favorite but never execution consent', () => {
  const inv = api.importInventory(fixture());
  const r = inv.rows[0];
  r.decision = 'leave';
  r.note = 'QA note';
  r.favorite = true;
  r.topic_override = 'Friends and contacts';
  const draft = api.makeDraft(inv);
  assert.equal(draft.execution_authorized, false);
  assert.equal(draft.entries[0].note, 'QA note');
  const clean = api.importInventory(fixture());
  const restored = api.restoreDraft(clean, draft);
  assert.equal(restored.rows[0].decision, 'leave');
  assert.equal(restored.rows[0].favorite, true);
  assert.equal(restored.rows[0].topic_override, 'Friends and contacts');
  assert.equal(restored.rows[0].note, 'QA note');
  const owned = fixture();
  owned.entries[0].owned_by_me = true;
  assert.throws(() => api.restoreDraft(api.importInventory(owned), draft), /owner/);
  assert.throws(
    () => api.restoreDraft(clean, { ...draft, entries: [{ ...draft.entries[0], id: fid }] }),
    /inventory/i
  );
  assert.equal(clean.rows[0].decision, 'review');
});
test('unknown cached profile names remain readable rather than a fabricated known identity', () => {
  const d = fixture();
  d.entries[0].owner_display_name = 'unknown';
  d.entries[0].friend_coverage = 'cached_partial';
  d.entries[0].friend_matches = [
    { id: fid, display_name: 'unknown', username: 'unknown', nickname: 'Cached alias' }
  ];
  const r = api.importInventory(d).rows[0];
  assert.equal(r.owner_name, '');
  assert.equal(r.friend_matches[0].display_name, 'Cached alias');
  assert.equal(r.friend_matches[0].username, '');
});
test('known ownership survives a capture with missing ownership', () => {
  const first = fixture();
  first.entries[0].owned_by_me = true;
  const draft = api.makeDraft(api.importInventory(first));
  const next = api.restoreDraft(api.importInventory(fixture()), draft);
  assert.equal(next.rows[0].owned_by_me, true);
  assert.equal(next.rows[0].priority, 'owned');
  next.rows[0].decision = 'leave';
  assert.throws(() => api.makeDraft(next), /owner/);
});
test('history retains absent IDs and preserves notes and ownership across exported archives', () => {
  const first = api.importInventory(fixture());
  first.rows[0].note = 'Persistent note';
  first.rows[0].favorite = true;
  const initial = api.mergeHistory(null, api.makeDraft(first));
  const partial = api.mergeHistory(initial, {
    schema: 'discord-review-decisions/v1',
    entries: [],
    execution_authorized: false
  });
  assert.equal(partial.entries.length, 1);
  assert.equal(partial.entries[0].note, 'Persistent note');
  const restored = api.mergeHistory(null, {
    schema: 'discord-review-decisions/v1',
    entries: [],
    archived_entries: partial.entries
  });
  assert.equal(restored.entries[0].favorite, true);
  assert.equal(restored.execution_authorized, false);
});
