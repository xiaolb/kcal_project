import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateFatGrams,
  formatCalories,
  formatGrams,
  normalizeCaloriesInput,
  summarizeRecords,
} from '../js/calculations.js';

test('normalizeCaloriesInput accepts non-negative numeric values', () => {
  assert.deepEqual(normalizeCaloriesInput('520'), { ok: true, value: 520 });
  assert.deepEqual(normalizeCaloriesInput('0'), { ok: true, value: 0 });
  assert.deepEqual(normalizeCaloriesInput('42.5'), { ok: true, value: 42.5 });
});

test('normalizeCaloriesInput rejects blank, negative, and non-numeric values', () => {
  assert.equal(normalizeCaloriesInput('').ok, false);
  assert.equal(normalizeCaloriesInput('-1').ok, false);
  assert.equal(normalizeCaloriesInput('abc').ok, false);
});

test('normalizeCaloriesInput rejects non-plain decimal numeric formats', () => {
  assert.equal(normalizeCaloriesInput('0x10').ok, false);
  assert.equal(normalizeCaloriesInput('1e3').ok, false);
});

test('calculateFatGrams returns body fat and pure fat grams rounded to one decimal', () => {
  assert.deepEqual(calculateFatGrams(520), {
    bodyFatGrams: 67.6,
    pureFatGrams: 57.7,
  });
});

test('formatCalories rounds to two decimals without forced trailing zeros', () => {
  assert.equal(formatCalories(520), '520');
  assert.equal(formatCalories(520.25), '520.25');
});

test('formatGrams rounds to one decimal string', () => {
  assert.equal(formatGrams(67.64), '67.6');
  assert.equal(formatGrams(67.65), '67.7');
});

test('summarizeRecords totals calories and calculates grams from the total', () => {
  assert.deepEqual(
    summarizeRecords([
      { date: '2026-05-25', calories: 100 },
      { date: '2026-05-26', calories: 250.5 },
    ]),
    {
      totalCalories: 350.5,
      recordDays: 2,
      bodyFatGrams: 45.6,
      pureFatGrams: 38.9,
    },
  );
});
