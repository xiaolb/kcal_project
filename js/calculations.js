import {
  BODY_FAT_GRAMS_PER_CALORIE,
  PURE_FAT_GRAMS_PER_CALORIE,
} from './constants.js';

/**
 * 将数字按指定小数位四舍五入，避免常见浮点尾差。
 */
export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * 统一校验有限非负数字。
 */
function assertFiniteNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}必须是有限的非负数字。`);
  }
}

/**
 * 校验大卡数值是否可用于计算。
 */
function assertValidCalories(calories) {
  assertFiniteNonNegativeNumber(calories, '大卡');
}

/**
 * 校验并规范化用户输入的大卡值，返回可直接保存的数字。
 */
export function normalizeCaloriesInput(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    return { ok: false, error: '请输入普通的非负数字大卡。' };
  }

  const text = String(input).trim();

  if (text === '') {
    return { ok: false, error: '请输入大卡。' };
  }

  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return { ok: false, error: '请输入普通的非负数字大卡。' };
  }

  const value = Number(text);

  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: '大卡必须是非负数字。' };
  }

  return { ok: true, value };
}

/**
 * 根据大卡计算身体脂肪组织和理论纯脂肪的克数。
 */
export function calculateFatGrams(calories) {
  assertValidCalories(calories);

  return {
    bodyFatGrams: roundTo(calories * BODY_FAT_GRAMS_PER_CALORIE, 1),
    pureFatGrams: roundTo(calories * PURE_FAT_GRAMS_PER_CALORIE, 1),
  };
}

/**
 * 汇总记录总大卡、记录天数和两类脂肪换算值。
 */
export function summarizeRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('记录列表必须是数组。');
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

/**
 * 格式化大卡数值，最多保留两位小数且不强制补零。
 */
export function formatCalories(value) {
  assertValidCalories(value);

  return String(roundTo(value, 2));
}

/**
 * 格式化克数数值，固定保留一位小数。
 */
export function formatGrams(value) {
  assertFiniteNonNegativeNumber(value, '克数');

  return roundTo(value, 1).toFixed(1);
}
