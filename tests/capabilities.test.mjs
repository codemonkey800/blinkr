import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const capabilitiesDirectory = resolve(root, 'src-tauri', 'capabilities');

// Every native call needs an entry here. Add one with each task that adds a call.
const EXPECTED_PERMISSIONS = [
  'core:window:allow-is-fullscreen', // resync after an OS fullscreen exit
  'core:window:allow-set-always-on-top', // always-on-top setting
  'core:window:allow-set-decorations', // borderless setting
  'core:window:allow-set-fullscreen', // fullscreen setting
  'core:window:allow-start-dragging', // drag a borderless window
  'global-shortcut:allow-is-registered', // clear a stale registration before registering
  'global-shortcut:allow-register', // global start and stop shortcut
  'global-shortcut:allow-unregister', // switch or turn off the global shortcut
  'store:allow-get', // read settings
  'store:allow-load', // open blinkr.json
  'store:allow-save', // flush settings to disk
  'store:allow-set', // write settings
];

function capabilityFiles() {
  return readdirSync(capabilitiesDirectory).filter((name) => !name.startsWith('.'));
}

test('capabilities grant exactly the permissions the code calls, to the main window only', () => {
  const files = capabilityFiles();
  assert.ok(files.length > 0, 'expected at least one capability file');

  const permissions = [];
  for (const file of files) {
    const capability = JSON.parse(readFileSync(resolve(capabilitiesDirectory, file), 'utf8'));
    assert.deepEqual(capability.windows, ['main'], `${file} windows`);
    for (const permission of capability.permissions) {
      assert.equal(typeof permission, 'string', `${file} uses a plain permission identifier`);
      permissions.push(permission);
    }
  }

  assert.deepEqual([...permissions].sort(), EXPECTED_PERMISSIONS);
});

test('no capability grants a default permission set', () => {
  for (const file of capabilityFiles()) {
    const text = readFileSync(resolve(capabilitiesDirectory, file), 'utf8');
    assert.doesNotMatch(text, /:default"/, `${file} must not use a default set`);
  }
});
