const test = require('node:test'),
  assert = require('node:assert/strict');
const model = require('../src/review-model.js'),
  fixture = require('./fixtures.cjs');
test('review drafts bind the account, preserve custom folders, and mark demo exports', () => {
  const raw = fixture.inventory(),
    inv = model.importInventory(raw);
  assert.equal(inv.account_id, fixture.ids.account);
  inv.rows[0].topic_override = 'Friends · My circle';
  const draft = model.makeDraft(inv);
  assert.equal(draft.account_id, fixture.ids.account);
  assert.equal(draft.entries[0].topic_override, 'Friends · My circle');
  assert.equal(
    model.restoreDraft(model.importInventory(raw), draft).rows[0].topic_override,
    'Friends · My circle'
  );
  const demo = model.makeDraft(model.importInventory({ ...raw, demo: true }));
  assert.equal(demo.demo, true);
  assert.throws(
    () => model.restoreDraft(inv, { ...draft, account_id: fixture.ids.other }),
    /account/
  );
  assert.throws(
    () => model.mergeHistory(draft, { ...draft, account_id: fixture.ids.other }),
    /account/
  );
});
