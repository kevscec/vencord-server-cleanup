#!/usr/bin/env node
import planning from '../src/plan.js';
import bundling from '../src/bundle.js';
import { parse, required, readJSON, writePrivate, main } from './io.mjs';
main(() => {
  const args = parse(process.argv.slice(2), {
    flags: ['authorize-leave', 'authorize-delete', 'authorize-folders', 'overwrite'],
    values: ['plan', 'out'],
    repeat: ['confirm-delete']
  });
  if (args.help) {
    console.log(
      'Usage: npm run build:executor -- --plan data/plan.json [--authorize-leave] [--authorize-folders] [--authorize-delete --confirm-delete ID] [--out dist/execute-cleanup.js] [--overwrite]'
    );
    return;
  }
  const plan = planning.authorizePlan(readJSON(required(args, 'plan')), {
    leave: !!args['authorize-leave'],
    delete: !!args['authorize-delete'],
    folders: !!args['authorize-folders'],
    confirmDeleteIds: args['confirm-delete'] || []
  });
  const file = writePrivate(args.out || 'dist/execute-cleanup.js', bundling.buildExecutor(plan), {
    overwrite: !!args.overwrite
  });
  console.log(
    JSON.stringify(
      {
        file,
        account_bound: true,
        authorized_counts: plan.expected_counts,
        authorization: plan.authorization
      },
      null,
      2
    )
  );
  console.log(
    'Nothing was executed. Inspect this private script, paste it into your Vencord console, then use its Start button.'
  );
});
