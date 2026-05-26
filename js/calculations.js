import {
  BODY_FAT_GRAMS_PER_CALORIE,
  PURE_FAT_GRAMS_PER_CALORIE,
} from './constants.js';

export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normalizeCaloriesInput(input) {
  const text = String(input).trim();

  if (text === '') {
    return { ok: false, error: 'Calories are required.' };
  }

  const value = Number(text);

  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'Calories must be a non-negative number.' };
  }

  return { ok: true, value };
}

export function calculateFatGrams(calories) {
  return {
    bodyFatGrams: roundTo(calories * BODY_FAT_GRAMS_PER_CALORIE, 1),
    pureFatGrams: roundTo(calories * PURE_FAT_GRAMS_PER_CALORIE, 1),
  };
}

export function summarizeRecords(records) {
  const totalCalories = roundTo(
    records.reduce((total, record) => total + Number(record.calories || 0), 0),
    2,
  );

  return {
    totalCalories,
    recordDays: records.length,
    ...calculateFatGrams(totalCalories),
  };
}

export function formatCalories(value) {
  return String(roundTo(value, 2));
}

export function formatGrams(value) {
  return roundTo(value, 1).toFixed(1);
}
