#!/usr/bin/env node
import planning from '../src/plan.js';
import { parse, required, readJSON, writePrivate, main } from './io.mjs';
main(() => {
  const args = parse(process.argv.slice(2), {
    flags: ['no-organize', 'overwrite'],
    values: ['inventory', 'decisions', 'folders', 'layout', 'out'],
    repeat: ['pin', 'delete-owned']
  });
  if (args.help) {
    console.log(
      'Usage: npm run plan -- --inventory data/inventory.json --decisions data/decisions.json --folders data/folders.json [--pin ID] [--delete-owned ID] [--layout data/layout.json] [--no-organize] [--out data/plan.json] [--overwrite]'
    );
    return;
  }
  const plan = planning.createPlan({
    inventory: readJSON(required(args, 'inventory')),
    decisions: readJSON(required(args, 'decisions')),
    folderSnapshot: readJSON(required(args, 'folders')),
    pinnedIds: args.pin || [],
    deleteOwnedIds: args['delete-owned'] || [],
    layout: args.layout ? readJSON(args.layout) : null,
    organize: !args['no-organize']
  });
  const file = writePrivate(args.out || 'data/plan.json', JSON.stringify(plan, null, 2) + '\n', {
    overwrite: !!args.overwrite
  });
  console.log(
    JSON.stringify(
      {
        file,
        execution_authorized: false,
        departures: plan.leave,
        owned_deletions: plan.delete,
        retained: plan.retain_ids.length,
        folders:
          plan.folders?.map((f) => f.folder_name || '(standalone pinned server)') || 'unchanged'
      },
      null,
      2
    )
  );
});
