const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..', '..', '..');
const candidates = [
  path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(repoRoot, 'task-manager-frontend', 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(repoRoot, 'task-manager-backend', 'node_modules', 'typescript', 'bin', 'tsc')
];

const tscBin = candidates.find((candidate) => fs.existsSync(candidate));

if (!tscBin) {
  console.error(
    'TypeScript compiler not found. Install dependencies in the workspace, frontend, or backend first.'
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [tscBin, ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit'
});

process.exit(result.status === null ? 1 : result.status);
