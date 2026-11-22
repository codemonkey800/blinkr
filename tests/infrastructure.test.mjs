import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveConfig } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tauriConfigPath = resolve(root, 'src-tauri', 'tauri.conf.json');
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));

function localPath(reference, parentDirectory) {
  const value = reference.trim();
  if (value.startsWith('file:')) {
    return fileURLToPath(value);
  }
  if (value.startsWith('/')) {
    return resolve(parentDirectory, `.${value}`);
  }
  return resolve(parentDirectory, value);
}

function configuredIcons() {
  return tauriConfig.bundle.icon.map((icon) => resolve(dirname(tauriConfigPath), icon));
}

test('Vite and Tauri share their fixed local development endpoint', async () => {
  const viteConfig = await resolveConfig({ root }, 'serve', 'development');
  assert.equal(viteConfig.server.host, '127.0.0.1');
  assert.equal(viteConfig.server.port, 1420);
  assert.equal(viteConfig.server.strictPort, true);

  const devUrl = new URL(tauriConfig.build.devUrl);
  assert.equal(devUrl.protocol, 'http:');
  assert.equal(devUrl.hostname, 'localhost');
  assert.equal(Number(devUrl.port), viteConfig.server.port);
});

test('the Tauri frontend directory is Vite’s production output', async () => {
  const viteConfig = await resolveConfig({ root }, 'build', 'production');
  const viteOutDir = resolve(root, viteConfig.build.outDir);
  const tauriOutDir = resolve(dirname(tauriConfigPath), tauriConfig.build.frontendDist);
  assert.equal(relative(viteOutDir, tauriOutDir), '');
});

test('the built entry and configured desktop icons resolve to local files', () => {
  const outputDirectory = resolve(dirname(tauriConfigPath), tauriConfig.build.frontendDist);
  const entryPath = resolve(outputDirectory, 'index.html');
  assert.ok(existsSync(entryPath), `missing production entry: ${entryPath}`);

  const html = readFileSync(entryPath, 'utf8');
  const references = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  assert.ok(references.length > 0, 'production entry should reference local assets');

  for (const reference of references) {
    assert.ok(!reference.startsWith('http:'), `external HTTP asset is not allowed: ${reference}`);
    assert.ok(!reference.startsWith('https:'), `external HTTPS asset is not allowed: ${reference}`);
    const assetPath = localPath(reference, outputDirectory);
    assert.ok(isAbsolute(assetPath), `asset path should be absolute: ${reference}`);
    assert.ok(existsSync(assetPath), `missing built asset: ${pathToFileURL(assetPath)}`);
  }

  for (const iconPath of configuredIcons()) {
    assert.ok(existsSync(iconPath), `missing configured desktop icon: ${iconPath}`);
  }
});
