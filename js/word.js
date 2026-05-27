import { WORD_COLUMNS } from './constants.js';
import {
  calculateFatGrams,
  formatCalories,
  formatGrams,
  summarizeRecords,
} from './calculations.js';
import { normalizeRecord, isWithinRetention, isValidDateKey } from './records.js';

export const WORD_TEMPLATE_MISMATCH = 'WORD_TEMPLATE_MISMATCH';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildExportRows(records) {
  if (!Array.isArray(records)) {
    throw new Error('Records must be an array.');
  }

  return records
    .map((record) => {
      const normalized = normalizeRecord(record);

      if (!normalized) {
        throw new Error('Invalid record.');
      }

      return normalized;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) => ({
      ...record,
      ...calculateFatGrams(record.calories),
    }));
}

function formatSummaryValue(value) {
  return escapeHtml(value);
}

export function buildWordHtml(records, exportedAt = new Date()) {
  if (!(exportedAt instanceof Date) || Number.isNaN(exportedAt.getTime())) {
    throw new Error('Invalid export date.');
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

export function buildWordBlob(records) {
  if (typeof Blob === 'undefined') {
    throw new Error('Blob is not available.');
  }

  return new Blob([`\uFEFF${buildWordHtml(records)}`], {
    type: 'application/msword;charset=utf-8',
  });
}

export function normalizeImportedRows(rows, { todayKey } = {}) {
  if (!Array.isArray(rows)) {
    throw new Error('Rows must be an array.');
  }

  if (!isValidDateKey(todayKey)) {
    throw new Error('Invalid today date key.');
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

function getCellText(cell) {
  return String(cell?.textContent ?? '').trim();
}

function getTableRows(table) {
  return Array.from(table?.rows ?? table?.querySelectorAll?.('tr') ?? []);
}

function getRowCells(row) {
  return Array.from(row?.cells ?? row?.querySelectorAll?.('th,td') ?? []);
}

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

export async function readWordFile(file, todayKey) {
  if (!file || typeof file.text !== 'function') {
    throw new Error('Invalid file.');
  }

  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is not available.');
  }

  const text = await file.text();
  const documentObject = new DOMParser().parseFromString(text, 'text/html');
  const rows = readRowsFromWordDocument(documentObject);

  return normalizeImportedRows(rows, { todayKey });
}
