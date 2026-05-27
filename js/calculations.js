import {
  BODY_FAT_GRAMS_PER_CALORIE,
  PURE_FAT_GRAMS_PER_CALORIE,
} from './constants.js';

export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function assertFiniteNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

function assertValidCalories(calories) {
  assertFiniteNonNegativeNumber(calories, 'Calories');
}

export function normalizeCaloriesInput(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    return { ok: false, error: 'Calories must be a plain non-negative decimal number.' };
  }

  const text = String(input).trim();

  if (text === '') {
    return { ok: false, error: 'Calories are required.' };
  }

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return { ok: false, error: 'Calories must be a plain non-negative decimal number.' };
  }

  const value = Number(text);

  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'Calories must be a non-negative number.' };
  }

  return { ok: true, value };
}

export function calculateFatGrams(calories) {
  assertValidCalories(calories);

  return {
    bodyFatGrams: roundTo(calories * BODY_FAT_GRAMS_PER_CALORIE, 1),
    pureFatGrams: roundTo(calories * PURE_FAT_GRAMS_PER_CALORIE, 1),
  };
}

export function summarizeRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array.');
  }

  const totalCalories = roundTo(
    records.reduce((total, record) => {
      assertValidCalories(record.calories);
      return total + record.calories;
    }, 0),
    2,
  );

  return {
    totalCalories,
    recordDays: records.length,
    ...calculateFatGrams(totalCalories),
  };
}

export function formatCalories(value) {
  assertValidCalories(value);

  return String(roundTo(value, 2));
}

export function formatGrams(value) {
  assertFiniteNonNegativeNumber(value, 'Grams');

  return roundTo(value, 1).toFixed(1);
}
