export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function parseDateKey(dateKey) {
  const [year, month, date] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
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
  const date = parseDateKey(dateKey);
  date.setMonth(date.getMonth() - 6);

  return {
    startDate: toDateKey(date),
    endDate: dateKey,
  };
}

export function getRetentionCutoffDateKey(todayKey = toDateKey(new Date())) {
  const date = parseDateKey(todayKey);
  date.setFullYear(date.getFullYear() - 1);
  return toDateKey(date);
}

export function isDateKeyInRange(dateKey, startDate, endDate) {
  return dateKey >= startDate && dateKey <= endDate;
}

export function enumerateDateKeys(startDate, endDate) {
  const dates = [];

  for (let dateKey = startDate; dateKey <= endDate; dateKey = addDays(dateKey, 1)) {
    dates.push(dateKey);
  }

  return dates;
}
