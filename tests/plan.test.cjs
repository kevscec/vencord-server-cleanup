const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const fixture = require('./fixtures.cjs');
const target = path.join(__dirname, '../src/plan.js');
const api = fs.existsSync(target) ? require(target) : {};
const input = () => ({
  inventory: fixture.inventory(),
  decisions: fixture.decisions(),
  folderSnapshot: fixture.folders()
});
test('creates a preview, never derives deletions or authorization from notes', () => {
  assert.equal(typeof api.createPlan, 'function');
  const p = api.createPlan(input());
  assert.equal(p.execution_authorized, false);
  assert.deepEqual(p.authorization, { leave: false, delete: false, folders: false, muting: false });
  assert.deepEqual(
    p.leave.map((r) => r.id),
    [fixture.ids.games]
  );
  assert.equal(p.delete.length, 0);
  assert.equal(p.retain_ids.length, 2);
  assert.equal(p.folders.flatMap((f) => f.guild_ids).length, 2);
  assert.ok(p.folders.some((f) => f.folder_name === 'Study friends'));
});
test('authorizes only requested scopes and requires exact deletion ID confirmation', () => {
  assert.equal(typeof api.authorizePlan, 'function');
  const p = api.createPlan({ ...input(), organize: false });
  assert.throws(() => api.authorizePlan(p, {}), /leave/i);
  const a = api.authorizePlan(p, { leave: true });
  assert.equal(a.execution_authorized, true);
  assert.equal(a.authorization.delete, false);
  assert.equal(a.authorization.folders, false);
  const del = api.createPlan({ ...input(), deleteOwnedIds: [fixture.ids.own] });
  assert.throws(
    () => api.authorizePlan(del, { leave: true, folders: true, delete: true }),
    /deletion/i
  );
  const approved = api.authorizePlan(del, {
    leave: true,
    folders: true,
    delete: true,
    confirmDeleteIds: [fixture.ids.own]
  });
  assert.equal(approved.delete.length, 1);
  assert.equal(p.execution_authorized, false);
});
test('rejects demo/account mismatch, partial decisions, owned departures, unknown and duplicate IDs', () => {
  assert.throws(
    () => api.createPlan({ ...input(), inventory: { ...fixture.inventory(), demo: true } }),
    /Demo/
  );
  const mismatch = input();
  mismatch.decisions.account_id = fixture.ids.other;
  assert.throws(() => api.createPlan(mismatch), /account/);
  const partial = input();
  partial.decisions.entries.pop();
  assert.throws(() => api.createPlan(partial), /exactly/);
  const owned = input();
  owned.decisions.entries.find((r) => r.id === fixture.ids.own).decision = 'leave';
  assert.throws(() => api.createPlan(owned), /Owned/);
  assert.throws(() => api.createPlan({ ...input(), deleteOwnedIds: [fixture.ids.games] }), /owned/);
  const duplicate = input();
  duplicate.folderSnapshot.folders.push(duplicate.folderSnapshot.folders[0]);
  assert.throws(() => api.createPlan(duplicate), /memberships/);
});
test('pins a retained server, preserves matching folder IDs/colors and validates custom layout coverage', () => {
  const d = input();
  d.folderSnapshot.folders = [
    {
      folder_id: 42,
      folder_name: 'Resources',
      folder_color: 123,
      guild_ids: [fixture.ids.study, fixture.ids.games, fixture.ids.own]
    }
  ];
  const p = api.createPlan({
    ...d,
    pinnedIds: [fixture.ids.study],
    layout: { folders: [{ name: 'Resources', guild_ids: [fixture.ids.own] }] }
  });
  assert.equal(p.folders[0].folder_id, null);
  assert.equal(p.folders[0].guild_ids[0], fixture.ids.study);
  assert.equal(p.folders[1].folder_id, 42);
  assert.equal(p.folders[1].folder_color, 123);
  assert.throws(() => api.createPlan({ ...input(), pinnedIds: [fixture.ids.games] }), /Pinned/);
  assert.throws(() => api.createPlan({ ...input(), layout: { folders: [] } }), /every retained/);
});
