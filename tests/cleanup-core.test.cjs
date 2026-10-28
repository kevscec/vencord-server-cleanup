'use strict';
// Synthetic fixtures only: no Discord modules, network, or private plan data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, validatePlan } = require('../src/cleanup-core.js');

const ids = Object.freeze({
  pinned: '10000000000000001',
  leave: '10000000000000002',
  del: '10000000000000003',
  retain: '10000000000000004',
  extra: '10000000000000005',
  other: '10000000000000006'
});
function plan(overrides = {}) {
  const p = {
    schema: 'discord-cleanup-approved/v1',
    execution_authorized: true,
    authorization: { leave: true, delete: true, folders: true, muting: false },
    expected_user_id: ids.pinned,
    expected_server_ids: [ids.pinned, ids.leave, ids.del, ids.retain],
    leave: [{ id: ids.leave, name: 'Leave synthetic' }],
    delete: [{ id: ids.del, name: 'Delete synthetic' }],
    retain_ids: [ids.pinned, ids.retain],
    folders: [
      { folder_id: null, folder_name: null, folder_color: null, guild_ids: [ids.pinned] },
      { folder_id: 1, folder_name: 'Retained', folder_color: 123, guild_ids: [ids.retain] }
    ],
    priority_top_server_id: ids.pinned,
    expected_counts: { leave: 1, delete: 1, retain: 2 },
    plan_id: 'synthetic-plan-v1'
  };
  return { ...p, ...overrides };
}
function depsFor(p = plan(), opts = {}) {
  const guilds = new Map(
    (opts.guildIds || p.expected_server_ids).map((id) => [
      id,
      { id, ownerId: id === ids.del ? p.expected_user_id : ids.other }
    ])
  );
  const calls = [];
  const events = [];
  const deps = {
    currentUserId: () => opts.userId || p.expected_user_id,
    getGuild: (id) => guilds.get(id) || null,
    listGuildIds: () => [...guilds.keys()],
    leaveGuild: async (id) => {
      calls.push(['leave', id]);
      if (opts.leaveKeeps) return;
      guilds.delete(id);
    },
    deleteGuild: async (id) => {
      calls.push(['delete', id]);
      guilds.delete(id);
    },
    waitAbsent: async (id) => (opts.waitAbsent === undefined ? !guilds.has(id) : opts.waitAbsent),
    applyFolders: async (folders) => {
      calls.push(['folders', folders]);
      if (!opts.folderNoWrite) foldersState = folders;
    },
    readFolders: () => opts.readFolders || foldersState,
    shouldStop: () => (typeof opts.stop === 'function' ? opts.stop(calls) : !!opts.stop),
    onEvent: async (event) => {
      events.push(event);
      if (opts.onEvent) await opts.onEvent(event, calls);
    }
  };
  let foldersState = p.folders;
  return { deps, calls, events, guilds };
}

test('validatePlan rejects absent execution authorization and muting ambiguity', () => {
  assert.throws(() => validatePlan(plan({ execution_authorized: false })), /authorization/i);
  assert.throws(
    () =>
      validatePlan(
        plan({ authorization: { leave: true, delete: true, folders: true, muting: true } })
      ),
    /muting/i
  );
  assert.throws(() => validatePlan(plan({ muting: [] })), /muting/i);
});

test('validatePlan enforces exact ids, disjoint union, counts, and priority server standalone first', () => {
  assert.throws(
    () => validatePlan(plan({ retain_ids: [ids.pinned, ids.leave] })),
    /unique|overlap|union/i
  );
  assert.throws(
    () => validatePlan(plan({ expected_counts: { leave: 2, delete: 1, retain: 2 } })),
    /count/i
  );
  assert.throws(
    () =>
      validatePlan(
        plan({
          folders: [
            {
              folder_id: null,
              folder_name: null,
              folder_color: null,
              guild_ids: [ids.pinned, ids.retain]
            }
          ]
        })
      ),
    /priority server|first/i
  );
  assert.throws(() => validatePlan(plan({ expected_user_id: 'bad' })), /snowflake|id/i);
});

test('execute rejects wrong current account before mutations', async () => {
  const p = plan();
  const { deps, calls } = depsFor(p, { userId: ids.other });
  const r = await execute(p, deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'account');
  assert.deepEqual(calls, []);
});

test('execute rejects unexpected or missing retained membership before mutations', async () => {
  for (const guildIds of [
    [...plan().expected_server_ids, ids.extra],
    [ids.pinned, ids.leave, ids.del]
  ]) {
    const { deps, calls } = depsFor(plan(), { guildIds });
    const r = await execute(plan(), deps);
    assert.equal(r.status, 'failed');
    assert.equal(r.stage, 'membership');
    assert.deepEqual(calls, []);
  }
});

test('execute preflight rejects changed owner before mutations', async () => {
  const p = plan();
  const { deps, calls } = depsFor(p);
  const original = deps.getGuild;
  deps.getGuild = (id) => (id === ids.del ? { id, ownerId: ids.other } : original(id));
  const r = await execute(p, deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'preflight');
  assert.deepEqual(calls, []);
});

test('execute invokes only approved ids and persists before then verified events', async () => {
  const p = plan();
  const { deps, calls, events } = depsFor(p);
  const r = await execute(p, deps);
  assert.equal(r.status, 'completed');
  assert.deepEqual(
    calls.map((x) => x[0]),
    ['leave', 'delete', 'folders']
  );
  assert.deepEqual(
    calls.slice(0, 2).map((x) => x[1]),
    [ids.leave, ids.del]
  );
  assert.deepEqual(
    events.filter((e) => e.phase !== 'result').map((e) => [e.phase, e.target_id]),
    [
      ['before', ids.leave],
      ['verified', ids.leave],
      ['before', ids.del],
      ['verified', ids.del],
      ['before', 'folders'],
      ['verified', 'folders']
    ]
  );
});

test('execute does not apply folders after absent verification fails', async () => {
  const { deps, calls } = depsFor(plan(), { leaveKeeps: true, waitAbsent: false });
  const r = await execute(plan(), deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'verify_absent');
  assert.deepEqual(
    calls.map((x) => x[0]),
    ['leave']
  );
});

test('callback failure before mutation prevents that mutation', async () => {
  const { deps, calls } = depsFor(plan(), {
    onEvent: async (e) => {
      if (e.phase === 'before') throw Error('disk unavailable');
    }
  });
  const r = await execute(plan(), deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'event');
  assert.deepEqual(calls, []);
});

test('account change midrun stops before next operation', async () => {
  const p = plan();
  let user = p.expected_user_id;
  const { deps, calls } = depsFor(p, {
    onEvent: async (e) => {
      if (e.phase === 'verified' && e.target_id === ids.leave) user = ids.other;
    }
  });
  deps.currentUserId = () => user;
  const r = await execute(p, deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'account');
  assert.deepEqual(
    calls.map((x) => x[0]),
    ['leave']
  );
});

test('account change during persisted before event prevents the pending mutation', async () => {
  const p = plan();
  let user = p.expected_user_id;
  const { deps, calls } = depsFor(p, {
    onEvent: async (e) => {
      if (e.phase === 'before' && e.target_id === ids.leave) user = ids.other;
    }
  });
  deps.currentUserId = () => user;
  const r = await execute(p, deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'account');
  assert.deepEqual(calls, []);
});

test('explicit stop preserves partial results and prevents folders', async () => {
  const { deps, calls } = depsFor(plan(), { stop: (calls) => calls.length >= 1 });
  const r = await execute(plan(), deps);
  assert.equal(r.status, 'stopped');
  assert.equal(r.stage, 'delete');
  assert.deepEqual(
    calls.map((x) => x[0]),
    ['leave']
  );
});

test('already absent approved target is idempotent and not claimed as performed', async () => {
  const p = plan();
  const { deps, calls } = depsFor(p, { guildIds: [ids.pinned, ids.del, ids.retain] });
  const r = await execute(p, deps);
  assert.equal(r.status, 'completed');
  assert.deepEqual(
    calls.map((x) => x[0]),
    ['delete', 'folders']
  );
  assert.equal(r.results.find((x) => x.id === ids.leave).outcome, 'already_absent');
});

test('writes and verifies ordered canonical folders with standalone priority server top', async () => {
  const p = plan();
  const { deps, calls } = depsFor(p);
  const r = await execute(p, deps);
  assert.equal(r.status, 'completed');
  assert.deepEqual(calls[2][1], p.folders);
  assert.deepEqual(r.folders, p.folders);
});

test('folder readback mismatch cannot complete', async () => {
  const p = plan();
  const bad = structuredClone(p.folders);
  bad[1].folder_color = 999;
  const { deps } = depsFor(p, { readFolders: bad });
  const r = await execute(p, deps);
  assert.equal(r.status, 'failed');
  assert.equal(r.stage, 'verify_folders');
});
