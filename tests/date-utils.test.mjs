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

test('toDateKey rejects dates before supported YYYY years', () => {
  assert.throws(() => toDateKey(new Date(999, 0, 1)), /日期年份必须/);
});

test('toDateKey rejects dates after supported YYYY years', () => {
  assert.throws(() => toDateKey(new Date(10000, 0, 1)), /日期年份必须/);
});

test('toDateKey rejects invalid Date instances', () => {
  assert.throws(() => toDateKey(new Date('bad')), Error);
});

test('parseDateKey returns a local Date for the key', () => {
  const date = parseDateKey('2026-05-26');

  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 4);
  assert.equal(date.getDate(), 26);
});

test('parseDateKey rejects impossible dates instead of rolling them over', () => {
  assert.throws(() => parseDateKey('2026-02-31'), Error);
});

test('parseDateKey rejects non-string inputs', () => {
  const input = {
    toString() {
      throw new Error('should not stringify');
    },
  };

  assert.throws(() => parseDateKey(input), /日期格式必须/);
});

test('parseDateKey rejects unsupported years before 1000', () => {
  assert.throws(() => parseDateKey('0001-01-01'), Error);
  assert.throws(() => parseDateKey('0999-12-31'), Error);
});

test('parseDateKey rejects malformed and out-of-range date keys', () => {
  assert.throws(() => parseDateKey('2026-2-03'), Error);
  assert.throws(() => parseDateKey('2026-00-01'), Error);
  assert.throws(() => parseDateKey('2026-13-01'), Error);
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

test('getHalfYearRange clamps month-end dates when subtracting 6 months', () => {
  assert.deepEqual(getHalfYearRange('2026-08-31'), {
    startDate: '2026-02-28',
    endDate: '2026-08-31',
  });
  assert.deepEqual(getHalfYearRange('2026-03-31'), {
    startDate: '2025-09-30',
    endDate: '2026-03-31',
  });
});

test('getRetentionCutoffDateKey returns the same month and day one year earlier', () => {
  assert.equal(getRetentionCutoffDateKey('2026-05-26'), '2025-05-26');
});

test('getRetentionCutoffDateKey clamps leap day to the prior non-leap February end', () => {
  assert.equal(getRetentionCutoffDateKey('2024-02-29'), '2023-02-28');
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

test('isDateKeyInRange validates all date key inputs', () => {
  assert.throws(
    () => isDateKeyInRange('2026-02-31', '2026-02-01', '2026-03-01'),
    Error,
  );
  assert.throws(
    () => isDateKeyInRange('2026-02-01', 'bad', '2026-03-01'),
    Error,
  );
  assert.throws(
    () => isDateKeyInRange('2026-02-01', '2026-02-01', 'bad'),
    Error,
  );
});

test('isDateKeyInRange rejects reversed ranges', () => {
  assert.throws(
    () => isDateKeyInRange('2026-05-26', '2026-05-27', '2026-05-25'),
    /日期范围无效/,
  );
});

test('enumerateDateKeys validates both boundaries before enumeration', () => {
  assert.throws(() => enumerateDateKeys('bad', 'aaa'), Error);
  assert.throws(() => enumerateDateKeys('2026-02-31', '2026-02-01'), Error);
  assert.throws(() => enumerateDateKeys('2026-03-01', '2026-02-31'), Error);
});

test('enumerateDateKeys rejects reversed ranges', () => {
  assert.throws(() => enumerateDateKeys('2026-05-27', '2026-05-25'), /日期范围无效/);
});
