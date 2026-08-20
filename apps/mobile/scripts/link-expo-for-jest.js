#!/usr/bin/env node
/**
 * jest-expo hoists to the workspace root (no version conflict forces it to nest), but
 * `expo` and a handful of its own sibling packages only exist nested under
 * apps/mobile/node_modules — npm resolves it that way on purpose, because hoisting `expo`
 * to the root creates a real peer conflict with apps/web's React 19.2.8 (mobile pins
 * 19.2.3). jest-expo's setup script does `require('expo/...')` from its own location
 * (root/node_modules/jest-expo), which Node can never resolve to the nested mobile copy —
 * that's a directory Node's resolution algorithm never looks at from there.
 *
 * Fix: copy real, complete package directories to root/node_modules/<pkg> — the location
 * jest-expo's own `require('expo/...')` calls actually resolve to. (Nesting them under
 * root/node_modules/jest-expo/node_modules/<pkg> instead was tried first and doesn't work:
 * jest-expo's own transformIgnorePatterns matches against the full path, and the extra
 * "node_modules/jest-expo/" segment in that path doesn't match its allowlist, so those
 * TypeScript source files stop getting transformed at all.) This touches nothing npm
 * manages (no package.json/lockfile changes, so it can't create the peer-dependency
 * conflict a real `expo` root dependency would against apps/web's React 19.2.8) — it just
 * runs before every `npm test` so a fresh `npm install` (which doesn't know about this
 * gap) can't silently break the mobile test suite again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MOBILE_MODULES = path.join(ROOT, 'apps', 'mobile', 'node_modules');
const ROOT_MODULES = path.join(ROOT, 'node_modules');

const PACKAGES = [
  'expo',
  'expo-modules-autolinking',
  'expo-modules-core',
  'expo-modules-jsi',
  'expo-server',
  'expo-status-bar',
];

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

for (const pkg of PACKAGES) {
  const src = path.join(MOBILE_MODULES, pkg);
  const dest = path.join(ROOT_MODULES, pkg);
  if (!fs.existsSync(src)) continue;
  const alreadyLinked =
    fs.existsSync(dest) && fs.existsSync(path.join(dest, 'package.json'));
  if (alreadyLinked) continue;
  copyDir(src, dest);
  console.log(`[link-expo-for-jest] linked ${pkg} into root/node_modules`);
}
