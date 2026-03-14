'use strict';
// Installs the correct prebuilt better-sqlite3 binary for Electron.
// Must run from the better-sqlite3 package directory so prebuild-install
// knows which GitHub release to fetch — running from the project root
// causes it to look for an 'adhd-financial-app' binary and do nothing.
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const prebuildInstall = path.join(root, 'node_modules', '.bin', 'prebuild-install');
const bsqliteDir = path.join(root, 'node_modules', 'better-sqlite3');

// Read the Electron version from our own devDependencies
const { devDependencies } = require(path.join(root, 'package.json'));
const electronVersion = devDependencies.electron.replace(/[^0-9.]/g, '');

execFileSync(
  process.execPath,
  [prebuildInstall, '--runtime', 'electron', '--target', electronVersion, '--verbose'],
  { stdio: 'inherit', cwd: bsqliteDir }
);
