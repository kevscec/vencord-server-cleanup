const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const fixture = require('./fixtures.cjs'),
  planning = require('../src/plan.js'),
  core = require('../src/cleanup-core.js');
const target = path.join(__dirname, '../src/results.js');
const api = fs.existsSync(target) ? require(target) : {};
test('result verifier checks exact scope, membership and ordered folder readback', async () => {
  assert.equal(typeof api.verifyResult, 'function');
  const preview = planning.createPlan({
    inventory: fixture.inventory(),
    decisions: fixture.decisions(),
    folderSnapshot: fixture.folders(),
    pinnedIds: [fixture.ids.study]
  });
  const plan = planning.authorizePlan(preview, { leave: true, folders: true });
  const guilds = new Map(
    plan.expected_server_ids.map((id) => [id, { ownerId: fixture.ids.other }])
  );
  let folders = [];
  const report = await core.execute(plan, {
    currentUserId: () => plan.expected_user_id,
    getGuild: (id) => guilds.get(id) || null,
    listGuildIds: () => [...guilds.keys()],
    leaveGuild: async (id) => guilds.delete(id),
    deleteGuild: async () => {},
    waitAbsent: async (id) => !guilds.has(id),
    applyFolders: async (value) => {
      folders = value;
    },
    readFolders: () => folders,
    shouldStop: () => false,
    onEvent: () => {}
  });
  const result = {
    plan_id: plan.plan_id,
    source_hashes: plan.source_hashes,
    status: 'completed',
    events: report.events,
    report,
    membership_before: plan.expected_server_ids,
    membership_after: [...guilds.keys()],
    folders_after: folders
  };
  assert.equal(api.verifyResult(preview, result).performed_departures, 1);
  assert.throws(() => api.verifyResult(preview, { ...result, membership_after: [] }), /membership/);
  assert.throws(
    () => api.verifyResult(preview, { ...result, folders_after: [...folders].reverse() }),
    /folder/
  );
  assert.throws(() => api.verifyResult(preview, { ...result, plan_id: 'wrong' }), /plan/);
  assert.throws(() => api.verifyResult(preview, { ...result, status: 'failed' }), /completed/);
});
