const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  { spawnSync } = require('node:child_process');
const fixture = require('./fixtures.cjs'),
  root = path.resolve(__dirname, '..');
const cli = (name, args) =>
  spawnSync(process.execPath, [path.join(root, 'scripts', name), ...args], {
    encoding: 'utf8',
    cwd: root
  });
test('CLI previews and builds an account-bound executor without executing it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-cleanup-test-'));
  try {
    for (const [name, value] of [
      ['inventory', fixture.inventory()],
      ['decisions', fixture.decisions()],
      ['folders', fixture.folders()]
    ])
      fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(value));
    const plan = path.join(dir, 'plan.json'),
      out = path.join(dir, 'execute.js');
    const made = cli('plan.mjs', [
      '--inventory',
      path.join(dir, 'inventory.json'),
      '--decisions',
      path.join(dir, 'decisions.json'),
      '--folders',
      path.join(dir, 'folders.json'),
      '--no-organize',
      '--out',
      plan
    ]);
    assert.equal(made.status, 0, made.stderr);
    assert.equal(JSON.parse(fs.readFileSync(plan)).execution_authorized, false);
    const denied = cli('build-executor.mjs', ['--plan', plan, '--out', out]);
    assert.notEqual(denied.status, 0);
    assert.equal(fs.existsSync(out), false);
    const built = cli('build-executor.mjs', ['--plan', plan, '--authorize-leave', '--out', out]);
    assert.equal(built.status, 0, built.stderr);
    assert.match(fs.readFileSync(out, 'utf8'), /DISCORD_CLEANUP_APPROVED_PLAN/);
    assert.equal(spawnSync(process.execPath, ['--check', out]).status, 0);
    assert.notEqual(cli('plan.mjs', ['--unknown']).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
