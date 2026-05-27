import { normalizeCaloriesInput } from './calculations.js';
import {
  getRetentionCutoffDateKey,
  isDateKeyInRange,
  parseDateKey,
} from './date-utils.js';

/**
 * 判断值是否是合法的 YYYY-MM-DD 日期键。
 */
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

/**
 * 判断值是否是精确的 UTC ISO 更新时间。
 */
export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/**
 * 校验并规范化一条每日记录，非法记录返回 null。
 */
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

/**
 * 判断日期是否落在最近一年保留范围内。
 */
export function isWithinRetention(dateKey, todayKey) {
  if (!isValidDateKey(dateKey) || !isValidDateKey(todayKey)) {
    return false;
  }

  const cutoffDateKey = getRetentionCutoffDateKey(todayKey);
  return dateKey >= cutoffDateKey && dateKey <= todayKey;
}

/**
 * 过滤指定日期范围内的有效记录，并按日期升序返回。
 */
export function filterRecordsByRange(records, startDate, endDate) {
  if (!Array.isArray(records)) {
    throw new Error('记录列表必须是数组。');
  }

  isDateKeyInRange(startDate, startDate, endDate);

  return records
    .map((record) => normalizeRecord(record))
    .filter((record) => record && isDateKeyInRange(record.date, startDate, endDate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 比较两个更新时间字符串，无法解析时返回 null。
 */
function compareUpdatedAt(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return null;
  }

  return leftTime - rightTime;
}

/**
 * 合并导入记录；同日记录仅在导入更新时间更新时覆盖。
 */
export function mergeImportedRecords(existingRecords, importedRecords) {
  if (!Array.isArray(existingRecords) || !Array.isArray(importedRecords)) {
    throw new Error('本地记录和导入记录必须都是数组。');
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
