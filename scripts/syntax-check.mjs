/** Parse source files without importing them: importing the server starts SQLite. */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
function sourceFiles(directory, recursive = true) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return recursive ? sourceFiles(file) : [];
    return /\.(?:js|mjs)$/.test(entry.name) ? [file] : [];
  });
}
const files = [
  ...sourceFiles(root, false),
  ...['public', 'scripts', 'tests'].flatMap((directory) =>
    sourceFiles(path.join(root, directory)),
  ),
];
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    failures++;
    console.error(result.stderr);
  }
}
if (failures) process.exitCode = 1;
else console.log(`${files.length} JavaScript syntax checks passed.`);
