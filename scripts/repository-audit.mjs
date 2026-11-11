/** Check the Git index, not database contents. Ignore rules cannot untrack a file
 * that was already committed, so both checks are necessary before a push. */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
function localArtifact(file) {
  const name = path.posix.basename(file);
  return (
    /(^|\/)(?:node_modules|\.runtime|backups|coverage|test-results|playwright-report|\.cache|\.idea|\.vs)(\/|$)/.test(
      file,
    ) ||
    file.startsWith('exports/') ||
    (/^\.env(?:\..*)?$/.test(name) && !/^\.env(?:\..+)?\.example$/.test(name)) ||
    /\.(?:sqlite\w*|db)(?:[.-].*)?$/i.test(name) ||
    /\.(?:log|bak|backup|swp|swo)$/.test(name) ||
    name.startsWith('~$') ||
    name.endsWith('~') ||
    ['.DS_Store', 'Thumbs.db'].includes(name)
  );
}
const violations = tracked.filter(localArtifact);
const mustIgnore = [
  '.runtime/node.exe',
  'node_modules/example/index.js',
  '.env',
  '.env.production',
  'data/production.sqlite',
  'data/production.sqlite-wal',
  'custom/production.db',
  'backups/production.json',
  'server.log',
  'exports/report.csv',
  '.idea/workspace.xml',
  'custom/production.db-wal',
  'test-results/result.json',
  '~$import.xlsx',
];
const mustKeep = [
  '.env.example',
  '.env.production.example',
  'package-lock.json',
  'data/template.json',
  'temp.xlsx',
  'docs/examples/production-import-template.xlsx',
  'docs/images/shared-grid-numbers.png',
  'public/app.js',
];
const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
  cwd: root,
  encoding: 'utf8',
  input: [...mustIgnore, ...mustKeep].join('\n') + '\n',
});
if (ignored.error) throw ignored.error;
if (ignored.status > 1) throw new Error(ignored.stderr);
const ignoredPaths = new Set(ignored.stdout.trim().split('\n'));
const failures = [
  ...violations.map((file) => `Local artifact is tracked: ${file}`),
  ...mustIgnore
    .filter((file) => !ignoredPaths.has(file))
    .map((file) => `Missing ignore rule: ${file}`),
  ...mustKeep
    .filter((file) => ignoredPaths.has(file))
    .map((file) => `Source is incorrectly ignored: ${file}`),
];
if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 1;
} else
  console.log(
    `Repository check passed: ${tracked.length} tracked paths; local artifacts excluded.`,
  );
