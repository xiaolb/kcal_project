export function pad2(value) {
  return String(value).padStart(2, '0');
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function subtractMonthsClamped(dateKey, months) {
  const date = parseDateKey(dateKey);
  const targetMonthIndex = date.getFullYear() * 12 + date.getMonth() - months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12 + 1;
  const targetDate = Math.min(date.getDate(), getDaysInMonth(targetYear, targetMonth));

  return toDateKey(new Date(targetYear, targetMonth - 1, targetDate));
}

function subtractYearsClamped(dateKey, years) {
  const date = parseDateKey(dateKey);
  const targetYear = date.getFullYear() - years;
  const targetMonth = date.getMonth() + 1;
  const targetDate = Math.min(date.getDate(), getDaysInMonth(targetYear, targetMonth));

  return toDateKey(new Date(targetYear, targetMonth - 1, targetDate));
}

export function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string') {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const [, yearText, monthText, dateText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dateText);

  if (year < 1000 || month < 1 || month > 12 || date < 1 || date > getDaysInMonth(year, month)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return new Date(year, month - 1, date);
}

export function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }

  const year = date.getFullYear();

  if (year < 1000 || year > 9999) {
    throw new Error('Invalid date key year');
  }

  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function addDays(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function getWeekRange(dateKey) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const startDate = addDays(dateKey, -daysFromMonday);

  return {
    startDate,
    endDate: addDays(startDate, 6),
  };
}

export function getMonthRange(dateKey) {
  const date = parseDateKey(dateKey);
  const year = date.getFullYear();
  const month = date.getMonth();

  return {
    startDate: toDateKey(new Date(year, month, 1)),
    endDate: toDateKey(new Date(year, month + 1, 0)),
  };
}

export function getHalfYearRange(dateKey) {
  return {
    startDate: subtractMonthsClamped(dateKey, 6),
    endDate: dateKey,
  };
}

export function getRetentionCutoffDateKey(todayKey = toDateKey(new Date())) {
  return subtractYearsClamped(todayKey, 1);
}

export function isDateKeyInRange(dateKey, startDate, endDate) {
  parseDateKey(dateKey);
  parseDateKey(startDate);
  parseDateKey(endDate);

  if (startDate > endDate) {
    throw new Error('Invalid date range');
  }

  return dateKey >= startDate && dateKey <= endDate;
}

export function enumerateDateKeys(startDate, endDate) {
  parseDateKey(startDate);
  parseDateKey(endDate);

  if (startDate > endDate) {
    throw new Error('Invalid date range');
  }

  const dates = [];

  for (let dateKey = startDate; dateKey <= endDate; dateKey = addDays(dateKey, 1)) {
    dates.push(dateKey);
  }

  return dates;
}
