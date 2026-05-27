import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

function readTrackedJsFiles() {
  return execFileSync('git', ['ls-files', 'js/*.js'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
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

test('today fat metric stays on one line in narrow mobile browsers', () => {
  const html = readProjectFile('index.html');
  const css = readProjectFile('styles.css');
  const appSource = readProjectFile('js/app.js');

  assert.match(html, /id="todayFat"[^>]*class="[^"]*\bfat-pair\b/);
  assert.match(css, /\.summary-tile strong\.fat-pair\s*{[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(appSource, /todayFat\.textContent\s*=\s*`[^`]*\s\/\s[^`]*`/);
  assert.match(appSource, /todayFat\.textContent\s*=\s*`\$\{formatGrams\(fatGrams\.bodyFatGrams\)}\/\$\{formatGrams\(fatGrams\.pureFatGrams\)}`/);
});

test('tracked project files do not reference the original local download path', () => {
  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const forbiddenFragments = [
    ['xiao', 'libin'].join(''),
    ['/', 'Use', 'rs', '/'].join(''),
    ['Desktop', '/kcal'].join(''),
  ];
  const violations = [];

  for (const filePath of trackedFiles) {
    const content = readProjectFile(filePath);

    for (const fragment of forbiddenFragments) {
      if (content.includes(fragment)) {
        violations.push(`${filePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('runtime validation messages are Chinese for users and support staff', () => {
  const forbiddenPhrases = /\b(?:Invalid|Records?|Calories?|Grams?|Blob|DOMParser|unavailable|failed|blocked|aborted|required|must)\b/;
  const violations = [];

  for (const filePath of readTrackedJsFiles()) {
    const source = readProjectFile(filePath);
    const messageMatches = [
      ...source.matchAll(/new Error\((['"`])([\s\S]*?)\1\)/g),
      ...source.matchAll(/error:\s*(['"`])([\s\S]*?)\1/g),
    ];

    for (const match of messageMatches) {
      if (forbiddenPhrases.test(match[2])) {
        violations.push(`${filePath}: ${match[2]}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('exported functions include JSDoc comments', () => {
  const missingComments = [];

  for (const filePath of readTrackedJsFiles()) {
    const source = readProjectFile(filePath);
    const exportMatches = source.matchAll(/(^|\n)(export (?:async )?function \w+\([^)]*\) \{)/g);

    for (const match of exportMatches) {
      const beforeExport = source.slice(0, match.index + match[1].length).trimEnd();

      if (!beforeExport.endsWith('*/')) {
        missingComments.push(`${filePath}: ${match[2]}`);
      }
    }
  }

  assert.deepEqual(missingComments, []);
});
