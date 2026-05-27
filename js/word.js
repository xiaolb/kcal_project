import { WORD_COLUMNS } from './constants.js';
import {
  calculateFatGrams,
  formatCalories,
  formatGrams,
  summarizeRecords,
} from './calculations.js';
import { normalizeRecord, isWithinRetention, isValidDateKey } from './records.js';

export const WORD_TEMPLATE_MISMATCH = 'Word 文件格式不符合模板。';

/**
 * 转义 HTML 特殊字符，避免导出的 Word 表格内容破坏结构。
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 规范化导出记录，并补齐两类脂肪克数字段。
 */
export function buildExportRows(records) {
  if (!Array.isArray(records)) {
    throw new Error('记录列表必须是数组。');
  }

  return records
    .map((record) => {
      const normalized = normalizeRecord(record);

      if (!normalized) {
        throw new Error('记录格式无效。');
      }

      return normalized;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) => ({
      ...record,
      ...calculateFatGrams(record.calories),
    }));
}

/**
 * 格式化导出摘要值并转义 HTML。
 */
function formatSummaryValue(value) {
  return escapeHtml(value);
}

/**
 * 生成 Word 可打开的 HTML 文档内容。
 */
export function buildWordHtml(records, exportedAt = new Date()) {
  if (!(exportedAt instanceof Date) || Number.isNaN(exportedAt.getTime())) {
    throw new Error('导出时间无效。');
  }

  const rows = buildExportRows(records);
  const summary = summarizeRecords(rows);
  const dateRange = rows.length === 0
    ? ''
    : `${rows[0].date} - ${rows[rows.length - 1].date}`;
  const summaryRows = [
    ['exportedAt', exportedAt.toISOString()],
    ['dateRange', dateRange],
    ['recordDays', summary.recordDays],
    ['totalCalories', formatCalories(summary.totalCalories)],
    ['bodyFatGrams', formatGrams(summary.bodyFatGrams)],
    ['pureFatGrams', formatGrams(summary.pureFatGrams)],
  ];
  const headerHtml = WORD_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const rowHtml = rows
    .map((row) => {
      const cells = WORD_COLUMNS
        .map((column) => {
          const value = column === 'calories'
            ? formatCalories(row[column])
            : column === 'bodyFatGrams' || column === 'pureFatGrams'
              ? formatGrams(row[column])
              : row[column];

          return `<td>${escapeHtml(value)}</td>`;
        })
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');
  const summaryHtml = summaryRows
    .map(([label, value]) => (
      `<tr><th>${escapeHtml(label)}</th><td>${formatSummaryValue(value)}</td></tr>`
    ))
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Calorie Records Export</title>
<style>
table { border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 4px 8px; }
th { font-weight: bold; }
</style>
</head>
<body>
<h1>Calorie Records Export</h1>
<table>
<tbody>${summaryHtml}</tbody>
</table>
<table>
<thead><tr>${headerHtml}</tr></thead>
<tbody>${rowHtml}</tbody>
</table>
</body>
</html>`;
}

/**
 * 生成 application/msword Blob，用于浏览器下载。
 */
export function buildWordBlob(records) {
  if (typeof Blob === 'undefined') {
    throw new Error('当前浏览器不支持生成 Word 文件。');
  }

  return new Blob([`\uFEFF${buildWordHtml(records)}`], {
    type: 'application/msword;charset=utf-8',
  });
}

/**
 * 规范化从 Word 表格读取的行，只信任 date、calories、updatedAt。
 */
export function normalizeImportedRows(rows, { todayKey } = {}) {
  if (!Array.isArray(rows)) {
    throw new Error('导入行必须是数组。');
  }

  if (!isValidDateKey(todayKey)) {
    throw new Error('当前日期无效。');
  }

  const records = [];
  let invalidCount = 0;
  let expiredCount = 0;

  for (const row of rows) {
    const record = normalizeRecord({
      date: row?.date,
      calories: row?.calories,
      updatedAt: row?.updatedAt,
    });

    if (!record) {
      invalidCount += 1;
      continue;
    }

    if (!isWithinRetention(record.date, todayKey)) {
      expiredCount += 1;
      continue;
    }

    records.push(record);
  }

  return {
    records: records.sort((a, b) => a.date.localeCompare(b.date)),
    invalidCount,
    expiredCount,
  };
}

/**
 * 获取表格单元格的纯文本。
 */
function getCellText(cell) {
  return String(cell?.textContent ?? '').trim();
}

/**
 * 兼容真实 DOM 与测试替身，读取表格行。
 */
function getTableRows(table) {
  return Array.from(table?.rows ?? table?.querySelectorAll?.('tr') ?? []);
}

/**
 * 兼容真实 DOM 与测试替身，读取行内单元格。
 */
function getRowCells(row) {
  return Array.from(row?.cells ?? row?.querySelectorAll?.('th,td') ?? []);
}

/**
 * 从 Word HTML 文档中读取符合模板表头的数据行。
 */
export function readRowsFromWordDocument(documentObject) {
  const tables = Array.from(documentObject?.querySelectorAll?.('table') ?? []);

  for (const table of tables) {
    const rows = getTableRows(table);

    if (rows.length === 0) {
      continue;
    }

    const headerValues = getRowCells(rows[0]).map(getCellText);
    const hasAllColumns = WORD_COLUMNS.every((column) => headerValues.includes(column));

    if (!hasAllColumns) {
      continue;
    }

    const columnIndexes = new Map(
      WORD_COLUMNS.map((column) => [column, headerValues.indexOf(column)]),
    );

    return rows.slice(1).map((row) => {
      const cells = getRowCells(row);
      const output = {};

      for (const column of WORD_COLUMNS) {
        output[column] = getCellText(cells[columnIndexes.get(column)]);
      }

      return output;
    });
  }

  throw new Error(WORD_TEMPLATE_MISMATCH);
}

/**
 * 读取用户选择的 Word 文件并转成可合并的记录列表。
 */
export async function readWordFile(file, todayKey) {
  if (!file || typeof file.text !== 'function') {
    throw new Error('导入文件无效。');
  }

  if (typeof DOMParser === 'undefined') {
    throw new Error('当前浏览器不支持解析 Word 文件。');
  }

  const text = await file.text();
  const documentObject = new DOMParser().parseFromString(text, 'text/html');
  const rows = readRowsFromWordDocument(documentObject);

  return normalizeImportedRows(rows, { todayKey });
}
