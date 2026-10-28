'use strict';
const { createHash, randomUUID, randomInt } = require('node:crypto');
const model = require('./review-model.js');
const isId = (value) => typeof value === 'string' && /^\d{17,20}$/.test(value);
const check = (condition, message) => {
  if (!condition) throw Error(message);
};
const sameSet = (a, b) =>
  a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
const digest = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function createPlan({
  inventory,
  decisions,
  folderSnapshot,
  pinnedIds = [],
  deleteOwnedIds = [],
  layout = null,
  organize = true
}) {
  check(
    inventory?.demo !== true && decisions?.demo !== true,
    'Demo data cannot produce an execution plan.'
  );
  const normalized = model.importInventory(inventory),
    account = inventory.account_id;
  check(isId(account), 'Capture the inventory again: a valid account_id is required.');
  check(
    decisions?.schema === 'discord-review-decisions/v1' && Array.isArray(decisions.entries),
    'A decisions draft is required.'
  );
  check(decisions.account_id === account, 'Decisions belong to a different or unverified account.');
  check(
    folderSnapshot?.schema === 'discord-folders/v1' && Array.isArray(folderSnapshot.folders),
    'A current folder snapshot is required.'
  );
  check(
    folderSnapshot.account_id === account,
    'Folder snapshot belongs to a different or unverified account.'
  );
  const rows = normalized.rows,
    ids = rows.map((r) => r.id),
    raw = new Map(inventory.entries.filter((r) => r.kind === 'server').map((r) => [r.id, r]));
  const draftIds = decisions.entries.map((r) => r.id);
  check(
    sameSet(draftIds, ids),
    'Decisions must cover exactly the current inventory without duplicates.'
  );
  const snapshotIds = folderSnapshot.folders.flatMap((f) => f.guild_ids || []);
  check(
    sameSet(snapshotIds, ids),
    'Folder snapshot and inventory memberships differ. Capture both again.'
  );
  const draft = new Map(decisions.entries.map((r) => [r.id, r]));
  const deletions = new Set(deleteOwnedIds);
  check(deletions.size === deleteOwnedIds.length, 'Duplicate deletion IDs.');
  for (const id of deleteOwnedIds)
    check(
      isId(id) &&
        raw.has(id) &&
        raw.get(id).owned_by_me === true &&
        raw.get(id).owner_id === account,
      'Deletion target must be a currently captured owned server.'
    );
  const leave = [],
    remove = [];
  for (const row of rows) {
    const selection = draft.get(row.id);
    check(
      ['review', 'keep', 'leave', 'mute'].includes(selection.decision),
      'Unknown draft decision.'
    );
    check(
      !(selection.decision === 'leave' && (row.owned_by_me || selection.owned_by_me === true)),
      'Owned servers cannot be leave targets.'
    );
    check(
      !(selection.decision === 'leave' && deletions.has(row.id)),
      'Leave and deletion targets overlap.'
    );
    if (selection.decision === 'leave') leave.push({ id: row.id, name: row.name });
    if (deletions.has(row.id)) remove.push({ id: row.id, name: row.name });
  }
  const removed = new Set([...leave, ...remove].map((r) => r.id)),
    retained = rows.filter((r) => !removed.has(r.id)),
    retain_ids = retained.map((r) => r.id);
  check(
    new Set(pinnedIds).size === pinnedIds.length &&
      pinnedIds.every((id) => isId(id) && retain_ids.includes(id)),
    'Pinned IDs must be unique retained servers.'
  );
  check(organize || (!layout && !pinnedIds.length), 'Pins/layout require folder organization.');
  let folders = null;
  if (organize) {
    const used = new Set(
      folderSnapshot.folders.filter((f) => f.folder_id !== null).map((f) => Number(f.folder_id))
    );
    const groups = layout ? layout.folders : [];
    check(Array.isArray(groups), 'Layout folders must be an array.');
    if (!layout) {
      const map = new Map();
      for (const row of retained) {
        if (pinnedIds.includes(row.id)) continue;
        const chosen = draft.get(row.id).topic_override;
        check(
          chosen == null ||
            (typeof chosen === 'string' && chosen.trim().length > 0 && chosen.length <= 80),
          'Folder names must contain 1–80 characters.'
        );
        const name = chosen?.trim() || (row.owned_by_me ? 'My servers' : row.topic);
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(row.id);
      }
      for (const [name, guild_ids] of map) groups.push({ name, guild_ids });
    }
    const names = new Set();
    folders = pinnedIds.map((id) => ({
      folder_id: null,
      folder_name: null,
      folder_color: null,
      guild_ids: [id]
    }));
    for (const group of groups) {
      check(
        typeof group.name === 'string' && group.name.trim().length > 0 && group.name.length <= 80,
        'Layout folder names must contain 1–80 characters.'
      );
      const name = group.name.trim();
      check(!names.has(name), 'Duplicate folder name.');
      names.add(name);
      check(
        Array.isArray(group.guild_ids) &&
          group.guild_ids.length > 0 &&
          group.guild_ids.every(
            (id) => isId(id) && retain_ids.includes(id) && !pinnedIds.includes(id)
          ),
        'Layout contains removed, unknown, pinned or invalid servers.'
      );
      const matches = folderSnapshot.folders.filter(
        (f) => f.folder_id !== null && f.folder_name === name
      );
      check(matches.length <= 1, 'Existing folder name is ambiguous. Rename it before planning.');
      let id = matches.length ? Number(matches[0].folder_id) : randomInt(1, 0x100000000);
      if (!matches.length) {
        while (used.has(id)) id = randomInt(1, 0x100000000);
      }
      used.add(id);
      check(
        Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff,
        'Existing folder ID is unsupported.'
      );
      let color = matches[0]?.folder_color ?? 0x5865f2;
      if (group.color !== undefined) {
        check(
          typeof group.color === 'string' && /^#[a-fA-F0-9]{6}$/.test(group.color),
          'Colors must be #RRGGBB.'
        );
        color = parseInt(group.color.slice(1), 16);
      }
      check(
        Number.isSafeInteger(color) && color >= 0 && color <= 0xffffff,
        'Invalid folder color.'
      );
      folders.push({
        folder_id: id,
        folder_name: name,
        folder_color: color,
        guild_ids: [...group.guild_ids]
      });
    }
    check(
      sameSet(
        folders.flatMap((f) => f.guild_ids),
        retain_ids
      ),
      'Layout must include every retained server exactly once.'
    );
  }
  return {
    schema: 'discord-cleanup-approved/v1',
    plan_id: 'cleanup-' + randomUUID(),
    created_at: new Date().toISOString(),
    execution_authorized: false,
    authorization: { leave: false, delete: false, folders: false, muting: false },
    expected_user_id: account,
    expected_server_ids: ids,
    leave,
    delete: remove,
    retain_ids,
    folders,
    priority_top_server_id: pinnedIds[0] || null,
    expected_counts: { leave: leave.length, delete: remove.length, retain: retain_ids.length },
    source_hashes: {
      inventory: digest(inventory),
      decisions: digest(decisions),
      folders: digest(folderSnapshot)
    },
    warnings: [
      'Preview only. Notes, favorites and mute decisions do not authorize account changes.',
      'Folder backup cannot undo departures or server deletions.'
    ]
  };
}
function authorizePlan(preview, approval = {}) {
  check(preview?.execution_authorized === false, 'An unauthorized preview is required.');
  if (preview.leave.length)
    check(approval.leave === true, 'Explicit leave authorization is required.');
  if (preview.delete.length) {
    check(approval.delete === true, 'Explicit deletion authorization is required.');
    check(
      Array.isArray(approval.confirmDeleteIds) &&
        sameSet(
          approval.confirmDeleteIds,
          preview.delete.map((r) => r.id)
        ),
      'Exact deletion IDs must be confirmed.'
    );
  }
  if (preview.folders !== null)
    check(approval.folders === true, 'Explicit folder authorization is required.');
  const plan = JSON.parse(JSON.stringify(preview));
  plan.execution_authorized = true;
  plan.authorization = {
    leave: plan.leave.length > 0,
    delete: plan.delete.length > 0,
    folders: plan.folders !== null,
    muting: false
  };
  plan.warnings = plan.warnings.filter((w) => !w.startsWith('Preview only.'));
  plan.authorized_at = new Date().toISOString();
  require('./cleanup-core.js').validatePlan(plan);
  return plan;
}
module.exports = { createPlan, authorizePlan };
