#!/usr/bin/env node
import results from '../src/results.js';
import { parse, required, readJSON, writePrivate, main } from './io.mjs';
main(() => {
  const args = parse(process.argv.slice(2), {
    flags: ['overwrite'],
    values: ['plan', 'result', 'out']
  });
  if (args.help) {
    console.log(
      'Usage: npm run verify:result -- --plan data/plan.json --result data/result.json [--out data/verification.json] [--overwrite]'
    );
    return;
  }
  const summary = results.verifyResult(
    readJSON(required(args, 'plan')),
    readJSON(required(args, 'result'))
  );
  if (args.out)
    writePrivate(args.out, JSON.stringify(summary, null, 2) + '\n', {
      overwrite: !!args.overwrite
    });
  console.log(JSON.stringify(summary, null, 2));
});
