import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

function readProjectFile(path) {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function localAssetExists(assetPath) {
  const normalizedPath = assetPath.replace(/^\.\//, '');

  if (normalizedPath === '') {
    return true;
  }

  return existsSync(resolve(projectRoot, normalizedPath));
}

test('static shell references existing local assets', () => {
  const html = readProjectFile('index.html');
  const serviceWorker = readProjectFile('service-worker.js');
  const htmlAssets = Array.from(html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g))
    .map((match) => match[1]);
  const cacheListMatch = serviceWorker.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);

  assert.ok(cacheListMatch, 'service worker should define STATIC_ASSETS');

  const cachedAssets = Array.from(cacheListMatch[1].matchAll(/"(\.\/[^"]+)"/g))
    .map((match) => match[1]);
  const missingAssets = [...new Set([...htmlAssets, ...cachedAssets])]
    .filter((assetPath) => !localAssetExists(assetPath));

  assert.deepEqual(missingAssets, []);
});

test('app entrypoint wires required calorie tracker modules', () => {
  const appSource = readProjectFile('js/app.js');

  for (const modulePath of [
    './calculations.js',
    './date-utils.js',
    './records.js',
    './storage.js',
    './word.js',
  ]) {
    assert.match(appSource, new RegExp(`from '${modulePath.replace('.', '\\.')}'`));
  }

  for (const requiredText of [
    'cleanupExpiredRecords',
    'normalizeCaloriesInput',
    'mergeImportedRecords',
    'readWordFile',
    'buildWordBlob',
    'serviceWorker',
  ]) {
    assert.match(appSource, new RegExp(requiredText));
  }
});

test('static shell copy describes calorie burn instead of intake', () => {
  const html = readProjectFile('index.html');

  assert.doesNotMatch(html, /摄入|本次热量/);
  assert.match(html, /今日消耗/);
});
