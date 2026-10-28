'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  core = require('./cleanup-core.js');
function buildExecutor(plan) {
  core.validatePlan(plan);
  const serialized = JSON.stringify(plan).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  );
  const code = [
    '/* Locally approved execution plan. Keep this generated file private. */',
    'globalThis.DISCORD_CLEANUP_APPROVED_PLAN = ' + serialized + ';'
  ];
  for (const file of ['cleanup-core.js', 'cleanup-native.js', 'cleanup-entry.js'])
    code.push(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  return code.join('\n;\n') + '\n';
}
module.exports = { buildExecutor };
