import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function parse(argv, { flags = [], values = [], repeat = [] } = {}) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw Error('Unexpected positional argument: ' + token);
    const key = token.slice(2);
    if (key === 'help' || flags.includes(key)) {
      if (out[key]) throw Error('Duplicate flag: ' + token);
      out[key] = true;
      continue;
    }
    if (!values.includes(key) && !repeat.includes(key)) throw Error('Unknown option: ' + token);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw Error('Missing value for ' + token);
    if (repeat.includes(key)) {
      (out[key] ??= []).push(value);
    } else {
      if (out[key] !== undefined) throw Error('Duplicate option: ' + token);
      out[key] = value;
    }
  }
  return out;
}
export function required(args, key) {
  if (typeof args[key] !== 'string' || !args[key]) throw Error('--' + key + ' is required.');
  return args[key];
}
export function readJSON(file) {
  if (fs.statSync(file).size > 15 * 1024 * 1024) throw Error('Input exceeds 15 MB.');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw Error('Invalid JSON file: ' + file);
  }
}
export function writePrivate(file, content, { overwrite = false } = {}) {
  const absolute = path.resolve(file),
    relative = path.relative(root, absolute);
  const inside =
    relative !== '' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  if (
    relative === '' ||
    (inside && !['data', 'dist'].some((dir) => relative.startsWith(dir + path.sep)))
  )
    throw Error('Generated private files inside the repository must go in data/ or dist/.');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, {
    encoding: 'utf8',
    flag: overwrite ? 'w' : 'wx',
    mode: 0o600
  });
  return absolute;
}
export function main(fn) {
  try {
    fn();
  } catch (error) {
    console.error('Error: ' + error.message);
    process.exitCode = 1;
  }
}
