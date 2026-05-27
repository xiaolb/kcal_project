import test from 'node:test';
import assert from 'node:assert/strict';

import { isValidIsoDate, mergeImportedRecords } from '../js/records.js';
import {
  buildWordHtml,
  normalizeImportedRows,
  readRowsFromWordDocument,
} from '../js/word.js';

test('buildWordHtml exports Word-compatible HTML with derived fat gram columns', () => {
  const html = buildWordHtml(
    [
      {
        date: '2026-05-26',
        calories: 520,
        updatedAt: '2026-05-26T10:00:00.000Z',
      },
    ],
    new Date('2026-05-26T12:00:00.000Z'),
  );

  for (const header of ['date', 'calories', 'updatedAt', 'bodyFatGrams', 'pureFatGrams']) {
    assert.match(html, new RegExp(`<th>${header}</th>`));
  }

  assert.match(html, /2026-05-26/);
  assert.match(html, /520/);
  assert.match(html, /67\.6/);
  assert.match(html, /57\.7/);
});

test('normalizeImportedRows ignores imported derived fat gram fields', () => {
  assert.deepEqual(
    normalizeImportedRows(
      [
        {
          date: '2026-05-26',
          calories: '520',
          updatedAt: '2026-05-26T10:00:00.000Z',
          bodyFatGrams: '999',
          pureFatGrams: '999',
        },
      ],
      { todayKey: '2026-05-26' },
    ),
    {
      records: [
        {
          date: '2026-05-26',
          calories: 520,
          updatedAt: '2026-05-26T10:00:00.000Z',
        },
      ],
      invalidCount: 0,
      expiredCount: 0,
    },
  );
});

test('normalizeImportedRows skips invalid and expired rows', () => {
  const result = normalizeImportedRows(
    [
      {
        date: 'bad-date',
        calories: '520',
        updatedAt: '2026-05-26T10:00:00.000Z',
      },
      {
        date: '2025-05-25',
        calories: '520',
        updatedAt: '2025-05-25T10:00:00.000Z',
      },
      {
        date: '2026-05-26',
        calories: '-1',
        updatedAt: '2026-05-26T10:00:00.000Z',
      },
    ],
    { todayKey: '2026-05-26' },
  );

  assert.deepEqual(result, {
    records: [],
    invalidCount: 2,
    expiredCount: 1,
  });
});

test('isValidIsoDate only accepts exact UTC ISO timestamps with real dates', () => {
  assert.equal(isValidIsoDate('2026-05-26T10:00:00.000Z'), true);
  assert.equal(isValidIsoDate('2026-02-30T10:00:00.000Z'), false);
  assert.equal(isValidIsoDate('2026-05-26'), false);
  assert.equal(isValidIsoDate('May 26 2026'), false);
  assert.equal(
    isValidIsoDate({
      toString() {
        return '2026-05-26T10:00:00.000Z';
      },
    }),
    false,
  );
});

test('normalizeImportedRows counts rows with invalid updatedAt as invalid', () => {
  assert.deepEqual(
    normalizeImportedRows(
      [
        {
          date: '2026-05-26',
          calories: '520',
          updatedAt: '2026-02-30T10:00:00.000Z',
        },
      ],
      { todayKey: '2026-05-26' },
    ),
    {
      records: [],
      invalidCount: 1,
      expiredCount: 0,
    },
  );
});

test('mergeImportedRecords inserts new records sorted by date', () => {
  assert.deepEqual(
    mergeImportedRecords(
      [
        {
          date: '2026-05-26',
          calories: 520,
          updatedAt: '2026-05-26T10:00:00.000Z',
        },
      ],
      [
        {
          date: '2026-05-25',
          calories: 310,
          updatedAt: '2026-05-25T10:00:00.000Z',
        },
      ],
    ),
    {
      records: [
        {
          date: '2026-05-25',
          calories: 310,
          updatedAt: '2026-05-25T10:00:00.000Z',
        },
        {
          date: '2026-05-26',
          calories: 520,
          updatedAt: '2026-05-26T10:00:00.000Z',
        },
      ],
      insertedCount: 1,
      overwrittenCount: 0,
      skippedConflictCount: 0,
    },
  );
});

test('mergeImportedRecords overwrites same-date records only when imported updatedAt is newer', () => {
  assert.deepEqual(
    mergeImportedRecords(
      [
        {
          date: '2026-05-26',
          calories: 520,
          updatedAt: '2026-05-26T10:00:00.000Z',
        },
      ],
      [
        {
          date: '2026-05-26',
          calories: 600,
          updatedAt: '2026-05-26T10:00:01.000Z',
        },
      ],
    ),
    {
      records: [
        {
          date: '2026-05-26',
          calories: 600,
          updatedAt: '2026-05-26T10:00:01.000Z',
        },
      ],
      insertedCount: 0,
      overwrittenCount: 1,
      skippedConflictCount: 0,
    },
  );
});

test('mergeImportedRecords skips older same-date records', () => {
  const existing = {
    date: '2026-05-26',
    calories: 520,
    updatedAt: '2026-05-26T10:00:00.000Z',
  };

  assert.deepEqual(
    mergeImportedRecords(
      [existing],
      [
        {
          date: '2026-05-26',
          calories: 600,
          updatedAt: '2026-05-26T09:59:59.000Z',
        },
      ],
    ),
    {
      records: [existing],
      insertedCount: 0,
      overwrittenCount: 0,
      skippedConflictCount: 1,
    },
  );
});

test('mergeImportedRecords skips same-date conflicts with unparseable updatedAt values', () => {
  const existing = {
    date: '2026-05-26',
    calories: 520,
    updatedAt: 'not-a-date',
  };

  assert.deepEqual(
    mergeImportedRecords(
      [existing],
      [
        {
          date: '2026-05-26',
          calories: 600,
          updatedAt: '2026-05-26T10:00:01.000Z',
        },
      ],
    ),
    {
      records: [existing],
      insertedCount: 0,
      overwrittenCount: 0,
      skippedConflictCount: 1,
    },
  );
});

test('readRowsFromWordDocument extracts rows from a DOM-like document table', () => {
  function cell(text) {
    return { textContent: text };
  }

  const documentObject = {
    querySelectorAll(selector) {
      assert.equal(selector, 'table');
      return [
        {
          rows: [
            {
              cells: [
                cell('date'),
                cell('calories'),
                cell('updatedAt'),
                cell('bodyFatGrams'),
                cell('pureFatGrams'),
              ],
            },
            {
              cells: [
                cell('2026-05-26'),
                cell('520'),
                cell('2026-05-26T10:00:00.000Z'),
                cell('999'),
                cell('999'),
              ],
            },
          ],
        },
      ];
    },
  };

  assert.deepEqual(readRowsFromWordDocument(documentObject), [
    {
      date: '2026-05-26',
      calories: '520',
      updatedAt: '2026-05-26T10:00:00.000Z',
      bodyFatGrams: '999',
      pureFatGrams: '999',
    },
  ]);
});
