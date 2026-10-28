import fs from 'node:fs';
import path from 'node:path';
import { root, writePrivate } from './io.mjs';
for (const [input, output] of [
  ['collectors/servers.js', 'dist/capture-servers.js'],
  ['collectors/folders.js', 'dist/capture-folders.js'],
  ...['index.html', 'src/review-model.js', 'src/review-ui.js', 'src/review.css', 'src/demo.js'].map(
    (file) => [file, 'dist/reviewer/' + file]
  )
])
  writePrivate(path.join(root, output), fs.readFileSync(path.join(root, input), 'utf8'), {
    overwrite: true
  });
console.log(
  'Built standalone collectors and dist/reviewer/index.html. No account data or execution plan is included.'
);
