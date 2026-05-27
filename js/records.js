import { normalizeCaloriesInput } from './calculations.js';
import {
  getRetentionCutoffDateKey,
  isDateKeyInRange,
  parseDateKey,
} from './date-utils.js';

export function isValidDateKey(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    parseDateKey(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function normalizeRecord(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  if (!isValidDateKey(input.date) || !isValidIsoDate(input.updatedAt)) {
    return null;
  }

  const calories = normalizeCaloriesInput(input.calories);

  if (!calories.ok) {
    return null;
  }

  return {
    date: input.date,
    calories: calories.value,
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

export function isWithinRetention(dateKey, todayKey) {
  if (!isValidDateKey(dateKey) || !isValidDateKey(todayKey)) {
    return false;
  }

  const cutoffDateKey = getRetentionCutoffDateKey(todayKey);
  return dateKey >= cutoffDateKey && dateKey <= todayKey;
}

export function filterRecordsByRange(records, startDate, endDate) {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array.');
  }

  isDateKeyInRange(startDate, startDate, endDate);

  return records
    .map((record) => normalizeRecord(record))
    .filter((record) => record && isDateKeyInRange(record.date, startDate, endDate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function compareUpdatedAt(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return null;
  }

  return leftTime - rightTime;
}

export function mergeImportedRecords(existingRecords, importedRecords) {
  if (!Array.isArray(existingRecords) || !Array.isArray(importedRecords)) {
    throw new Error('Records must be arrays.');
  }

  const byDate = new Map();

  for (const record of existingRecords) {
    const normalized = normalizeRecord(record);

    if (normalized) {
      byDate.set(normalized.date, normalized);
    }
  }

  let insertedCount = 0;
  let overwrittenCount = 0;
  let skippedConflictCount = 0;

  for (const input of importedRecords) {
    const imported = normalizeRecord(input);

    if (!imported) {
      skippedConflictCount += 1;
      continue;
    }

    const existing = byDate.get(imported.date);

    if (!existing) {
      byDate.set(imported.date, imported);
      insertedCount += 1;
      continue;
    }

    const comparison = compareUpdatedAt(imported.updatedAt, existing.updatedAt);

    if (comparison === null || comparison <= 0) {
      skippedConflictCount += 1;
      continue;
    }

    byDate.set(imported.date, imported);
    overwrittenCount += 1;
  }

  return {
    records: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    insertedCount,
    overwrittenCount,
    skippedConflictCount,
  };
}
