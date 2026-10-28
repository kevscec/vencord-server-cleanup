import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './io.mjs';
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const files = ['src', 'collectors', 'scripts', 'tests']
  .flatMap((dir) => walk(path.join(root, dir)))
  .filter((file) => /\.(?:[cm]?js)$/.test(file));
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr);
    process.exit(1);
  }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(src\/[^"?]+)"/g))
  if (!fs.existsSync(path.join(root, match[1]))) throw Error('Missing app asset: ' + match[1]);
console.log('Syntax and local asset checks passed (' + files.length + ' JavaScript files).');
