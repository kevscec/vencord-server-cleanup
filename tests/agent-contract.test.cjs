const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('agent entrypoints point to one maintained guide with executable commands and valid local links', () => {
  const guide = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.ok(guide.length < 12000, 'Keep the root agent guide concise.');
  assert.match(guide, /npm run verify/);
  for (const filename of ['CLAUDE.md', '.github/copilot-instructions.md']) {
    const pointer = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.match(pointer, /AGENTS\.md/);
    assert.ok(pointer.length < 1200, 'Provider entrypoints should not duplicate the main guide.');
  }
  for (const [, target] of guide.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(target)) continue;
    assert.ok(fs.existsSync(path.join(root, target)), 'Stale agent-guide link: ' + target);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const match of guide.matchAll(/`npm run ([a-z][a-z:-]*)`/g)) {
    assert.ok(pkg.scripts[match[1]], 'Undeclared command in agent guide: ' + match[1]);
  }
  for (const command of ['format:check', 'check', 'test', 'test:browser', 'build']) {
    assert.ok(pkg.scripts.verify.includes(command), 'Verification omits ' + command);
  }
  assert.match(
    fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
    /run: npm run verify/
  );
});
