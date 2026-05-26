import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  enumerateDateKeys,
  getHalfYearRange,
  getMonthRange,
  getRetentionCutoffDateKey,
  getWeekRange,
  isDateKeyInRange,
  parseDateKey,
  toDateKey,
} from '../js/date-utils.js';

test('toDateKey formats a local date as YYYY-MM-DD', () => {
  assert.equal(toDateKey(new Date(2026, 4, 26)), '2026-05-26');
});

test('parseDateKey returns a local Date for the key', () => {
  const date = parseDateKey('2026-05-26');

  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 4);
  assert.equal(date.getDate(), 26);
});

test('getWeekRange returns Monday through Sunday around the selected date', () => {
  assert.deepEqual(getWeekRange('2026-05-26'), {
    startDate: '2026-05-25',
    endDate: '2026-05-31',
  });
});

test('getMonthRange returns natural month boundaries including leap years', () => {
  assert.deepEqual(getMonthRange('2026-02-14'), {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  });
  assert.deepEqual(getMonthRange('2024-02-14'), {
    startDate: '2024-02-01',
    endDate: '2024-02-29',
  });
});

test('getHalfYearRange returns selected date minus 6 months through selected date', () => {
  assert.deepEqual(getHalfYearRange('2026-05-26'), {
    startDate: '2025-11-26',
    endDate: '2026-05-26',
  });
});

test('getRetentionCutoffDateKey returns the same month and day one year earlier', () => {
  assert.equal(getRetentionCutoffDateKey('2026-05-26'), '2025-05-26');
});

test('enumerateDateKeys includes start, middle, and end dates', () => {
  assert.deepEqual(enumerateDateKeys('2026-05-25', '2026-05-27'), [
    '2026-05-25',
    '2026-05-26',
    '2026-05-27',
  ]);
});

test('addDays offsets date keys and isDateKeyInRange includes boundaries', () => {
  assert.equal(addDays('2026-05-26', -1), '2026-05-25');
  assert.equal(addDays('2026-05-26', 1), '2026-05-27');

  assert.equal(isDateKeyInRange('2026-05-25', '2026-05-25', '2026-05-27'), true);
  assert.equal(isDateKeyInRange('2026-05-27', '2026-05-25', '2026-05-27'), true);
  assert.equal(isDateKeyInRange('2026-05-24', '2026-05-25', '2026-05-27'), false);
  assert.equal(isDateKeyInRange('2026-05-28', '2026-05-25', '2026-05-27'), false);
});
