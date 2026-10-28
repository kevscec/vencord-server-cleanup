'use strict';
const check = (ok, message) => {
  if (!ok) throw Error(message);
};
const unique = (ids) => Array.isArray(ids) && new Set(ids).size === ids.length;
const sameSet = (a, b) =>
  unique(a) && unique(b) && a.length === b.length && a.every((id) => b.includes(id));
const canonical = (folders) =>
  folders.map((f) => ({
    folder_id: f.folder_id,
    folder_name: f.folder_name,
    folder_color: f.folder_color,
    guild_ids: f.guild_ids
  }));
function verifyResult(plan, data) {
  check(
    data?.status === 'completed' && data.report?.status === 'completed',
    'The run is not completed; inspect its partial result before doing anything else.'
  );
  check(data.plan_id === plan.plan_id, 'Result plan ID mismatch.');
  for (const key of ['inventory', 'decisions', 'folders'])
    check(
      typeof plan.source_hashes?.[key] === 'string' &&
        data.source_hashes?.[key] === plan.source_hashes[key],
      'Result source hash mismatch.'
    );
  const expected = [
    ...plan.leave.map((r) => [r.id, 'leave']),
    ...plan.delete.map((r) => [r.id, 'delete'])
  ];
  const results = data.report.results;
  check(
    Array.isArray(results) &&
      unique(results.map((r) => r.id)) &&
      results.length === expected.length,
    'Result operation count/uniqueness mismatch.'
  );
  for (const [id, action] of expected) {
    const r = results.find((r) => r.id === id);
    check(
      r && r.action === action && ['performed_and_verified', 'already_absent'].includes(r.outcome),
      'Result operation scope mismatch.'
    );
  }
  check(
    sameSet(data.membership_after, plan.retain_ids),
    'Final membership does not match retained IDs.'
  );
  check(
    unique(data.membership_before) &&
      data.membership_before.every((id) => plan.expected_server_ids.includes(id)) &&
      plan.retain_ids.every((id) => data.membership_before.includes(id)),
    'Initial membership is inconsistent with the plan.'
  );
  const removed = data.membership_before.filter((id) => !data.membership_after.includes(id)),
    allowed = new Set(expected.map(([id]) => id));
  check(
    removed.every((id) => allowed.has(id)),
    'An unapproved membership was removed.'
  );
  const performed = results.filter((r) => r.outcome === 'performed_and_verified');
  check(
    performed.every((r) => removed.includes(r.id)),
    'Performed operations are inconsistent with before/after membership.'
  );
  const events = data.events || data.report.events;
  check(
    Array.isArray(events) && events.every((e) => ['leave', 'delete', 'folders'].includes(e.stage)),
    'Unexpected operation stage in the journal.'
  );
  for (const r of performed)
    for (const phase of ['before', 'verified'])
      check(
        events.some((e) => e.stage === r.action && e.target_id === r.id && e.phase === phase),
        'Missing mutation journal evidence.'
      );
  if (plan.folders !== null) {
    check(
      Array.isArray(data.folders_after) &&
        JSON.stringify(canonical(data.folders_after)) === JSON.stringify(canonical(plan.folders)),
      'Final folder order, names, colors or membership mismatch.'
    );
    check(
      events.some((e) => e.stage === 'folders' && e.phase === 'verified'),
      'Missing folder verification event.'
    );
  }
  return {
    verified: true,
    performed_departures: performed.filter((r) => r.action === 'leave').length,
    performed_owned_deletions: performed.filter((r) => r.action === 'delete').length,
    already_absent: results.length - performed.length,
    remaining_servers: data.membership_after.length,
    folders_reorganized: plan.folders !== null,
    native_folders: plan.folders?.filter((f) => f.folder_id !== null).length ?? null,
    pinned_server_first: plan.priority_top_server_id
      ? data.folders_after?.[0]?.guild_ids?.[0] === plan.priority_top_server_id
      : null,
    evidence: 'Exported native-client readback, not an independent Discord API audit.'
  };
}
module.exports = { verifyResult };
